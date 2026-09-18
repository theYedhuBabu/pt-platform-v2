package agent

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSafeJoinAccepts(t *testing.T) {
	base := "/work/run-1"
	for rel, wantSuffix := range map[string]string{
		"a.jmx":              "a.jmx",
		"src/data/users.csv": filepath.Join("src", "data", "users.csv"),
		"./src/x.csv":        filepath.Join("src", "x.csv"),
	} {
		got, err := SafeJoin(base, rel)
		if err != nil {
			t.Errorf("SafeJoin(%q) error: %v", rel, err)
			continue
		}
		if got != filepath.Join(base, wantSuffix) {
			t.Errorf("SafeJoin(%q) = %q", rel, got)
		}
	}
}

func TestSafeJoinRejects(t *testing.T) {
	base := "/work/run-1"
	for _, rel := range []string{
		"",
		"/etc/passwd",
		"../outside.csv",
		"src/../../outside.csv",
		"..",
	} {
		if got, err := SafeJoin(base, rel); err == nil {
			t.Errorf("SafeJoin(%q) accepted: %q", rel, got)
		}
	}
}

func TestDownloadFile(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ok":
			w.Write([]byte("hello"))
		case "/big":
			w.Write([]byte(strings.Repeat("x", 100)))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	client := srv.Client()

	dest := filepath.Join(t.TempDir(), "nested", "dir", "f.txt")
	if err := DownloadFile(client, srv.URL+"/ok", dest, 1<<20); err != nil {
		t.Fatalf("download: %v", err)
	}
	if b, _ := os.ReadFile(dest); string(b) != "hello" {
		t.Errorf("content = %q", b)
	}

	dest404 := filepath.Join(t.TempDir(), "missing.txt")
	if err := DownloadFile(client, srv.URL+"/missing", dest404, 1<<20); err == nil {
		t.Error("non-200 accepted")
	}
	if _, err := os.Stat(dest404); !os.IsNotExist(err) {
		t.Error("failed download left a file behind")
	}

	destBig := filepath.Join(t.TempDir(), "big.txt")
	if err := DownloadFile(client, srv.URL+"/big", destBig, 10); err == nil {
		t.Error("oversize download accepted")
	}
	if _, err := os.Stat(destBig); !os.IsNotExist(err) {
		t.Error("oversize download left a file behind")
	}
}
