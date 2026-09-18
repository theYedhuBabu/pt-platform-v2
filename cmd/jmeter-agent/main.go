// jmeter-agent connects to the PT-Platform hub over WebSocket, executes
// JMeter runs it is assigned, and streams logs, live metrics and statuses
// back. Results are uploaded as a ZIP when the run ends.
//
// Usage:
//
//	jmeter-agent -id agent-1 -hub ws://localhost:8080/ws
//
// Requires the jmeter binary on PATH or JMETER_HOME set. Unix only.
package main

import (
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"pt-platform-v2/internal/agent"
)

func main() {
	cfg := agent.LoadConfig()
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	client, err := agent.NewClient(cfg.HubURL, cfg.AgentID)
	if err != nil {
		slog.Error("Invalid hub URL", "hub", cfg.HubURL, "error", err)
		os.Exit(1)
	}
	runner, err := agent.NewRunner(cfg, client)
	if err != nil {
		slog.Error("Invalid configuration", "error", err)
		os.Exit(1)
	}
	client.Handler = runner.HandleCommand

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		sig := <-sigCh
		slog.Info("Shutdown signal received", "signal", sig.String())
		runner.Shutdown()
		client.Close()
	}()

	slog.Info("jmeter-agent starting",
		"agent_id", cfg.AgentID,
		"hub", cfg.HubURL,
		"workdir", cfg.WorkDir,
		"csv_header", cfg.CSVHeader,
		"keep_workdir", cfg.KeepWorkdir,
	)
	client.Run() // blocks until Close
	slog.Info("jmeter-agent stopped")
}
