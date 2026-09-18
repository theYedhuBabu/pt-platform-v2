package hubapi

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRunIncludesAgent(t *testing.T) {
	cases := []struct {
		agentsJSON string
		agentID    string
		want       bool
	}{
		{`["agent-1","agent-2"]`, "agent-1", true},
		{`["agent-1","agent-2"]`, "agent-3", false},
		{`[]`, "agent-1", false},
		{``, "agent-1", false},
		{`not-json`, "agent-1", false},
	}
	for _, tc := range cases {
		if got := runIncludesAgent(tc.agentsJSON, tc.agentID); got != tc.want {
			t.Errorf("runIncludesAgent(%q, %q) = %v, want %v", tc.agentsJSON, tc.agentID, got, tc.want)
		}
	}
}

func TestHasJTL(t *testing.T) {
	dir := t.TempDir()
	if hasJTL(dir) {
		t.Error("empty dir must not report a JTL")
	}

	if err := os.WriteFile(filepath.Join(dir, "agent.log"), []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}
	if hasJTL(dir) {
		t.Error("dir with only non-JTL files must not report a JTL")
	}

	// A .jtl directly in the dir counts — this is the layout agents upload,
	// and the case collectJTLs would miss (it skips top-level JTLs).
	if err := os.WriteFile(filepath.Join(dir, "results.jtl"), []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}
	if !hasJTL(dir) {
		t.Error("top-level .jtl must be detected")
	}

	if hasJTL(filepath.Join(dir, "does-not-exist")) {
		t.Error("missing dir must not report a JTL")
	}
}
