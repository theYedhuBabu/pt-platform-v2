package hubapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"pt-platform-v2/internal/database"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type testCreateReq struct {
	Name               string          `json:"name"`
	Type               string          `json:"type"` // "native" | "external_imports"
	FrameworkID        string          `json:"frameworkId"`
	Script             string          `json:"scriptName"` // entry point path within framework
	Artifacts          json.RawMessage `json:"artifacts"`  // JSON: { configs, plugins, util, dataFiles }
	Version            string          `json:"version"`
	EnvName            string          `json:"envName"`
	CategoryID         string          `json:"categoryId"`
	SourceFile         string          `json:"sourceFile"`
	LinkedNativeTestID string          `json:"linkedNativeTestId"`
}

func createTest(c *gin.Context) {
	var req testCreateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid request payload"})
		return
	}
	if req.Name == "" || req.Type == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "name and type are required"})
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	t := database.Test{
		ID:                 uuid.New().String(),
		ProjectID:          c.Param("id"),
		FrameworkID:        req.FrameworkID,
		CategoryID:         req.CategoryID,
		Name:               req.Name,
		Type:               req.Type,
		Mode:               "none", // mode is a run-time decision, not a test property
		Script:             req.Script,
		Artifacts:          string(req.Artifacts),
		Version:            req.Version,
		EnvName:            req.EnvName,
		SourceFile:         req.SourceFile,
		LinkedNativeTestID: req.LinkedNativeTestID,
		CreatedAt:          now,
		UpdatedAt:          now,
		Status:             "ACTIVE",
	}
	if err := database.InsertTest(t); err != nil {
		slog.Error("Failed to insert test", "id", t.ID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to save test"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "id": t.ID})
}

func getTestByID(c *gin.Context) {
	t, err := database.GetTestByID(c.Param("tid"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "test not found"})
		return
	}
	runs, err := database.GetRunsByTest(t.ID)
	if err != nil {
		runs = []database.Run{}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "test": t, "runs": runs})
}

func deleteTest(c *gin.Context) {
	if _, err := database.DB.Exec(`DELETE FROM Tests WHERE ID=?`, c.Param("tid")); err != nil {
		slog.Error("Failed to delete test", "id", c.Param("tid"), "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to delete test"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
