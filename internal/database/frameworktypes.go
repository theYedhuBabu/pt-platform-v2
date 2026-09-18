package database

import (
	"fmt"
	"log/slog"
)

// StructNode represents one node in a framework's directory structure definition.
// A node is a directory if it has Children, or a file pattern if it has Ext.
type StructNode struct {
	Required   bool                  `json:"required,omitempty"`
	Split      bool                  `json:"split,omitempty"`      // contents are per-agent data split candidates
	Entrypoint bool                  `json:"entrypoint,omitempty"` // contents are executable entry points (e.g. .jmx, scenario.js)
	Role       string                `json:"role,omitempty"`       // artifact group: "config" | "plugin" | "util" (entrypoint/split take precedence)
	Ext        string                `json:"ext,omitempty"`        // expected file extension
	Children   map[string]StructNode `json:"children,omitempty"`
}

type FrameworkType struct {
	ID        string `json:"id"`
	Name      string `json:"name"`      // unique slug: "jmeter-5.6", "k6-latest"
	Tool      string `json:"tool"`      // canonical runtime from tools.Supported: "jmeter" | "k6" | "gatling"
	Label     string `json:"label"`     // display: "JMeter 5.6"
	Structure string `json:"structure"` // JSON: map[string]StructNode
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

func createFrameworkTypesTable() error {
	q := `CREATE TABLE IF NOT EXISTS FrameworkTypes (
		ID          TEXT PRIMARY KEY,
		Name        TEXT NOT NULL UNIQUE,
		Tool        TEXT NOT NULL DEFAULT '',
		Label       TEXT NOT NULL,
		Structure   TEXT NOT NULL,
		CreatedAt   DATETIME NOT NULL,
		UpdatedAt   DATETIME
	);`
	if _, err := DB.Exec(q); err != nil {
		slog.Error("Failed to create FrameworkTypes table", "error", err)
		return fmt.Errorf("create FrameworkTypes table: %w", err)
	}
	return nil
}

func InsertFrameworkType(ft FrameworkType) error {
	q := `INSERT INTO FrameworkTypes (ID, Name, Tool, Label, Structure, CreatedAt, UpdatedAt)
	      VALUES (?, ?, ?, ?, ?, ?, ?)`
	_, err := DB.Exec(q, ft.ID, ft.Name, ft.Tool, ft.Label, ft.Structure, ft.CreatedAt, ft.UpdatedAt)
	if err != nil {
		slog.Error("Failed to insert framework type", "name", ft.Name, "error", err)
	}
	return err
}

func GetFrameworkTypes() ([]FrameworkType, error) {
	rows, err := DB.Query(`SELECT ID, Name, COALESCE(Tool, ''), Label, Structure, CreatedAt, COALESCE(UpdatedAt, '')
	                        FROM FrameworkTypes ORDER BY Label`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var types []FrameworkType
	for rows.Next() {
		var ft FrameworkType
		if err := rows.Scan(&ft.ID, &ft.Name, &ft.Tool, &ft.Label, &ft.Structure, &ft.CreatedAt, &ft.UpdatedAt); err != nil {
			return nil, err
		}
		types = append(types, ft)
	}
	return types, nil
}

func GetFrameworkTypeByName(name string) (FrameworkType, error) {
	var ft FrameworkType
	err := DB.QueryRow(`SELECT ID, Name, COALESCE(Tool, ''), Label, Structure, CreatedAt, COALESCE(UpdatedAt, '')
	                    FROM FrameworkTypes WHERE Name = ?`, name).
		Scan(&ft.ID, &ft.Name, &ft.Tool, &ft.Label, &ft.Structure, &ft.CreatedAt, &ft.UpdatedAt)
	return ft, err
}

func UpdateFrameworkType(name string, tool, label, structure, updatedAt string) error {
	_, err := DB.Exec(`UPDATE FrameworkTypes SET Tool=?, Label=?, Structure=?, UpdatedAt=? WHERE Name=?`,
		tool, label, structure, updatedAt, name)
	if err != nil {
		slog.Error("Failed to update framework type", "name", name, "error", err)
	}
	return err
}

func DeleteFrameworkType(name string) error {
	_, err := DB.Exec(`DELETE FROM FrameworkTypes WHERE Name=?`, name)
	if err != nil {
		slog.Error("Failed to delete framework type", "name", name, "error", err)
	}
	return err
}
