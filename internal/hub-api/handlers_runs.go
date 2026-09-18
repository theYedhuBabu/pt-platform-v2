package hubapi

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"pt-platform-v2/internal/database"
	hubclickhouse "pt-platform-v2/internal/hub-clickhouse"
	hubconfig "pt-platform-v2/internal/hub-config"
	hubws "pt-platform-v2/internal/hub-ws"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// CommandMessage is sent to agents when a run starts or stops.
type CommandMessage struct {
	Action        string            `json:"action"` // "start" | "stop"
	RunID         string            `json:"run_id"`
	RunMode       string            `json:"run_mode"`    // "single" | "distributed"
	AgentIndex    int               `json:"agent_index"` // 0-based
	TotalAgents   int               `json:"total_agents"`
	FrameworkType string            `json:"framework_type,omitempty"` // canonical tool: "jmeter" | "k6" | "gatling"
	ToolVersion   string            `json:"tool_version,omitempty"`   // FrameworkType Name slug, e.g. "jmeter-5.6"
	SharedURLs    map[string]string `json:"shared_urls,omitempty"`    // filename → URL (same for all agents)
	SplitURLs     map[string]string `json:"split_urls,omitempty"`     // filename → URL (agent-specific)
	JMeterParams  map[string]string `json:"jmeter_params,omitempty"`
}

// resolveTool maps a framework's ToolType (a FrameworkType Name slug) to the
// canonical tool agents match on, plus the slug as version info. Legacy
// fallback: row missing or Tool unset → (slug, "") — wire-identical to before
// the Tool column existed.
func resolveTool(toolType string, lookup func(string) (database.FrameworkType, error)) (tool, version string) {
	if toolType == "" {
		return "", ""
	}
	ft, err := lookup(toolType)
	if err != nil || ft.Tool == "" {
		return toolType, ""
	}
	return ft.Tool, ft.Name
}

type startRunReq struct {
	AgentIDs   []string `json:"agentIds"`
	Mode       string   `json:"mode"`       // "single" | "distributed"
	SplitFiles []string `json:"splitFiles"` // data files to split per agent (subset of Test.Artifacts.dataFiles)
}

func startRun(wsHub *hubws.Hub, cfg *hubconfig.Config, ch *hubclickhouse.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req startRunReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid request payload"})
			return
		}

		test, err := database.GetTestByID(c.Param("tid"))
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "test not found"})
			return
		}
		project, err := database.GetProjectByID(test.ProjectID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "project not found"})
			return
		}

		var framework database.Framework
		if test.FrameworkID != "" {
			framework, _ = database.GetFrameworkByID(test.FrameworkID)
		}

		mode := req.Mode
		if mode == "" {
			mode = "single"
		}
		// Single mode ships the package exactly as uploaded — split selection
		// only applies when the data is divided across multiple agents.
		if mode == "single" {
			req.SplitFiles = nil
		}

		splitFilesJSON, _ := json.Marshal(req.SplitFiles)
		agentsJSON, _ := json.Marshal(req.AgentIDs)
		now := time.Now().UTC().Format(time.RFC3339)
		run := database.Run{
			ID:         uuid.New().String(),
			TestID:     test.ID,
			Status:     "running",
			Mode:       mode,
			StartedAt:  now,
			Agents:     string(agentsJSON),
			SplitFiles: string(splitFilesJSON),
		}
		if err := database.InsertRun(run); err != nil {
			slog.Error("Failed to insert run", "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to create run"})
			return
		}

		// Upsert ClickHouse run metadata
		go ch.UpsertRunMetadata(runMetadata(run, test, project, framework, "running", time.Time{}))

		// Agents receive the framework package exactly as uploaded. The sole
		// exception: in distributed mode, files selected for splitting are
		// served via SplitURLs instead of SharedURLs.
		var sharedFiles, splitFiles []string
		if framework.ID != "" {
			allFiles, listErr := listFrameworkFiles(cfg.ScriptsDir, framework.ID)
			if listErr != nil {
				slog.Error("Failed to list framework files for run", "frameworkId", framework.ID, "error", listErr)
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to read framework files"})
				return
			}
			sharedFiles, splitFiles = partitionRunFiles(allFiles, req.SplitFiles)
		}

		// Split files are served whole — each agent downloads the full file and
		// slices it locally using its agent_index and total_agents.
		sharedURLs := buildFileURLs(sharedFiles, framework.ID, cfg.HubHost)
		splitURLs := buildFileURLs(splitFiles, framework.ID, cfg.HubHost)
		tool, toolVersion := resolveTool(framework.ToolType, database.GetFrameworkTypeByName)
		for i, agentID := range req.AgentIDs {
			cmd := CommandMessage{
				Action:        "start",
				RunID:         run.ID,
				RunMode:       mode,
				AgentIndex:    i,
				TotalAgents:   len(req.AgentIDs),
				FrameworkType: tool,
				ToolVersion:   toolVersion,
				SharedURLs:    sharedURLs,
				SplitURLs:     splitURLs,
				JMeterParams: map[string]string{
					"agentId": agentID,
					"runId":   run.ID,
					"script":  test.Script,
				},
			}
			payload, _ := json.Marshal(cmd)
			wsHub.SendCommand(agentID, payload)
		}

		slog.Info("Run started", "runId", run.ID, "agents", req.AgentIDs)
		c.JSON(http.StatusOK, gin.H{"success": true, "runId": run.ID})
	}
}

// runMetadata assembles a complete ClickHouse metadata row for a run. The
// run_metadata table is ReplacingMergeTree keyed on run_id, so every upsert
// must carry full fields — a partial row would replace and erase the rest.
func runMetadata(run database.Run, test database.Test, project database.Project, framework database.Framework, status string, stoppedAt time.Time) hubclickhouse.RunMetadata {
	startedAt, _ := time.Parse(time.RFC3339, run.StartedAt)
	tool, toolVersion := resolveTool(framework.ToolType, database.GetFrameworkTypeByName)
	return hubclickhouse.RunMetadata{
		RunID:         run.ID,
		TestID:        test.ID,
		TestName:      test.Name,
		FrameworkID:   framework.ID,
		FrameworkName: framework.Name,
		FrameworkType: tool,
		ToolVersion:   toolVersion,
		ProjectID:     project.ID,
		ProjectName:   project.Name,
		Environment:   project.Environment,
		Mode:          run.Mode,
		Agents:        run.Agents,
		Status:        status,
		StartedAt:     startedAt.UTC(),
		StoppedAt:     stoppedAt,
	}
}

// loadRunMetadata fetches the run's test/project/framework and delegates to
// runMetadata. For handlers that don't already have those entities loaded.
func loadRunMetadata(run database.Run, status string, stoppedAt time.Time) hubclickhouse.RunMetadata {
	test, _ := database.GetTestByID(run.TestID)
	project, _ := database.GetProjectByID(test.ProjectID)
	var framework database.Framework
	if test.FrameworkID != "" {
		framework, _ = database.GetFrameworkByID(test.FrameworkID)
	}
	return runMetadata(run, test, project, framework, status, stoppedAt)
}

func stopRun(wsHub *hubws.Hub, ch *hubclickhouse.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID := c.Param("rid")
		run, err := database.GetRunByID(runID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "run not found"})
			return
		}

		now := time.Now().UTC().Format(time.RFC3339)
		if err := database.UpdateRunStatus(runID, "stopped", now, ""); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to update run"})
			return
		}
		database.UpdateTestRunCache(run.TestID, "stopped", now)

		go ch.UpsertRunMetadata(loadRunMetadata(run, "stopped", time.Now().UTC()))

		// Send stop command to all agents in this run
		var agentIDs []string
		if err := json.Unmarshal([]byte(run.Agents), &agentIDs); err == nil {
			stopCmd, _ := json.Marshal(CommandMessage{Action: "stop", RunID: runID})
			for _, agentID := range agentIDs {
				wsHub.SendCommand(agentID, stopCmd)
			}
		}

		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

func getRunByID(c *gin.Context) {
	run, err := database.GetRunWithTestByID(c.Param("runId"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "run not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "run": run})
}

func getActiveRuns(c *gin.Context) {
	runs, err := database.GetActiveRuns()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "active": len(runs) > 0, "runs": runs})
}

// getHistory returns runs in PascalCase for the legacy History.tsx page.
func getHistory(cfg *hubconfig.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		runs, err := database.GetRunHistory()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}
		type legacyRun struct {
			ID         string `json:"ID"`
			ScriptName string `json:"ScriptName"`
			Status     string `json:"Status"`
			StartTime  string `json:"StartTime"`
			EndTime    string `json:"EndTime"`
			LogPath    string `json:"LogPath"`
		}
		result := make([]legacyRun, 0, len(runs))
		for _, r := range runs {
			logPath := ""
			if cfg.GrafanaBaseURL != "" && cfg.GrafanaDashUID != "" {
				logPath = fmt.Sprintf("%s/d/%s?var-test_name=%s", cfg.GrafanaBaseURL, cfg.GrafanaDashUID, r.ID)
			}
			result = append(result, legacyRun{
				ID:         r.ID,
				ScriptName: r.ScriptName,
				Status:     r.Status,
				StartTime:  r.StartedAt,
				EndTime:    r.CompletedAt,
				LogPath:    logPath,
			})
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
	}
}

// listFrameworkFiles walks the framework's directory and returns every file
// path relative to its root, using forward slashes. A missing directory is
// not an error — it yields an empty list.
func listFrameworkFiles(scriptsDir, frameworkID string) ([]string, error) {
	baseDir := filepath.Join(scriptsDir, "frameworks", frameworkID)
	var files []string
	err := filepath.WalkDir(baseDir, func(p string, d fs.DirEntry, werr error) error {
		if werr != nil || d.IsDir() {
			return nil
		}
		rel, relErr := filepath.Rel(baseDir, p)
		if relErr != nil {
			return relErr
		}
		files = append(files, filepath.ToSlash(rel))
		return nil
	})
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	return files, nil
}

// partitionRunFiles divides the framework package into shared and split
// files. Everything ships as uploaded except the files in splitSelection,
// which each agent slices for itself. Selected files missing from the
// package are ignored.
func partitionRunFiles(files, splitSelection []string) (shared, split []string) {
	splitSet := make(map[string]bool, len(splitSelection))
	for _, f := range splitSelection {
		splitSet[f] = true
	}
	for _, f := range files {
		if splitSet[f] {
			split = append(split, f)
		} else {
			shared = append(shared, f)
		}
	}
	return shared, split
}

// buildFileURLs converts a slice of filenames into a map[filename]URL.
func buildFileURLs(files []string, frameworkID, hubHost string) map[string]string {
	if len(files) == 0 {
		return nil
	}
	urls := make(map[string]string, len(files))
	for _, f := range files {
		urls[f] = fmt.Sprintf("%s/static/frameworks/%s/%s", hubHost, frameworkID, f)
	}
	return urls
}
