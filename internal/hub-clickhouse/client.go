package hubclickhouse

import (
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	hubconfig "pt-platform-v2/internal/hub-config"
)

type Client struct {
	baseURL    string
	user       string
	password   string
	httpClient *http.Client
}

type RunMetadata struct {
	RunID         string    `json:"run_id"`
	TestID        string    `json:"test_id"`
	TestName      string    `json:"test_name"`
	FrameworkID   string    `json:"framework_id"`
	FrameworkName string    `json:"framework_name"`
	FrameworkType string    `json:"framework_type"` // canonical tool: "jmeter" | "k6" | "gatling"
	ToolVersion   string    `json:"tool_version"`   // FrameworkType Name slug, e.g. "jmeter-5.6"
	ProjectID     string    `json:"project_id"`
	ProjectName   string    `json:"project_name"`
	Environment   string    `json:"environment"`
	Mode          string    `json:"mode"`
	Agents        string    `json:"agents"`
	Status        string    `json:"status"`
	StartedAt     time.Time `json:"started_at"`
	StoppedAt     time.Time `json:"stopped_at"`
}

func NewClient(cfg *hubconfig.Config) *Client {
	return &Client{
		baseURL:    cfg.ClickHouseURL,
		user:       cfg.ClickHouseUser,
		password:   cfg.ClickHousePassword,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (c *Client) CreateRunMetadataTable() error {
	ddl := `CREATE TABLE IF NOT EXISTS metrics.run_metadata (
		run_id          String,
		test_id         String,
		test_name       String,
		framework_id    String,
		framework_name  String,
		framework_type  LowCardinality(String),
		tool_version    LowCardinality(String) DEFAULT '',
		project_id      String,
		project_name    String,
		environment     LowCardinality(String),
		mode            LowCardinality(String),
		agents          String,
		status          LowCardinality(String),
		started_at      DateTime,
		stopped_at      DateTime DEFAULT toDateTime(0)
	) ENGINE = ReplacingMergeTree(stopped_at)
	ORDER BY (run_id)`

	if err := c.execQuery(ddl); err != nil {
		slog.Error("Failed to create run_metadata table", "error", err)
		return err
	}
	// Self-heal tables created before tool_version existed (CREATE IF NOT
	// EXISTS never alters); no-op once the column is present.
	alter := `ALTER TABLE metrics.run_metadata
		ADD COLUMN IF NOT EXISTS tool_version LowCardinality(String) DEFAULT '' AFTER framework_type`
	if err := c.execQuery(alter); err != nil {
		slog.Error("Failed to add tool_version column to run_metadata", "error", err)
		return err
	}
	slog.Info("ClickHouse run_metadata table ready")
	return nil
}

func (c *Client) UpsertRunMetadata(m RunMetadata) error {
	stoppedAt := "1970-01-01 00:00:00"
	if !m.StoppedAt.IsZero() && m.StoppedAt.Unix() > 0 {
		stoppedAt = m.StoppedAt.UTC().Format("2006-01-02 15:04:05")
	}

	row := fmt.Sprintf(
		`{"run_id":%q,"test_id":%q,"test_name":%q,"framework_id":%q,"framework_name":%q,"framework_type":%q,"tool_version":%q,"project_id":%q,"project_name":%q,"environment":%q,"mode":%q,"agents":%q,"status":%q,"started_at":%q,"stopped_at":%q}`,
		m.RunID, m.TestID, m.TestName,
		m.FrameworkID, m.FrameworkName, m.FrameworkType, m.ToolVersion,
		m.ProjectID, m.ProjectName, m.Environment, m.Mode,
		m.Agents, m.Status,
		m.StartedAt.UTC().Format("2006-01-02 15:04:05"),
		stoppedAt,
	)

	query := "INSERT INTO metrics.run_metadata FORMAT JSONEachRow"
	if err := c.execInsert(query, row); err != nil {
		slog.Error("Failed to upsert run metadata", "run_id", m.RunID, "error", err)
		return err
	}
	return nil
}

func (c *Client) execQuery(query string) error {
	req, err := http.NewRequest(http.MethodPost, c.baseURL+"/", strings.NewReader(query))
	if err != nil {
		return err
	}
	req.SetBasicAuth(c.user, c.password)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("clickhouse error %d: %s", resp.StatusCode, body)
	}
	return nil
}

func (c *Client) execInsert(query, body string) error {
	u := c.baseURL + "/?query=" + url.QueryEscape(query)
	req, err := http.NewRequest(http.MethodPost, u, strings.NewReader(body))
	if err != nil {
		return err
	}
	req.SetBasicAuth(c.user, c.password)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("clickhouse insert error %d: %s", resp.StatusCode, b)
	}
	return nil
}
