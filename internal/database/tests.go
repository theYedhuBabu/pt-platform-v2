package database

import (
	"database/sql"
	"fmt"
	"log/slog"
)

type Test struct {
	ID                 string `json:"id"`
	ProjectID          string `json:"projectId"`
	FrameworkID        string `json:"frameworkId,omitempty"`
	CategoryID         string `json:"categoryId,omitempty"`
	Name               string `json:"name"`
	Type               string `json:"type"`                 // "native" | "external_imports"
	Mode               string `json:"mode"`                 // "single" | "distributed" | "none"
	Script             string `json:"scriptName,omitempty"` // entry point path within framework
	Artifacts          string `json:"artifacts,omitempty"`  // JSON: { configs, plugins, util, dataFiles }
	Version            string `json:"version,omitempty"`
	EnvName            string `json:"envName,omitempty"`
	LastStatus         string `json:"lastStatus,omitempty"`
	LastRunAt          string `json:"lastRunAt,omitempty"`
	SourceFile         string `json:"sourceFile,omitempty"`
	LinkedNativeTestID string `json:"linkedNativeTestId,omitempty"`
	CreatedAt          string `json:"createdAt"`
	UpdatedAt          string `json:"updatedAt"`
	Status             string `json:"status"`
}

func createTestsTable() error {
	q := `CREATE TABLE IF NOT EXISTS Tests (
		ID                 TEXT PRIMARY KEY,
		ProjectID          TEXT NOT NULL,
		FrameworkID        TEXT,
		CategoryID         TEXT,
		Name               TEXT NOT NULL,
		Type               TEXT NOT NULL,
		Mode               TEXT NOT NULL,
		Script             TEXT,
		Artifacts          TEXT,
		Version            TEXT,
		EnvName            TEXT,
		LastStatus         TEXT,
		LastRunAt          DATETIME,
		SourceFile         TEXT,
		LinkedNativeTestID TEXT,
		CreatedAt          DATETIME NOT NULL,
		UpdatedAt          DATETIME,
		Status             TEXT NOT NULL,
		FOREIGN KEY (ProjectID)          REFERENCES Projects(ID)   ON DELETE CASCADE,
		FOREIGN KEY (FrameworkID)        REFERENCES Frameworks(ID) ON DELETE SET NULL,
		FOREIGN KEY (LinkedNativeTestID) REFERENCES Tests(ID)      ON DELETE SET NULL
	);`
	if _, err := DB.Exec(q); err != nil {
		slog.Error("Failed to create Tests table", "error", err)
		return fmt.Errorf("create Tests table: %w", err)
	}
	return nil
}

func nullStr(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

func InsertTest(t Test) error {
	q := `INSERT INTO Tests (
		ID, ProjectID, FrameworkID, CategoryID, Name, Type, Mode,
		Script, Artifacts, Version, EnvName, LastStatus, LastRunAt,
		SourceFile, LinkedNativeTestID, CreatedAt, UpdatedAt, Status
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_, err := DB.Exec(q,
		t.ID, t.ProjectID, nullStr(t.FrameworkID), nullStr(t.CategoryID), t.Name, t.Type, t.Mode,
		nullStr(t.Script), nullStr(t.Artifacts), nullStr(t.Version), nullStr(t.EnvName), nullStr(t.LastStatus), nullStr(t.LastRunAt),
		nullStr(t.SourceFile), nullStr(t.LinkedNativeTestID), t.CreatedAt, t.UpdatedAt, t.Status,
	)
	if err != nil {
		slog.Error("Failed to insert test", "id", t.ID, "error", err)
		return err
	}
	return nil
}

func UpdateTestRunCache(id, lastStatus, lastRunAt string) error {
	q := `UPDATE Tests SET LastStatus = ?, LastRunAt = ? WHERE ID = ?`
	_, err := DB.Exec(q, lastStatus, lastRunAt, id)
	if err != nil {
		slog.Error("Failed to update test run cache", "id", id, "error", err)
	}
	return err
}

const testSelectCols = `SELECT
	ID, ProjectID,
	COALESCE(FrameworkID, ''), COALESCE(CategoryID, ''),
	Name, Type, Mode,
	COALESCE(Script, ''), COALESCE(Artifacts, ''),
	COALESCE(Version, ''), COALESCE(EnvName, ''),
	COALESCE(LastStatus, ''), COALESCE(LastRunAt, ''),
	COALESCE(SourceFile, ''), COALESCE(LinkedNativeTestID, ''),
	CreatedAt, COALESCE(UpdatedAt, ''), Status
FROM Tests`

func scanTest(row interface{ Scan(...any) error }) (Test, error) {
	var t Test
	err := row.Scan(
		&t.ID, &t.ProjectID,
		&t.FrameworkID, &t.CategoryID,
		&t.Name, &t.Type, &t.Mode,
		&t.Script, &t.Artifacts,
		&t.Version, &t.EnvName,
		&t.LastStatus, &t.LastRunAt,
		&t.SourceFile, &t.LinkedNativeTestID,
		&t.CreatedAt, &t.UpdatedAt, &t.Status,
	)
	return t, err
}

func CountTestsByProject(projectID string) int {
	var n int
	DB.QueryRow(`SELECT COUNT(*) FROM Tests WHERE ProjectID = ?`, projectID).Scan(&n)
	return n
}

func GetTestsByProject(projectID string) ([]Test, error) {
	rows, err := DB.Query(testSelectCols+` WHERE ProjectID = ?`, projectID)
	if err != nil {
		slog.Error("Failed to query tests", "projectID", projectID, "error", err)
		return nil, err
	}
	defer rows.Close()

	tests := make([]Test, 0)
	for rows.Next() {
		t, err := scanTest(rows)
		if err != nil {
			return nil, err
		}
		tests = append(tests, t)
	}
	return tests, nil
}

func GetTestByID(id string) (Test, error) {
	t, err := scanTest(DB.QueryRow(testSelectCols+` WHERE ID = ?`, id))
	if err != nil {
		return Test{}, err
	}
	return t, nil
}
