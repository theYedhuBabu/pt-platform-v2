package agent

import (
	"crypto/rand"
	"encoding/hex"
	"flag"
	"os"
	"time"
)

const (
	// DownloadTimeout bounds a single framework-asset download.
	DownloadTimeout = 5 * time.Minute
	// DownloadSizeCap rejects any single downloaded file above this size.
	DownloadSizeCap = 500 << 20 // 500 MiB
)

// Config holds the agent's command-line configuration.
type Config struct {
	AgentID     string
	HubURL      string // WebSocket endpoint, e.g. ws://localhost:8080/ws
	WorkDir     string // per-run directories are created under here
	CSVHeader   bool   // treat the first line of split CSVs as a header replicated to every agent
	KeepWorkdir bool   // keep run directories after completion (debugging)
}

// LoadConfig parses flags. The default agent ID is {hostname}-{4hex} so
// multiple agents on one machine stay distinguishable.
func LoadConfig() Config {
	var cfg Config
	flag.StringVar(&cfg.AgentID, "id", "", "agent ID (default {hostname}-{4hex})")
	flag.StringVar(&cfg.HubURL, "hub", "ws://localhost:8080/ws", "hub WebSocket URL")
	flag.StringVar(&cfg.WorkDir, "workdir", "./runs", "directory for per-run workspaces")
	flag.BoolVar(&cfg.CSVHeader, "csv-header", true, "treat the first line of split CSVs as a header replicated to all agents")
	flag.BoolVar(&cfg.KeepWorkdir, "keep-workdir", false, "keep run directories after completion")
	flag.Parse()

	if cfg.AgentID == "" {
		cfg.AgentID = defaultAgentID()
	}
	return cfg
}

func defaultAgentID() string {
	host, err := os.Hostname()
	if err != nil || host == "" {
		host = "agent"
	}
	suffix := make([]byte, 2)
	rand.Read(suffix) //nolint:errcheck // crypto/rand.Read never fails on supported platforms
	return host + "-" + hex.EncodeToString(suffix)
}
