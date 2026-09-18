package agent

import (
	"encoding/json"
	"testing"
)

// The hub's routing switch (internal/hub-ws/hub.go) and the frontend's
// useAgentSocket dispatch on exact JSON keys. These tests pin the wire
// format so a struct-tag change can't silently unroute messages.

func marshalToMap(t *testing.T, v any) map[string]any {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	return m
}

func TestLogMessageKeys(t *testing.T) {
	m := marshalToMap(t, LogMessage{RunID: "r1", AgentID: "a1", LogLine: "INFO hi"})
	for _, k := range []string{"run_id", "agent_id", "log_line"} {
		if _, ok := m[k]; !ok {
			t.Errorf("missing key %q", k)
		}
	}
	if m["log_line"] != "INFO hi" {
		t.Errorf("log_line = %v", m["log_line"])
	}
}

func TestStatusMessageKeys(t *testing.T) {
	m := marshalToMap(t, StatusMessage{RunID: "r1", AgentID: "a1", Status: "failed", Message: "boom"})
	for _, k := range []string{"run_id", "agent_id", "status", "message"} {
		if _, ok := m[k]; !ok {
			t.Errorf("missing key %q", k)
		}
	}

	// message must be omitted when empty — the hub forwards the raw bytes.
	m = marshalToMap(t, StatusMessage{RunID: "r1", AgentID: "a1", Status: "running"})
	if _, ok := m["message"]; ok {
		t.Error("empty message should be omitted")
	}
}

func TestMetricMessageKeys(t *testing.T) {
	m := marshalToMap(t, MetricMessage{
		Type:  "metric",
		RunID: "r1",
		Data:  MetricData{RunID: "r1", AgentID: "a1", FrameworkType: "jmeter", Requests: 42, Errors: 1, Rate: 8.4, VUs: 10},
	})
	if m["type"] != "metric" {
		t.Errorf("type = %v", m["type"])
	}
	data, ok := m["data"].(map[string]any)
	if !ok {
		t.Fatalf("data is not an object: %v", m["data"])
	}
	// The hub routes metrics on data.run_id, not the top-level run_id.
	for _, k := range []string{"run_id", "agent_id", "framework_type", "requests", "errors", "rate", "vus"} {
		if _, ok := data[k]; !ok {
			t.Errorf("missing data key %q", k)
		}
	}
}

func TestCommandMessageUnmarshal(t *testing.T) {
	// Shape produced by the hub's startRun (handlers_runs.go).
	payload := `{
		"action": "start",
		"run_id": "run-1",
		"run_mode": "distributed",
		"agent_index": 1,
		"total_agents": 3,
		"framework_type": "jmeter",
		"tool_version": "jmeter-5.6",
		"shared_urls": {"src/scripts/checkout.jmx": "http://hub/static/frameworks/f1/src/scripts/checkout.jmx"},
		"split_urls": {"src/data/users.csv": "http://hub/static/frameworks/f1/src/data/users.csv"},
		"jmeter_params": {"agentId": "a1", "runId": "run-1", "script": "src/scripts/checkout.jmx"}
	}`
	var cmd CommandMessage
	if err := json.Unmarshal([]byte(payload), &cmd); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if cmd.Action != "start" || cmd.RunID != "run-1" || cmd.AgentIndex != 1 || cmd.TotalAgents != 3 {
		t.Errorf("basic fields wrong: %+v", cmd)
	}
	if cmd.FrameworkType != "jmeter" || cmd.ToolVersion != "jmeter-5.6" {
		t.Errorf("tool fields wrong: %+v", cmd)
	}
	if cmd.SharedURLs["src/scripts/checkout.jmx"] == "" || cmd.SplitURLs["src/data/users.csv"] == "" {
		t.Errorf("url maps wrong: %+v", cmd)
	}
	if cmd.JMeterParams["script"] != "src/scripts/checkout.jmx" {
		t.Errorf("jmeter_params wrong: %+v", cmd.JMeterParams)
	}
}
