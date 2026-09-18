package hubws

import "testing"

// CloseSend must be idempotent: slow-consumer eviction and Unregister can
// both try to close the same client's channel.
func TestCloseSendIdempotent(t *testing.T) {
	c := &Client{Send: make(chan []byte, 1)}
	c.CloseSend()
	c.CloseSend() // second close must not panic

	if _, ok := <-c.Send; ok {
		t.Error("Send channel must be closed")
	}
}

// notifyDisconnect must not fire for web-ui clients or when a reconnected
// client holds the same agent ID, and must fire when the agent is gone.
func TestNotifyDisconnect(t *testing.T) {
	fired := make(chan string, 1)
	h := NewHub()
	h.OnAgentDisconnect = func(agentID string) { fired <- agentID }

	h.notifyDisconnect("web-ui-run-1")
	select {
	case id := <-fired:
		t.Fatalf("web-ui client must not trigger disconnect, got %q", id)
	default:
	}

	h.Clients["agent-1"] = &Client{Send: make(chan []byte, 1)}
	h.notifyDisconnect("agent-1")
	select {
	case id := <-fired:
		t.Fatalf("still-connected agent must not trigger disconnect, got %q", id)
	default:
	}

	delete(h.Clients, "agent-1")
	h.notifyDisconnect("agent-1")
	if id := <-fired; id != "agent-1" {
		t.Errorf("fired for %q, want agent-1", id)
	}
}
