package hubconfig

import "os"

type Config struct {
	DBPath             string
	HubPort            string
	HubHost            string // base URL agents use to download assets, e.g. http://hub-host:8080
	CORSAllowedOrigin  string
	ScriptsDir         string // local path where framework assets are stored
	ResultsDir         string // local path where agent result uploads are stored
	ClickHouseURL      string
	ClickHouseUser     string
	ClickHousePassword string
	GrafanaBaseURL     string
	GrafanaDashUID     string
}

func Load() *Config {
	return &Config{
		DBPath:             getEnv("DB_PATH", "internal/database/data/hub.db"),
		HubPort:            getEnv("HUB_PORT", ":8080"),
		HubHost:            getEnv("HUB_HOST", "http://localhost:8080"),
		CORSAllowedOrigin:  getEnv("CORS_ALLOWED_ORIGIN", "http://localhost:5173"),
		ScriptsDir:         getEnv("SCRIPTS_DIR", "data/scripts"),
		ResultsDir:         getEnv("RESULTS_DIR", "data/results"),
		ClickHouseURL:      getEnv("CLICKHOUSE_URL", "http://localhost:8123"),
		ClickHouseUser:     getEnv("CLICKHOUSE_USER", "admin"),
		ClickHousePassword: getEnv("CLICKHOUSE_PASSWORD", "admin123"),
		GrafanaBaseURL:     getEnv("GRAFANA_BASE_URL", "http://localhost:3000"),
		GrafanaDashUID:     getEnv("GRAFANA_RUN_DASHBOARD_UID", ""),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
