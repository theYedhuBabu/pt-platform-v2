package hubapi

import (
	"net/http"
	"time"

	hubclickhouse "pt-platform-v2/internal/hub-clickhouse"
	hubconfig "pt-platform-v2/internal/hub-config"
	hubws "pt-platform-v2/internal/hub-ws"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func SetupRouter(wsHub *hubws.Hub, cfg *hubconfig.Config, ch *hubclickhouse.Client) *gin.Engine {
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{cfg.CORSAllowedOrigin},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	r.GET("/ws", func(c *gin.Context) {
		hubws.ServeWs(wsHub, c.Writer, c.Request)
	})

	// Single-port reverse proxies: {host}/grafana and {host}/clickhouse.
	// Lets one ngrok tunnel front the hub, Grafana, and ClickHouse together.
	registerProxies(r, cfg)

	// Static framework asset serving for agent downloads

	r.GET("/static/frameworks/:fid/*assetPath", staticFrameworkAsset(cfg))

	api := r.Group("/api")
	{
		// Projects
		api.GET("/projects", getProjects)
		api.POST("/projects", createProject)
		api.GET("/projects/:id", getProjectByID(cfg))
		api.DELETE("/projects/:id", deleteProject)
		api.GET("/projects/:id/frameworks", getProjectFrameworks)
		api.POST("/projects/:id/tests", createTest)
		api.GET("/projects/:id/tests/:tid", getTestByID)
		api.DELETE("/projects/:id/tests/:tid", deleteTest)
		api.POST("/projects/:id/tests/:tid/run", startRun(wsHub, cfg, ch))

		// Frameworks (global)
		api.GET("/frameworks", getFrameworks)
		api.POST("/frameworks", createFramework(cfg))
		api.GET("/frameworks/:id", getFrameworkByID)
		api.DELETE("/frameworks/:id", deleteFramework)
		api.GET("/frameworks/:id/files", getFrameworkFiles(cfg))
		api.POST("/frameworks/:id/validate-entry", validateFrameworkEntry(cfg))

		// Runs
		api.GET("/run/active", getActiveRuns)
		api.GET("/runs/:runId", getRunByID)
		api.POST("/run/:rid/stop", stopRun(wsHub, ch))

		// Results (agent uploads)
		api.POST("/results/upload/:runId", uploadResults(cfg, ch))

		// History
		api.GET("/history", getHistory(cfg))

		// Agents
		api.GET("/agents", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"agents": wsHub.GetAgentIDs()})
		})

		// Settings
		api.GET("/settings/tools", getSupportedTools)
		api.GET("/settings/framework-types", getFrameworkTypes)
		api.POST("/settings/framework-types", createFrameworkType)
		api.PUT("/settings/framework-types/:name", updateFrameworkType)
		api.DELETE("/settings/framework-types/:name", deleteFrameworkTypeHandler)

		// File operations
		api.POST("/parse-jmx", parseJmx)
		api.POST("/upload/script", uploadScript(cfg))
	}

	return r
}
