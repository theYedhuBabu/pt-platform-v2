// Package agent implements the JMeter agent that connects to the hub over
// WebSocket, executes runs from CommandMessages and streams back logs,
// metrics and statuses.
package agent

// CommandMessage is the hub→agent command, mirroring the struct of the same
// name in internal/hub-api/handlers_runs.go. A "stop" carries only action and
// run_id.
type CommandMessage struct {
	Action        string            `json:"action"` // "start" | "stop"
	RunID         string            `json:"run_id"`
	RunMode       string            `json:"run_mode"` // "single" | "distributed"
	AgentIndex    int               `json:"agent_index"`
	TotalAgents   int               `json:"total_agents"`
	FrameworkType string            `json:"framework_type"` // canonical tool: "jmeter" | "k6" | "gatling"
	ToolVersion   string            `json:"tool_version"`   // FrameworkType Name slug, e.g. "jmeter-5.6"
	SharedURLs    map[string]string `json:"shared_urls"`    // relpath → URL, identical for all agents
	SplitURLs     map[string]string `json:"split_urls"`     // relpath → URL, full file; agent slices its share
	JMeterParams  map[string]string `json:"jmeter_params"`  // agentId, runId, script
}

// LogMessage routes to the run's web UI via the hub's log_line+run_id case.
type LogMessage struct {
	RunID   string `json:"run_id"`
	AgentID string `json:"agent_id"`
	LogLine string `json:"log_line"`
}

// StatusMessage routes to the run UI and is persisted by the hub's
// AgentStatusHandler when status is "failed" (success only ever comes from
// the results upload).
type StatusMessage struct {
	RunID   string `json:"run_id"`
	AgentID string `json:"agent_id"`
	Status  string `json:"status"` // "running" | "completed" | "failed" | "stopped"
	Message string `json:"message,omitempty"`
}

// MetricMessage carries one summariser interval. The hub routes metrics on
// data.run_id (not the top-level field), so MetricData repeats it.
type MetricMessage struct {
	Type  string     `json:"type"` // always "metric"
	RunID string     `json:"run_id"`
	Data  MetricData `json:"data"`
}

// MetricData matches the frontend's useAgentSocket MetricData shape.
// Requests and Errors are per-interval deltas — the UI sums them for totals
// and plots each message as a new point. Rate is the same window expressed as
// JMeter's own throughput (requests/sec), so the UI never has to divide by the
// summariser interval.
type MetricData struct {
	RunID         string  `json:"run_id"`
	AgentID       string  `json:"agent_id"`
	FrameworkType string  `json:"framework_type"` // "jmeter"
	Requests      int64   `json:"requests"`
	Errors        int64   `json:"errors"`
	Rate          float64 `json:"rate"` // throughput JMeter reports for the window (requests/sec)
	VUs           int     `json:"vus"`  // JMeter active threads
}
