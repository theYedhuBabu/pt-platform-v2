package database

import (
	"database/sql"
	"fmt"
	"log/slog"
	"time"

	"pt-platform-v2/internal/tools"

	_ "github.com/mattn/go-sqlite3"
)

var DB *sql.DB

func InitializeDB(dbPath string) error {
	var err error

	DB, err = sql.Open("sqlite3", dbPath)
	if err != nil {
		slog.Error("Failed to open database", "path", dbPath, "error", err)
		return err
	}

	if err = DB.Ping(); err != nil {
		return err
	}

	DB.SetMaxOpenConns(1)
	DB.SetMaxIdleConns(1)
	DB.SetConnMaxIdleTime(5 * time.Minute)

	for _, pragma := range []string{"PRAGMA journal_mode=WAL;", "PRAGMA foreign_keys=ON;"} {
		if _, err := DB.Exec(pragma); err != nil {
			slog.Warn("Failed to set pragma", "pragma", pragma, "error", err)
		}
	}

	slog.Info("Database connection established", "path", dbPath)
	if err := createTables(); err != nil {
		return err
	}
	return migrateFrameworkTypesTool()
}

// migrateFrameworkTypesTool adds the Tool column to FrameworkTypes on databases
// created before it existed (CREATE TABLE IF NOT EXISTS never alters existing
// tables), then backfills rows whose Name matches a registry tool exactly or by
// "<tool>-" prefix. Idempotent — runs on every startup.
func migrateFrameworkTypesTool() error {
	var colCount int
	err := DB.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('FrameworkTypes') WHERE name = 'Tool'`).
		Scan(&colCount)
	if err != nil {
		return fmt.Errorf("check FrameworkTypes.Tool column: %w", err)
	}
	if colCount == 0 {
		if _, err := DB.Exec(`ALTER TABLE FrameworkTypes ADD COLUMN Tool TEXT NOT NULL DEFAULT ''`); err != nil {
			return fmt.Errorf("add FrameworkTypes.Tool column: %w", err)
		}
		slog.Info("Added Tool column to FrameworkTypes")
	}
	for _, tool := range tools.Supported {
		res, err := DB.Exec(`UPDATE FrameworkTypes SET Tool = ? WHERE Tool = '' AND (Name = ? OR Name LIKE ? || '-%')`,
			tool, tool, tool)
		if err != nil {
			return fmt.Errorf("backfill FrameworkTypes.Tool for %q: %w", tool, err)
		}
		if n, _ := res.RowsAffected(); n > 0 {
			slog.Info("Backfilled FrameworkTypes.Tool", "tool", tool, "rows", n)
		}
	}
	return nil
}

func createTables() error {
	for _, create := range []func() error{
		createProjectsTable,
		createFrameworksTable,
		createFrameworkTypesTable,
		createTestsTable,
		createRunsTable,
	} {
		if err := create(); err != nil {
			return err
		}
	}
	return nil
}
