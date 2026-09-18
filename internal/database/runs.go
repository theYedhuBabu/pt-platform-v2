package database

import (
	"fmt"
	"log/slog"
	"time"
)

type Run struct {
	ID          string  `json:"id"`
	TestID      string  `json:"testId"`
	Status      string  `json:"status"` // "running" | "passed" | "failed" | "stopped"
	Mode        string  `json:"mode"`   // "single" | "distributed" | "none"
	StartedAt   string  `json:"startedAt"`
	CompletedAt string  `json:"completedAt,omitempty"`
	Duration    string  `json:"duration,omitempty"`
	RPS         float64 `json:"rps"`
	ErrPct      float64 `json:"errPct"`
	P95         float64 `json:"p95"`
	P99         float64 `json:"p99"`
	Samples     int     `json:"samples"`
	Agents      string  `json:"agents"`               // JSON array of agent IDs
	SplitFiles  string  `json:"splitFiles,omitempty"` // JSON array: data files split per agent
}

func createRunsTable() error {
	q := `CREATE TABLE IF NOT EXISTS Runs (
		ID          TEXT PRIMARY KEY,
		TestID      TEXT NOT NULL,
		Status      TEXT NOT NULL,
		Mode        TEXT NOT NULL,
		StartedAt   DATETIME NOT NULL,
		CompletedAt DATETIME,
		Duration    TEXT,
		RPS         REAL    DEFAULT 0,
		ErrPct      REAL    DEFAULT 0,
		P95         REAL    DEFAULT 0,
		P99         REAL    DEFAULT 0,
		Samples     INTEGER DEFAULT 0,
		Agents      TEXT,
		SplitFiles  TEXT,
		FOREIGN KEY (TestID) REFERENCES Tests(ID) ON DELETE CASCADE
	);`
	if _, err := DB.Exec(q); err != nil {
		slog.Error("Failed to create Runs table", "error", err)
		return fmt.Errorf("create Runs table: %w", err)
	}
	return nil
}

func InsertRun(r Run) error {
	q := `INSERT INTO Runs (ID, TestID, Status, Mode, StartedAt, CompletedAt, Duration, RPS, ErrPct, P95, P99, Samples, Agents, SplitFiles)
	      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_, err := DB.Exec(q, r.ID, r.TestID, r.Status, r.Mode, r.StartedAt, r.CompletedAt, r.Duration, r.RPS, r.ErrPct, r.P95, r.P99, r.Samples, r.Agents, nullStr(r.SplitFiles))
	if err != nil {
		slog.Error("Failed to insert run", "id", r.ID, "error", err)
		return err
	}
	return nil
}

func GetRunsByTest(testID string) ([]Run, error) {
	q := `SELECT ID, TestID, Status, Mode, StartedAt, COALESCE(CompletedAt, ''), COALESCE(Duration, ''),
	             RPS, ErrPct, P95, P99, Samples, COALESCE(Agents, '[]'), COALESCE(SplitFiles, '')
	      FROM Runs WHERE TestID = ? ORDER BY StartedAt DESC`
	rows, err := DB.Query(q, testID)
	if err != nil {
		slog.Error("Failed to query runs", "testID", testID, "error", err)
		return nil, err
	}
	defer rows.Close()

	runs := make([]Run, 0)
	for rows.Next() {
		var r Run
		if err := rows.Scan(&r.ID, &r.TestID, &r.Status, &r.Mode, &r.StartedAt, &r.CompletedAt, &r.Duration, &r.RPS, &r.ErrPct, &r.P95, &r.P99, &r.Samples, &r.Agents, &r.SplitFiles); err != nil {
			return nil, err
		}
		runs = append(runs, r)
	}
	return runs, nil
}

func ResetZombieRuns() {
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := DB.Exec(`UPDATE Runs SET Status='failed', CompletedAt=COALESCE(CompletedAt, ?) WHERE Status='running'`, now); err != nil {
		slog.Error("Failed to reset zombie runs", "error", err)
	}
}

func UpdateRunStatus(id, status, completedAt, duration string) error {
	_, err := DB.Exec(`UPDATE Runs SET Status=?, CompletedAt=?, Duration=? WHERE ID=?`,
		status, nullStr(completedAt), nullStr(duration), id)
	if err != nil {
		slog.Error("Failed to update run status", "id", id, "error", err)
	}
	return err
}

// UpdateRunResults stores the final aggregate metrics when all agents have
// uploaded their results.
func UpdateRunResults(id, status, completedAt, duration string, rps, errPct, p95, p99 float64, samples int) error {
	_, err := DB.Exec(`UPDATE Runs SET Status=?, CompletedAt=?, Duration=?, RPS=?, ErrPct=?, P95=?, P99=?, Samples=? WHERE ID=?`,
		status, completedAt, duration, rps, errPct, p95, p99, samples, id)
	if err != nil {
		slog.Error("Failed to update run results", "id", id, "error", err)
	}
	return err
}

// RunWithTest extends Run with the associated test name for list views.
type RunWithTest struct {
	Run
	TestName   string `json:"testName"`
	ProjectID  string `json:"projectId"`
	ScriptName string `json:"scriptName"`
}

const runJoinCols = `SELECT r.ID, r.TestID, r.Status, r.Mode, r.StartedAt,
	COALESCE(r.CompletedAt,''), COALESCE(r.Duration,''),
	r.RPS, r.ErrPct, r.P95, r.P99, r.Samples, COALESCE(r.Agents,'[]'), COALESCE(r.SplitFiles,''),
	t.Name, t.ProjectID, COALESCE(t.Script,'')
FROM Runs r JOIN Tests t ON r.TestID = t.ID`

func scanRunWithTest(row interface{ Scan(...any) error }) (RunWithTest, error) {
	var rwt RunWithTest
	err := row.Scan(
		&rwt.ID, &rwt.TestID, &rwt.Status, &rwt.Mode, &rwt.StartedAt,
		&rwt.CompletedAt, &rwt.Duration,
		&rwt.RPS, &rwt.ErrPct, &rwt.P95, &rwt.P99, &rwt.Samples, &rwt.Agents, &rwt.SplitFiles,
		&rwt.TestName, &rwt.ProjectID, &rwt.ScriptName,
	)
	return rwt, err
}

func GetActiveRuns() ([]RunWithTest, error) {
	rows, err := DB.Query(runJoinCols + ` WHERE r.Status='running' ORDER BY r.StartedAt DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	runs := make([]RunWithTest, 0)
	for rows.Next() {
		rwt, err := scanRunWithTest(rows)
		if err != nil {
			return nil, err
		}
		runs = append(runs, rwt)
	}
	return runs, nil
}

func GetRunHistory() ([]RunWithTest, error) {
	rows, err := DB.Query(runJoinCols + ` ORDER BY r.StartedAt DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	runs := make([]RunWithTest, 0)
	for rows.Next() {
		rwt, err := scanRunWithTest(rows)
		if err != nil {
			return nil, err
		}
		runs = append(runs, rwt)
	}
	return runs, nil
}

func GetRunWithTestByID(id string) (RunWithTest, error) {
	return scanRunWithTest(DB.QueryRow(runJoinCols+` WHERE r.ID = ?`, id))
}

func GetRunByID(id string) (Run, error) {
	q := `SELECT ID, TestID, Status, Mode, StartedAt, COALESCE(CompletedAt, ''), COALESCE(Duration, ''),
	             RPS, ErrPct, P95, P99, Samples, COALESCE(Agents, '[]'), COALESCE(SplitFiles, '')
	      FROM Runs WHERE ID = ?`
	var r Run
	err := DB.QueryRow(q, id).Scan(&r.ID, &r.TestID, &r.Status, &r.Mode, &r.StartedAt, &r.CompletedAt, &r.Duration, &r.RPS, &r.ErrPct, &r.P95, &r.P99, &r.Samples, &r.Agents, &r.SplitFiles)
	if err != nil {
		return Run{}, err
	}
	return r, nil
}
