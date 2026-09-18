package database

import (
	"fmt"
	"log/slog"
)

type Framework struct {
	ID                  string `json:"id"`
	ProjectID           string `json:"projectId"`
	Name                string `json:"name"`
	Description         string `json:"description"`
	SourceType          string `json:"sourceType"` // "git" | "upload"
	SourceRepo          string `json:"sourceRepo,omitempty"`
	SourceBranch        string `json:"sourceBranch,omitempty"`
	SourceLastPull      string `json:"sourceLastPull,omitempty"`
	SourceAutoVersioned bool   `json:"sourceAutoVersioned"`
	Version             string `json:"version"` // current/latest version label
	Envs                string `json:"envs"`    // JSON array e.g. ["production","staging"]
	ScriptCount         int    `json:"scripts"`
	ConfigCount         int    `json:"configs"`
	DataCount           int    `json:"data"`
	PluginCount         int    `json:"plugins"`
	UtilCount           int    `json:"util"`
	UsageCount          int    `json:"usageCount"`
	ToolType            string `json:"toolType,omitempty"`    // references FrameworkTypes.Name
	SplitFiles          string `json:"splitFiles,omitempty"`  // JSON array of filenames split per agent
	SharedFiles         string `json:"sharedFiles,omitempty"` // JSON array of filenames shared across agents
	CreatedAt           string `json:"createdAt"`
	UpdatedAt           string `json:"updatedAt"`
}

func createFrameworksTable() error {
	q := `CREATE TABLE IF NOT EXISTS Frameworks (
		ID                  TEXT    PRIMARY KEY,
		ProjectID           TEXT    NOT NULL,
		Name                TEXT    NOT NULL,
		Description         TEXT,
		SourceType          TEXT    NOT NULL,
		SourceRepo          TEXT,
		SourceBranch        TEXT,
		SourceLastPull      DATETIME,
		SourceAutoVersioned INTEGER DEFAULT 0,
		Version             TEXT,
		Envs                TEXT,
		ScriptCount         INTEGER DEFAULT 0,
		ConfigCount         INTEGER DEFAULT 0,
		DataCount           INTEGER DEFAULT 0,
		PluginCount         INTEGER DEFAULT 0,
		UtilCount           INTEGER DEFAULT 0,
		UsageCount          INTEGER DEFAULT 0,
		ToolType            TEXT,
		SplitFiles          TEXT,
		SharedFiles         TEXT,
		CreatedAt           DATETIME NOT NULL,
		UpdatedAt           DATETIME,
		FOREIGN KEY (ProjectID) REFERENCES Projects(ID) ON DELETE CASCADE
	);`
	if _, err := DB.Exec(q); err != nil {
		slog.Error("Failed to create Frameworks table", "error", err)
		return fmt.Errorf("create Frameworks table: %w", err)
	}
	return nil
}

func InsertFramework(f Framework) error {
	q := `INSERT INTO Frameworks (
		ID, ProjectID, Name, Description,
		SourceType, SourceRepo, SourceBranch, SourceLastPull, SourceAutoVersioned,
		Version, Envs, ScriptCount, ConfigCount, DataCount, PluginCount, UtilCount,
		UsageCount, ToolType, SplitFiles, SharedFiles, CreatedAt, UpdatedAt
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_, err := DB.Exec(q,
		f.ID, f.ProjectID, f.Name, f.Description,
		f.SourceType, f.SourceRepo, f.SourceBranch, f.SourceLastPull, f.SourceAutoVersioned,
		f.Version, f.Envs, f.ScriptCount, f.ConfigCount, f.DataCount, f.PluginCount, f.UtilCount,
		f.UsageCount, nullStr(f.ToolType), nullStr(f.SplitFiles), nullStr(f.SharedFiles),
		f.CreatedAt, f.UpdatedAt,
	)
	if err != nil {
		slog.Error("Failed to insert framework", "id", f.ID, "error", err)
		return err
	}
	return nil
}

const frameworkSelectCols = `SELECT
	ID, ProjectID, Name, COALESCE(Description, ''),
	SourceType, COALESCE(SourceRepo, ''), COALESCE(SourceBranch, ''),
	COALESCE(SourceLastPull, ''), SourceAutoVersioned,
	COALESCE(Version, ''), COALESCE(Envs, '[]'),
	ScriptCount, ConfigCount, DataCount, PluginCount, UtilCount, UsageCount,
	COALESCE(ToolType, ''), COALESCE(SplitFiles, '[]'), COALESCE(SharedFiles, '[]'),
	CreatedAt, COALESCE(UpdatedAt, '')
FROM Frameworks`

func scanFramework(row interface{ Scan(...any) error }) (Framework, error) {
	var f Framework
	err := row.Scan(
		&f.ID, &f.ProjectID, &f.Name, &f.Description,
		&f.SourceType, &f.SourceRepo, &f.SourceBranch,
		&f.SourceLastPull, &f.SourceAutoVersioned,
		&f.Version, &f.Envs,
		&f.ScriptCount, &f.ConfigCount, &f.DataCount, &f.PluginCount, &f.UtilCount, &f.UsageCount,
		&f.ToolType, &f.SplitFiles, &f.SharedFiles,
		&f.CreatedAt, &f.UpdatedAt,
	)
	return f, err
}

func GetAllFrameworks() ([]Framework, error) {
	rows, err := DB.Query(frameworkSelectCols + ` ORDER BY CreatedAt DESC`)
	if err != nil {
		slog.Error("Failed to query all frameworks", "error", err)
		return nil, err
	}
	defer rows.Close()
	frameworks := make([]Framework, 0)
	for rows.Next() {
		f, err := scanFramework(rows)
		if err != nil {
			return nil, err
		}
		frameworks = append(frameworks, f)
	}
	return frameworks, nil
}

func GetFrameworksByProject(projectID string) ([]Framework, error) {
	rows, err := DB.Query(frameworkSelectCols+` WHERE ProjectID = ?`, projectID)
	if err != nil {
		slog.Error("Failed to query frameworks", "projectID", projectID, "error", err)
		return nil, err
	}
	defer rows.Close()
	frameworks := make([]Framework, 0)
	for rows.Next() {
		f, err := scanFramework(rows)
		if err != nil {
			return nil, err
		}
		frameworks = append(frameworks, f)
	}
	return frameworks, nil
}

func GetFrameworkByID(id string) (Framework, error) {
	f, err := scanFramework(DB.QueryRow(frameworkSelectCols+` WHERE ID = ?`, id))
	if err != nil {
		return Framework{}, err
	}
	return f, nil
}
