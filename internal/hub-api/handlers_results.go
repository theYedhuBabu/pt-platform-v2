package hubapi

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"pt-platform-v2/internal/database"
	hubclickhouse "pt-platform-v2/internal/hub-clickhouse"
	hubconfig "pt-platform-v2/internal/hub-config"
	"pt-platform-v2/internal/tools/jmeter"

	"github.com/gin-gonic/gin"
)

// uploadResults receives a zipped JTL result archive from an agent after its
// portion of a run finishes. When every agent in the run has uploaded, the
// JTLs are merged, aggregate metrics computed and the run finalized.
func uploadResults(cfg *hubconfig.Config, ch *hubclickhouse.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID := c.Param("runId")
		agentID := c.Query("agentId")
		if agentID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "agentId query parameter is required"})
			return
		}
		if !safePathSegment(runID) || !safePathSegment(agentID) {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid runId or agentId"})
			return
		}

		run, err := database.GetRunByID(runID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "run not found"})
			return
		}

		file, err := c.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "zip file is required under 'file' form key"})
			return
		}

		agentDir := filepath.Join(cfg.ResultsDir, runID, agentID)
		if err := os.MkdirAll(agentDir, 0755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to create results directory"})
			return
		}
		zipDst := filepath.Join(agentDir, filepath.Base(file.Filename))
		if err := c.SaveUploadedFile(file, zipDst); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to save zip"})
			return
		}
		if err := unzip(zipDst, agentDir); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to unzip results: " + err.Error()})
			return
		}
		os.Remove(zipDst)
		slog.Info("Agent results received", "runId", runID, "agentId", agentID)

		if allAgentsUploaded(cfg, run) {
			finalizeRun(cfg, ch, run)
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "runId": runID})
	}
}

// allAgentsUploaded reports whether every agent in the run has usable results
// on disk. The agent directory alone isn't enough — it is created before the
// ZIP is extracted, so a failed upload would otherwise count as done.
func allAgentsUploaded(cfg *hubconfig.Config, run database.Run) bool {
	var agentIDs []string
	if err := json.Unmarshal([]byte(run.Agents), &agentIDs); err != nil || len(agentIDs) == 0 {
		return false
	}
	for _, id := range agentIDs {
		if !hasJTL(filepath.Join(cfg.ResultsDir, run.ID, id)) {
			return false
		}
	}
	return true
}

// hasJTL reports whether dir contains at least one .jtl file at any depth.
func hasJTL(dir string) bool {
	found := false
	filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error { //nolint:errcheck
		if err != nil || d.IsDir() {
			return nil
		}
		if strings.EqualFold(filepath.Ext(p), ".jtl") {
			found = true
			return fs.SkipAll
		}
		return nil
	})
	return found
}

// finalizeRun merges the per-agent JTLs, computes aggregate metrics and marks
// the run passed (or failed when results are unusable).
func finalizeRun(cfg *hubconfig.Config, ch *hubclickhouse.Client, run database.Run) {
	// Re-read status so a concurrent upload (or an earlier stop) doesn't
	// finalize the same run twice.
	current, err := database.GetRunByID(run.ID)
	if err != nil || current.Status != "running" {
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	jtls := collectJTLs(filepath.Join(cfg.ResultsDir, run.ID))

	status := "passed"
	mergedPath := filepath.Join(cfg.ResultsDir, run.ID, "results.jtl")
	stats, statsErr := mergeAndAggregate(jtls, mergedPath)
	if statsErr != nil {
		slog.Error("Failed to process run results", "runId", run.ID, "error", statsErr)
		status = "failed"
		database.UpdateRunStatus(run.ID, status, now, "")
	} else {
		database.UpdateRunResults(run.ID, status, now, stats.Duration.Round(time.Second).String(),
			stats.RPS, stats.ErrPct, stats.P95, stats.P99, stats.Samples)
	}
	database.UpdateTestRunCache(run.TestID, status, now)
	go ch.UpsertRunMetadata(loadRunMetadata(run, status, time.Now().UTC()))
	slog.Info("Run finalized", "runId", run.ID, "status", status)
}

func mergeAndAggregate(jtls []string, mergedPath string) (jmeter.RunStats, error) {
	if err := jmeter.MergeJTLs(jtls, mergedPath); err != nil {
		return jmeter.RunStats{}, err
	}
	return jmeter.AggregateJTL(mergedPath)
}

// collectJTLs returns all .jtl files under the run's agent directories,
// excluding any previously merged results.jtl at the top level.
func collectJTLs(runDir string) []string {
	var jtls []string
	filepath.WalkDir(runDir, func(p string, d fs.DirEntry, err error) error { //nolint:errcheck
		if err != nil || d.IsDir() {
			return nil
		}
		if strings.EqualFold(filepath.Ext(p), ".jtl") && filepath.Dir(p) != runDir {
			jtls = append(jtls, p)
		}
		return nil
	})
	return jtls
}

// safePathSegment rejects values that could escape their directory when used
// as a single path element.
func safePathSegment(s string) bool {
	return s != "" && s != "." && s != ".." &&
		!strings.ContainsAny(s, `/\`)
}

// unzip extracts src into dest, refusing entries that would escape dest.
func unzip(src, dest string) error {
	r, err := zip.OpenReader(src)
	if err != nil {
		return err
	}
	defer r.Close()

	destRoot := filepath.Clean(dest) + string(os.PathSeparator)
	for _, f := range r.File {
		target := filepath.Join(dest, f.Name)
		if !strings.HasPrefix(target, destRoot) {
			return fmt.Errorf("zip entry escapes destination: %s", f.Name)
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.Create(target)
		if err != nil {
			rc.Close()
			return err
		}
		if _, err := io.Copy(out, rc); err != nil {
			out.Close()
			rc.Close()
			return err
		}
		out.Close()
		rc.Close()
	}
	return nil
}
