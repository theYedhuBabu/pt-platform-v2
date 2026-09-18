package agent

import (
	"fmt"
	"log/slog"
	"maps"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"sync/atomic"
)

// Sender is the slice of the WS client the runner needs; decoupled so tests
// can record messages without a socket.
type Sender interface {
	// Send is fire-and-forget: an error means the message is dropped.
	Send(v any) error
	// SendStatusReliable retries for a bounded window before giving up.
	SendStatusReliable(msg StatusMessage)
}

// Runner executes start/stop commands. Each run gets its own directory and
// process group, so concurrent runs are independent.
type Runner struct {
	cfg      Config
	sender   Sender
	httpBase string
	http     *http.Client

	mu     sync.Mutex
	active map[string]*activeRun
}

type activeRun struct {
	stopRequested atomic.Bool
	proc          atomic.Pointer[Process]
}

func NewRunner(cfg Config, sender Sender) (*Runner, error) {
	httpBase, err := HTTPBaseFromWS(cfg.HubURL)
	if err != nil {
		return nil, err
	}
	return &Runner{
		cfg:      cfg,
		sender:   sender,
		httpBase: httpBase,
		http:     &http.Client{Timeout: DownloadTimeout},
		active:   make(map[string]*activeRun),
	}, nil
}

// HandleCommand processes one hub command. The WS client dispatches each
// message in its own goroutine, so blocking here is fine.
func (r *Runner) HandleCommand(cmd CommandMessage) {
	switch cmd.Action {
	case "start":
		ar := &activeRun{}
		r.mu.Lock()
		if _, dup := r.active[cmd.RunID]; dup {
			r.mu.Unlock()
			slog.Warn("Duplicate start ignored", "run_id", cmd.RunID)
			return
		}
		r.active[cmd.RunID] = ar
		r.mu.Unlock()
		r.run(cmd, ar)

	case "stop":
		r.mu.Lock()
		ar := r.active[cmd.RunID]
		r.mu.Unlock()
		if ar == nil {
			// Hub already settled the run (or it never started here).
			slog.Info("Stop for unknown run", "run_id", cmd.RunID)
			return
		}
		slog.Info("Stop requested", "run_id", cmd.RunID)
		ar.stopRequested.Store(true)
		if proc := ar.proc.Load(); proc != nil {
			proc.Stop()
		}

	default:
		slog.Warn("Unknown command action", "action", cmd.Action, "run_id", cmd.RunID)
	}
}

// Shutdown stops all active runs and reports them failed, best-effort. Used
// on SIGINT/SIGTERM right before the process exits.
func (r *Runner) Shutdown() {
	r.mu.Lock()
	snapshot := make(map[string]*activeRun, len(r.active))
	maps.Copy(snapshot, r.active)
	r.mu.Unlock()

	for runID, ar := range snapshot {
		ar.stopRequested.Store(true)
		r.sender.Send(StatusMessage{ //nolint:errcheck // best-effort on shutdown
			RunID: runID, AgentID: r.cfg.AgentID,
			Status: "failed", Message: "agent shutting down",
		})
		if proc := ar.proc.Load(); proc != nil {
			proc.Stop()
		}
	}
}

// run executes the full pipeline for one start command. Order matters: no
// download before the jmeter binary is confirmed, no launch on a partial
// package, and no upload without a JTL (the hub waits for one per agent).
func (r *Runner) run(cmd CommandMessage, ar *activeRun) {
	runID := cmd.RunID
	defer func() {
		r.mu.Lock()
		delete(r.active, runID)
		r.mu.Unlock()
	}()

	logf := func(format string, args ...any) {
		line := fmt.Sprintf(format, args...)
		slog.Info("run log", "run_id", runID, "line", line)
		r.sender.Send(LogMessage{RunID: runID, AgentID: r.cfg.AgentID, LogLine: line}) //nolint:errcheck
	}
	fail := func(msg string) {
		slog.Error("Run failed", "run_id", runID, "reason", msg)
		r.sender.Send(LogMessage{RunID: runID, AgentID: r.cfg.AgentID, LogLine: "FATAL: " + msg}) //nolint:errcheck
		r.sender.SendStatusReliable(StatusMessage{RunID: runID, AgentID: r.cfg.AgentID, Status: "failed", Message: msg})
	}

	// 1. Preflight before any download.
	if cmd.FrameworkType != "jmeter" {
		fail(fmt.Sprintf("this agent only runs jmeter, got framework_type %q", cmd.FrameworkType))
		return
	}
	jmeterBin, err := ResolveJMeter()
	if err != nil {
		fail(err.Error())
		return
	}

	// 2. Tell the run UI we're alive.
	r.sender.SendStatusReliable(StatusMessage{RunID: runID, AgentID: r.cfg.AgentID, Status: "running"})

	// 3. Workspace. Absolute so JMeter arg paths are unambiguous regardless
	// of cmd.Dir.
	runDir, err := filepath.Abs(filepath.Join(r.cfg.WorkDir, runID))
	if err == nil {
		err = os.MkdirAll(runDir, 0755)
	}
	if err != nil {
		fail("failed to create run directory: " + err.Error())
		return
	}
	cleanup := func() {
		if r.cfg.KeepWorkdir {
			slog.Info("Keeping run directory", "run_id", runID, "dir", runDir)
			return
		}
		if err := Wipe(runDir); err != nil {
			slog.Warn("Failed to wipe run directory", "run_id", runID, "error", err)
		}
	}

	// 4. Download the package. Any miss aborts — never run a partial package.
	for rel, fileURL := range cmd.SharedURLs {
		if err := r.download(runDir, rel, fileURL); err != nil {
			fail(err.Error())
			cleanup()
			return
		}
	}

	// 5. Split files: download whole, then slice this agent's share in place.
	slice := cmd.RunMode != "single" && cmd.TotalAgents > 1
	for rel, fileURL := range cmd.SplitURLs {
		if err := r.download(runDir, rel, fileURL); err != nil {
			fail(err.Error())
			cleanup()
			return
		}
		if !slice {
			continue
		}
		dest, _ := SafeJoin(runDir, rel) // validated in download
		rows, err := SliceFileInPlace(dest, cmd.AgentIndex, cmd.TotalAgents, r.cfg.CSVHeader)
		if err != nil {
			fail(fmt.Sprintf("failed to slice %s: %v", rel, err))
			cleanup()
			return
		}
		if rows == 0 {
			logf("WARN: split file %s has no data rows for agent %d of %d", rel, cmd.AgentIndex+1, cmd.TotalAgents)
		}
	}

	// 6. Resolve the entry script.
	script := cmd.JMeterParams["script"]
	if script == "" {
		fail("no script in jmeter_params")
		cleanup()
		return
	}
	jmxPath, err := SafeJoin(runDir, script)
	if err == nil {
		_, err = os.Stat(jmxPath)
	}
	if err != nil {
		fail(fmt.Sprintf("entry script %s not usable: %v", script, err))
		cleanup()
		return
	}

	// 7. Launch.
	props := make(map[string]string, len(cmd.JMeterParams)+3)
	maps.Copy(props, cmd.JMeterParams)
	props["agent_index"] = strconv.Itoa(cmd.AgentIndex)
	props["total_agents"] = strconv.Itoa(cmd.TotalAgents)
	props["summariser.interval"] = "5"

	jtlPath := filepath.Join(runDir, "results.jtl")
	logPath := filepath.Join(runDir, "jmeter.log")
	args := BuildArgs(jmxPath, jtlPath, logPath, props)

	// 8. Every output line goes to the run UI; summariser lines also become
	// live metrics.
	onLine := func(line string) {
		r.sender.Send(LogMessage{RunID: runID, AgentID: r.cfg.AgentID, LogLine: line}) //nolint:errcheck
		if s, ok := ParseSummaryLine(line); ok {
			if data, emit := MetricFromSummary(s, runID, r.cfg.AgentID); emit {
				r.sender.Send(MetricMessage{Type: "metric", RunID: runID, Data: data}) //nolint:errcheck
			}
		}
	}

	if ar.stopRequested.Load() {
		// Stop raced the downloads; the hub already settled the run.
		slog.Info("Run stopped before launch", "run_id", runID)
		r.sender.Send(StatusMessage{RunID: runID, AgentID: r.cfg.AgentID, Status: "stopped"}) //nolint:errcheck
		cleanup()
		return
	}
	proc, err := StartProcess(jmeterBin, args, runDir, onLine)
	if err != nil {
		fail("failed to start jmeter: " + err.Error())
		cleanup()
		return
	}
	ar.proc.Store(proc)
	logf("INFO: jmeter started (pid %d) as agent %d of %d", proc.PID(), cmd.AgentIndex+1, cmd.TotalAgents)

	// 9. Wait for the test to finish.
	waitErr := proc.Wait()
	stopped := ar.stopRequested.Load()

	// 10. Outcome. No JTL → no upload: the hub finalizes a run only when
	// every agent directory has a .jtl, so uploading an empty archive would
	// hang the run forever.
	if !HasJTL(jtlPath) {
		msg := "jmeter produced no results"
		if waitErr != nil {
			msg = fmt.Sprintf("%s: %v", msg, waitErr)
		}
		fail(msg)
		cleanup()
		return
	}

	zipPath := filepath.Join(runDir, "results.zip")
	if err := ZipResults(zipPath, map[string]string{"results.jtl": jtlPath, "jmeter.log": logPath}); err != nil {
		fail("failed to archive results: " + err.Error())
		cleanup()
		return
	}
	if err := UploadResults(r.http, r.httpBase, runID, r.cfg.AgentID, zipPath); err != nil {
		fail(err.Error())
		cleanup()
		return
	}
	logf("INFO: results uploaded")

	switch {
	case stopped:
		// Partial results delivered; the hub keeps the run "stopped" (late
		// reports never overwrite a settled run).
		r.sender.SendStatusReliable(StatusMessage{RunID: runID, AgentID: r.cfg.AgentID, Status: "stopped"})
	case waitErr != nil:
		fail("jmeter exited with error: " + waitErr.Error())
	default:
		r.sender.SendStatusReliable(StatusMessage{RunID: runID, AgentID: r.cfg.AgentID, Status: "completed"})
	}

	// 11. Wipe unless kept for debugging.
	cleanup()
}

func (r *Runner) download(runDir, rel, fileURL string) error {
	dest, err := SafeJoin(runDir, rel)
	if err != nil {
		return fmt.Errorf("rejected path %s: %w", rel, err)
	}
	if err := DownloadFile(r.http, fileURL, dest, DownloadSizeCap); err != nil {
		return fmt.Errorf("failed to download %s: %w", rel, err)
	}
	return nil
}
