package main

import (
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"strings"

	"pt-platform-v2/internal/database"
	hubapi "pt-platform-v2/internal/hub-api"
	hubclickhouse "pt-platform-v2/internal/hub-clickhouse"
	hubconfig "pt-platform-v2/internal/hub-config"
	hubfrontend "pt-platform-v2/internal/hub-frontend"
	hubws "pt-platform-v2/internal/hub-ws"

	"github.com/gin-gonic/gin"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	slog.Info("Starting PT Platform Hub")

	cfg := hubconfig.Load()

	if err := database.InitializeDB(cfg.DBPath); err != nil {
		slog.Error("Failed to initialize database", "error", err)
		os.Exit(1)
	}
	database.ResetZombieRuns()

	chClient := hubclickhouse.NewClient(cfg)
	if err := chClient.CreateRunMetadataTable(); err != nil {
		slog.Warn("ClickHouse unavailable at startup — run metadata writes will fail", "error", err)
	}

	wsHub := hubws.NewHub()
	wsHub.OnAgentStatus = hubapi.AgentStatusHandler(wsHub, chClient)
	wsHub.OnAgentDisconnect = hubapi.AgentDisconnectHandler(wsHub, chClient)
	go wsHub.Run()

	router := hubapi.SetupRouter(wsHub, cfg, chClient)

	distFS, err := fs.Sub(hubfrontend.StaticFiles, "dist")
	if err != nil {
		slog.Error("Failed to access embedded frontend", "error", err)
		os.Exit(1)
	}

	indexHTML, err := fs.ReadFile(distFS, "index.html")
	if err != nil {
		slog.Error("Failed to read embedded index.html", "error", err)
		os.Exit(1)
	}

	router.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		if strings.HasPrefix(path, "/api") || strings.HasPrefix(path, "/ws") || strings.HasPrefix(path, "/static") {
			c.Status(http.StatusNotFound)
			return
		}
		// Serve existing dist assets (js, css, svg, etc.) directly via FileFromFS.
		// Exclude "index.html" explicitly — http.FileServer redirects /index.html → / causing a loop.
		cleanPath := strings.TrimPrefix(path, "/")
		if cleanPath != "" && cleanPath != "index.html" {
			if _, openErr := distFS.Open(cleanPath); openErr == nil {
				c.FileFromFS(cleanPath, http.FS(distFS))
				return
			}
		}
		// All other paths (including /) serve the SPA shell directly.
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexHTML)
	})

	if err := router.Run(cfg.HubPort); err != nil {
		slog.Error("Server failed", "error", err)
		os.Exit(1)
	}
}
