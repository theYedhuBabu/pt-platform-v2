package database

import (
	"database/sql"
	"path/filepath"
	"testing"
)

func initTestDB(t *testing.T) string {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "test.db")
	if err := InitializeDB(dbPath); err != nil {
		t.Fatalf("InitializeDB: %v", err)
	}
	t.Cleanup(func() { DB.Close() })
	return dbPath
}

func TestFrameworkTypeToolRoundTrip(t *testing.T) {
	initTestDB(t)

	ft := FrameworkType{ID: "id-1", Name: "jmeter-5.6", Tool: "jmeter", Label: "JMeter 5.6", Structure: "{}", CreatedAt: "2026-06-12T00:00:00Z"}
	if err := InsertFrameworkType(ft); err != nil {
		t.Fatalf("insert: %v", err)
	}
	got, err := GetFrameworkTypeByName("jmeter-5.6")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Tool != "jmeter" {
		t.Errorf("Tool = %q, want %q", got.Tool, "jmeter")
	}

	if err := UpdateFrameworkType("jmeter-5.6", "k6", "JMeter 5.6", "{}", "2026-06-12T01:00:00Z"); err != nil {
		t.Fatalf("update: %v", err)
	}
	got, _ = GetFrameworkTypeByName("jmeter-5.6")
	if got.Tool != "k6" {
		t.Errorf("Tool after update = %q, want %q", got.Tool, "k6")
	}
}

func TestMigrateFrameworkTypesTool(t *testing.T) {
	// Simulate a pre-Tool database: old DDL, two rows — one backfillable by
	// prefix, one ("Jm-01") that must stay empty.
	dbPath := filepath.Join(t.TempDir(), "legacy.db")
	legacy, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("open legacy: %v", err)
	}
	stmts := []string{
		`CREATE TABLE FrameworkTypes (
			ID TEXT PRIMARY KEY, Name TEXT NOT NULL UNIQUE, Label TEXT NOT NULL,
			Structure TEXT NOT NULL, CreatedAt DATETIME NOT NULL, UpdatedAt DATETIME
		);`,
		`INSERT INTO FrameworkTypes (ID, Name, Label, Structure, CreatedAt) VALUES
			('id-1', 'jmeter-5.6', 'JMeter 5.6', '{}', '2026-06-12'),
			('id-2', 'Jm-01', 'JMeter 01', '{}', '2026-06-12'),
			('id-3', 'k6', 'k6', '{}', '2026-06-12');`,
	}
	for _, s := range stmts {
		if _, err := legacy.Exec(s); err != nil {
			t.Fatalf("legacy setup: %v", err)
		}
	}
	legacy.Close()

	if err := InitializeDB(dbPath); err != nil {
		t.Fatalf("InitializeDB on legacy db: %v", err)
	}
	t.Cleanup(func() { DB.Close() })

	// Idempotency: a second run must not fail or change anything.
	if err := migrateFrameworkTypesTool(); err != nil {
		t.Fatalf("second migration run: %v", err)
	}

	want := map[string]string{"jmeter-5.6": "jmeter", "Jm-01": "", "k6": "k6"}
	for name, tool := range want {
		got, err := GetFrameworkTypeByName(name)
		if err != nil {
			t.Fatalf("get %q: %v", name, err)
		}
		if got.Tool != tool {
			t.Errorf("%q Tool = %q, want %q", name, got.Tool, tool)
		}
	}
}
