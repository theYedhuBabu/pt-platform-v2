package hubws

import (
	"encoding/json"
	"log/slog"
	"maps"
	"strings"
	"sync"
)

type DirectMessage struct {
	AgentID string
	Payload []byte
}

type Hub struct {
	Clients    map[string]*Client
	Broadcast  chan []byte
	Register   chan *Client
	Unregister chan *Client
	DirectSend chan DirectMessage
	clientsMu  sync.RWMutex

	// OnAgentStatus is invoked in its own goroutine when an agent reports a
	// run status over the socket. Optional; set before Run().
	OnAgentStatus func(runID, agentID, status string)
	// OnAgentDisconnect is invoked in its own goroutine when an agent's
	// connection is removed and no replacement connection holds the same ID.
	// Never fired for web-ui clients. Optional; set before Run().
	OnAgentDisconnect func(agentID string)
}

func NewHub() *Hub {
	return &Hub{
		Broadcast:  make(chan []byte),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		DirectSend: make(chan DirectMessage, 32),
		Clients:    make(map[string]*Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.clientsMu.Lock()
			h.Clients[client.AgentID] = client
			h.clientsMu.Unlock()
			slog.Info("Client registered", "agent_id", client.AgentID)

		case client := <-h.Unregister:
			h.clientsMu.Lock()
			removed := false
			if existing, ok := h.Clients[client.AgentID]; ok && existing == client {
				delete(h.Clients, client.AgentID)
				removed = true
				slog.Info("Client unregistered", "agent_id", client.AgentID)
			}
			h.clientsMu.Unlock()
			client.CloseSend()
			// A client evicted earlier (removed==false here) already triggered
			// the disconnect notification; a same-ID reconnect still in the map
			// means the agent isn't actually gone.
			if removed {
				h.notifyDisconnect(client.AgentID)
			}

		case dm := <-h.DirectSend:
			h.clientsMu.RLock()
			target, exists := h.Clients[dm.AgentID]
			h.clientsMu.RUnlock()
			if !exists {
				slog.Warn("Agent not found for direct send", "agent_id", dm.AgentID)
				continue
			}
			select {
			case target.Send <- dm.Payload:
			default:
				h.evict(dm.AgentID, target)
			}

		case message := <-h.Broadcast:
			var p struct {
				Type          string `json:"type"`
				RunID         string `json:"run_id"`
				AgentID       string `json:"agent_id"`
				LogLine       string `json:"log_line"`
				Status        string `json:"status"`
				TargetAgentID string `json:"targetAgentId"`
				Data          struct {
					RunID string `json:"run_id"`
				} `json:"data"`
			}

			if err := json.Unmarshal(message, &p); err != nil {
				h.broadcastAll(message)
				continue
			}

			switch {
			case p.TargetAgentID != "":
				h.clientsMu.RLock()
				target, ok := h.Clients[p.TargetAgentID]
				h.clientsMu.RUnlock()
				if ok {
					select {
					case target.Send <- message:
					default:
						h.evict(p.TargetAgentID, target)
					}
				} else {
					slog.Warn("Target agent not found", "agent_id", p.TargetAgentID)
				}
			case p.Type == "metric" && p.Data.RunID != "":
				h.sendToRunUI(p.Data.RunID, message)
			case p.LogLine != "" && p.RunID != "":
				h.sendToRunUI(p.RunID, message)
			case p.Status != "" && p.RunID != "":
				h.sendToRunUI(p.RunID, message)
				if h.OnAgentStatus != nil && p.AgentID != "" && p.AgentID != "SYSTEM" && !strings.HasPrefix(p.AgentID, "web-ui") {
					go h.OnAgentStatus(p.RunID, p.AgentID, p.Status)
				}
			default:
				h.broadcastAll(message)
			}
		}
	}
}

// evict removes a client whose Send buffer is full, closing its channel and
// notifying the disconnect hook. Safe against concurrent Unregister thanks to
// CloseSend idempotency.
func (h *Hub) evict(agentID string, client *Client) {
	h.clientsMu.Lock()
	if existing, ok := h.Clients[agentID]; ok && existing == client {
		delete(h.Clients, agentID)
	}
	h.clientsMu.Unlock()
	client.CloseSend()
	slog.Warn("Client evicted (send buffer full)", "agent_id", agentID)
	h.notifyDisconnect(agentID)
}

// notifyDisconnect fires OnAgentDisconnect for real agents whose ID is no
// longer connected (a same-ID reconnect suppresses the notification).
func (h *Hub) notifyDisconnect(agentID string) {
	if h.OnAgentDisconnect == nil || strings.HasPrefix(agentID, "web-ui") {
		return
	}
	h.clientsMu.RLock()
	_, stillConnected := h.Clients[agentID]
	h.clientsMu.RUnlock()
	if stillConnected {
		return
	}
	go h.OnAgentDisconnect(agentID)
}

// sendToRunUI routes a message to the web-ui client watching a specific run.
func (h *Hub) sendToRunUI(runID string, message []byte) {
	key := "web-ui-" + runID
	h.clientsMu.RLock()
	uiClient, ok := h.Clients[key]
	h.clientsMu.RUnlock()
	if !ok {
		return
	}
	select {
	case uiClient.Send <- message:
	default:
		h.evict(key, uiClient)
	}
}

func (h *Hub) broadcastAll(message []byte) {
	h.clientsMu.RLock()
	snapshot := make(map[string]*Client, len(h.Clients))
	maps.Copy(snapshot, h.Clients)
	h.clientsMu.RUnlock()

	for id, client := range snapshot {
		select {
		case client.Send <- message:
		default:
			h.evict(id, client)
		}
	}
}

// SendCommand pushes a payload to a specific agent. Safe to call from any goroutine.
func (h *Hub) SendCommand(agentID string, payload []byte) {
	h.DirectSend <- DirectMessage{AgentID: agentID, Payload: payload}
}

// GetAgentIDs returns a snapshot of connected agent IDs, excluding web-ui clients.
func (h *Hub) GetAgentIDs() []string {
	h.clientsMu.RLock()
	defer h.clientsMu.RUnlock()
	var ids []string
	for id := range h.Clients {
		if !strings.HasPrefix(id, "web-ui") {
			ids = append(ids, id)
		}
	}
	return ids
}
