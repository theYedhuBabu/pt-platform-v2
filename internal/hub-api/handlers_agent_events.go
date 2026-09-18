package hubapi

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"slices"
	"time"

	"pt-platform-v2/internal/database"
	hubclickhouse "pt-platform-v2/internal/hub-clickhouse"
	hubws "pt-platform-v2/internal/hub-ws"
)

// AgentStatusHandler returns the hub callback that persists run status
// reported by agents over the WebSocket. Success is still driven solely by
// the results upload — only failure reports change run state here.
func AgentStatusHandler(wsHub *hubws.Hub, ch *hubclickhouse.Client) func(runID, agentID, status string) {
	return func(runID, agentID, status string) {
		if status != "failed" {
			return
		}
		failRun(wsHub, ch, runID, fmt.Sprintf("agent %s reported failure", agentID))
	}
}

// AgentDisconnectHandler returns the hub callback that fails any active run
// the departed agent was part of. Fired only when no replacement connection
// holds the agent's ID, so a clean reconnect does not kill the run.
func AgentDisconnectHandler(wsHub *hubws.Hub, ch *hubclickhouse.Client) func(agentID string) {
	return func(agentID string) {
		runs, err := database.GetActiveRuns()
		if err != nil {
			slog.Error("Failed to load active runs on agent disconnect", "agentId", agentID, "error", err)
			return
		}
		for _, r := range runs {
			if runIncludesAgent(r.Agents, agentID) {
				failRun(wsHub, ch, r.ID, fmt.Sprintf("agent %s disconnected mid-run", agentID))
			}
		}
	}
}

// runIncludesAgent reports whether the run's Agents JSON array contains agentID.
func runIncludesAgent(agentsJSON, agentID string) bool {
	var ids []string
	if err := json.Unmarshal([]byte(agentsJSON), &ids); err != nil {
		return false
	}
	return slices.Contains(ids, agentID)
}

// failRun marks a still-running run as failed, updates the test cache and
// ClickHouse, and notifies the run's live UI. No-op for runs already settled
// (passed/stopped/failed) so late reports never overwrite a final state.
func failRun(wsHub *hubws.Hub, ch *hubclickhouse.Client, runID, reason string) {
	run, err := database.GetRunByID(runID)
	if err != nil {
		slog.Warn("Failure reported for unknown run", "runId", runID, "reason", reason)
		return
	}
	if run.Status != "running" {
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	if err := database.UpdateRunStatus(runID, "failed", now, ""); err != nil {
		return
	}
	database.UpdateTestRunCache(run.TestID, "failed", now)
	go ch.UpsertRunMetadata(loadRunMetadata(run, "failed", time.Now().UTC()))
	slog.Warn("Run marked failed", "runId", runID, "reason", reason)

	if wsHub != nil {
		notice, _ := json.Marshal(map[string]string{
			"run_id":   runID,
			"status":   "failed",
			"agent_id": "SYSTEM",
			"reason":   reason,
		})
		wsHub.SendCommand("web-ui-"+runID, notice)
	}
}
