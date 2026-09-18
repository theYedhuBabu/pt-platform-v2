package hubws

import (
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Client struct {
	Hub     *Hub
	AgentID string
	Conn    *websocket.Conn
	Send    chan []byte

	closeOnce sync.Once
}

// CloseSend closes the Send channel exactly once. Multiple hub paths can race
// to evict the same client (slow-consumer eviction vs. Unregister), so the
// close must be idempotent.
func (c *Client) CloseSend() {
	c.closeOnce.Do(func() { close(c.Send) })
}

func (c *Client) readPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()
	c.Conn.SetReadLimit(10 * 1024 * 1024)
	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				slog.Error("WebSocket unexpected close", "error", err)
			}
			break
		}
		c.Hub.Broadcast <- message
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)
			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// ServeWs upgrades the HTTP connection and registers the client with the hub.
func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	agentID := r.URL.Query().Get("agentId")
	if agentID == "" {
		slog.Warn("WebSocket connection missing agentId")
		http.Error(w, "agentId required", http.StatusBadRequest)
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("WebSocket upgrade failed", "error", err)
		return
	}
	client := &Client{
		Hub:     hub,
		AgentID: agentID,
		Conn:    conn,
		Send:    make(chan []byte, 256),
	}
	hub.Register <- client
	go client.writePump()
	go client.readPump()
}
