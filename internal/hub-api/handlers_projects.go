package hubapi

import (
	"log/slog"
	"net/http"
	"time"

	"pt-platform-v2/internal/database"
	hubconfig "pt-platform-v2/internal/hub-config"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type responseProjectList struct {
	database.Project
	TestCount int `json:"testCount"`
}

func getProjects(c *gin.Context) {
	projects, err := database.GetProjects()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	resp := make([]responseProjectList, 0, len(projects))
	for _, p := range projects {
		resp = append(resp, responseProjectList{Project: p, TestCount: database.CountTestsByProject(p.ID)})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": resp})
}

// getProjectByID returns the project shaped to match the TypeScript Project interface,
// including field aliases (owner, created) and embedded tests/frameworks/categories.
func getProjectByID(cfg *hubconfig.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		p, err := database.GetProjectByID(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "project not found"})
			return
		}
		tests, err := database.GetTestsByProject(p.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}
		frameworks, err := database.GetFrameworksByProject(p.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}
		created := p.CreatedAt
		if len(created) >= 10 {
			created = created[:10]
		}
		proj := gin.H{
			"id":          p.ID,
			"name":        p.Name,
			"key":         p.Key,
			"owner":       p.Client, // TS interface uses "owner", DB stores as "client"
			"env":         p.Environment,
			"description": p.Description,
			"created":     created,
			"createdAt":   p.CreatedAt,
			"status":      p.Status,
			"frameworks":  frameworks,
			"tests":       tests,
			"categories":  []struct{}{},
		}
		c.JSON(http.StatusOK, gin.H{
			"success":    true,
			"project":    proj,
			"tests":      tests,
			"frameworks": frameworks,
			"testCount":  len(tests),
		})
	}
}

type projectCreateReq struct {
	Name        string `json:"name"`
	Client      string `json:"client"`
	Environment string `json:"env"`
	Key         string `json:"key"`
	Description string `json:"description"`
}

func createProject(c *gin.Context) {
	var req projectCreateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid request payload"})
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	p := database.Project{
		ID:          uuid.New().String(),
		Name:        req.Name,
		Client:      req.Client,
		Description: req.Description,
		Environment: req.Environment,
		Key:         req.Key,
		CreatedAt:   now,
		UpdatedAt:   now,
		Status:      "ACTIVE",
	}
	if err := database.InsertProject(p); err != nil {
		slog.Error("Failed to insert project", "id", p.ID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to save project"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "id": p.ID})
}

func deleteProject(c *gin.Context) {
	if _, err := database.DB.Exec(`DELETE FROM Projects WHERE ID=?`, c.Param("id")); err != nil {
		slog.Error("Failed to delete project", "id", c.Param("id"), "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to delete project"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func getProjectFrameworks(c *gin.Context) {
	frameworks, err := database.GetFrameworksByProject(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": frameworks})
}
