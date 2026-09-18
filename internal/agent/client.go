package agent

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/url"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// readTimeout must comfortably exceed the hub's 54s ping interval; the
	// ping handler refreshes the deadline.
	readTimeout  = 120 * time.Second
	writeTimeout = 10 * time.Second

	reconnectBase = time.Second
	reconnectMax  = 30 * time.Second

	statusRetryInterval = 2 * time.Second
	statusRetryWindow   = 60 * time.Second
)

// Client maintains the WebSocket connection to the hub, reconnecting
// forever, and dispatches incoming CommandMessages to Handler.
type Client struct {
	wsURL string

	// Handler receives each hub command in its own goroutine. Set before Run.
	Handler func(CommandMessage)

	connMu sync.Mutex
	conn   *websocket.Conn // nil while disconnected

	writeMu   sync.Mutex // single writer: gorilla allows one concurrent writer
	done      chan struct{}
	closeOnce sync.Once
}

func NewClient(hubURL, agentID string) (*Client, error) {
	u, err := url.Parse(hubURL)
	if err != nil {
		return nil, err
	}
	q := u.Query()
	q.Set("agentId", agentID)
	u.RawQuery = q.Encode()
	return &Client{wsURL: u.String(), done: make(chan struct{})}, nil
}

// Run connects and reads until Close. Backoff starts at 1s, doubles to a 30s
// cap, and resets on every successful connect.
func (c *Client) Run() {
	backoff := reconnectBase
	for {
		select {
		case <-c.done:
			return
		default:
		}

		conn, _, err := websocket.DefaultDialer.Dial(c.wsURL, nil)
		if err != nil {
			slog.Warn("Hub connection failed", "error", err, "retry_in", backoff)
			select {
			case <-c.done:
				return
			case <-time.After(backoff):
			}
			backoff = min(backoff*2, reconnectMax)
			continue
		}

		slog.Info("Connected to hub", "url", c.wsURL)
		backoff = reconnectBase
		c.setConn(conn)
		c.readLoop(conn)
		c.setConn(nil)
		conn.Close()

		select {
		case <-c.done:
			return
		default:
			slog.Warn("Hub connection lost, reconnecting")
		}
	}
}

func (c *Client) readLoop(conn *websocket.Conn) {
	conn.SetReadDeadline(time.Now().Add(readTimeout)) //nolint:errcheck
	conn.SetPingHandler(func(appData string) error {
		conn.SetReadDeadline(time.Now().Add(readTimeout)) //nolint:errcheck
		// WriteControl is safe to call concurrently with other writes.
		return conn.WriteControl(websocket.PongMessage, []byte(appData), time.Now().Add(writeTimeout))
	})

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			select {
			case <-c.done:
			default:
				slog.Warn("Hub read error", "error", err)
			}
			return
		}
		var cmd CommandMessage
		if err := json.Unmarshal(message, &cmd); err != nil {
			slog.Warn("Unparseable hub message", "error", err)
			continue
		}
		if cmd.Action == "" {
			// Hub broadcast (log/status echo) — not addressed to agents.
			continue
		}
		if c.Handler != nil {
			go c.Handler(cmd)
		}
	}
}

func (c *Client) setConn(conn *websocket.Conn) {
	c.connMu.Lock()
	c.conn = conn
	c.connMu.Unlock()
}

// Send writes v as JSON, fire-and-forget: while disconnected it returns an
// error and the message is dropped (logs/metrics tolerate gaps).
func (c *Client) Send(v any) error {
	c.connMu.Lock()
	conn := c.conn
	c.connMu.Unlock()
	if conn == nil {
		return errors.New("not connected to hub")
	}
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	conn.SetWriteDeadline(time.Now().Add(writeTimeout)) //nolint:errcheck
	return conn.WriteJSON(v)
}

// SendStatusReliable retries a status message until it is sent or the retry
// window lapses — statuses decide run outcomes, so they get more effort than
// logs and metrics.
func (c *Client) SendStatusReliable(msg StatusMessage) {
	deadline := time.Now().Add(statusRetryWindow)
	for {
		if err := c.Send(msg); err == nil {
			return
		}
		if time.Now().After(deadline) {
			slog.Error("Dropping status after retries", "run_id", msg.RunID, "status", msg.Status)
			return
		}
		select {
		case <-c.done:
			return
		case <-time.After(statusRetryInterval):
		}
	}
}

// Close stops Run and closes the current connection.
func (c *Client) Close() {
	c.closeOnce.Do(func() { close(c.done) })
	c.connMu.Lock()
	if c.conn != nil {
		c.conn.Close()
	}
	c.connMu.Unlock()
}
