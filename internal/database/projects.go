package database

import (
	"fmt"
	"log/slog"
)

type Project struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Client      string `json:"client"`
	Environment string `json:"env"`
	Description string `json:"description,omitempty"`
	Key         string `json:"key"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
	Status      string `json:"status"`
}

func createProjectsTable() error {
	q := `CREATE TABLE IF NOT EXISTS Projects (
		ID          TEXT PRIMARY KEY,
		ProjectName TEXT NOT NULL,
		ClientName  TEXT NOT NULL,
		Environment TEXT NOT NULL,
		Description TEXT,
		Key         TEXT NOT NULL,
		CreatedAt   DATETIME NOT NULL,
		UpdatedAt   DATETIME,
		Status      TEXT NOT NULL
	);`
	if _, err := DB.Exec(q); err != nil {
		slog.Error("Failed to create Projects table", "error", err)
		return fmt.Errorf("create Projects table: %w", err)
	}
	return nil
}

func InsertProject(p Project) error {
	q := `INSERT INTO Projects (ID, ProjectName, ClientName, Environment, Description, Key, CreatedAt, UpdatedAt, Status)
	      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_, err := DB.Exec(q, p.ID, p.Name, p.Client, p.Environment, p.Description, p.Key, p.CreatedAt, p.UpdatedAt, p.Status)
	if err != nil {
		slog.Error("Failed to insert project", "id", p.ID, "error", err)
		return err
	}
	return nil
}

func GetProjects() ([]Project, error) {
	q := `SELECT ID, ProjectName, ClientName, Environment, Description, Key, CreatedAt, UpdatedAt, Status
	      FROM Projects ORDER BY CreatedAt DESC`
	rows, err := DB.Query(q)
	if err != nil {
		slog.Error("Failed to query projects", "error", err)
		return nil, err
	}
	defer rows.Close()

	projects := make([]Project, 0)
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.Name, &p.Client, &p.Environment, &p.Description, &p.Key, &p.CreatedAt, &p.UpdatedAt, &p.Status); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, nil
}

func GetProjectByID(id string) (Project, error) {
	q := `SELECT ID, ProjectName, ClientName, Environment, Description, Key, CreatedAt, UpdatedAt, Status
	      FROM Projects WHERE ID = ?`
	var p Project
	err := DB.QueryRow(q, id).Scan(&p.ID, &p.Name, &p.Client, &p.Environment, &p.Description, &p.Key, &p.CreatedAt, &p.UpdatedAt, &p.Status)
	if err != nil {
		return Project{}, err
	}
	return p, nil
}
