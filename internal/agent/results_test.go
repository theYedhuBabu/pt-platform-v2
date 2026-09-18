package agent

import (
	"archive/zip"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestHTTPBaseFromWS(t *testing.T) {
	for in, want := range map[string]string{
		"ws://localhost:8080/ws":            "http://localhost:8080",
		"wss://hub.example.com/ws":          "https://hub.example.com",
		"ws://10.0.0.5:8080/ws?agentId=a-1": "http://10.0.0.5:8080",
		"http://localhost:8080":             "http://localhost:8080",
	} {
		got, err := HTTPBaseFromWS(in)
		if err != nil {
			t.Errorf("HTTPBaseFromWS(%q) error: %v", in, err)
			continue
		}
		if got != want {
			t.Errorf("HTTPBaseFromWS(%q) = %q, want %q", in, got, want)
		}
	}
	if _, err := HTTPBaseFromWS("ftp://nope"); err == nil {
		t.Error("unsupported scheme accepted")
	}
}

func TestHasJTL(t *testing.T) {
	dir := t.TempDir()
	missing := filepath.Join(dir, "missing.jtl")
	if HasJTL(missing) {
		t.Error("missing file reported as present")
	}
	empty := filepath.Join(dir, "empty.jtl")
	os.WriteFile(empty, nil, 0644)
	if HasJTL(empty) {
		t.Error("zero-byte JTL reported as usable")
	}
	real := filepath.Join(dir, "results.jtl")
	os.WriteFile(real, []byte("ts,elapsed\n1,2\n"), 0644)
	if !HasJTL(real) {
		t.Error("real JTL not detected")
	}
}

func TestZipResults(t *testing.T) {
	dir := t.TempDir()
	jtl := filepath.Join(dir, "results.jtl")
	os.WriteFile(jtl, []byte("ts,elapsed\n1,2\n"), 0644)

	zipPath := filepath.Join(dir, "results.zip")
	err := ZipResults(zipPath, map[string]string{
		"results.jtl": jtl,
		"jmeter.log":  filepath.Join(dir, "does-not-exist.log"), // skipped
	})
	if err != nil {
		t.Fatalf("ZipResults: %v", err)
	}

	r, err := zip.OpenReader(zipPath)
	if err != nil {
		t.Fatalf("open zip: %v", err)
	}
	defer r.Close()
	if len(r.File) != 1 || r.File[0].Name != "results.jtl" {
		names := make([]string, 0, len(r.File))
		for _, f := range r.File {
			names = append(names, f.Name)
		}
		t.Fatalf("zip entries = %v, want [results.jtl]", names)
	}
	rc, _ := r.File[0].Open()
	b, _ := io.ReadAll(rc)
	rc.Close()
	if string(b) != "ts,elapsed\n1,2\n" {
		t.Errorf("jtl content = %q", b)
	}
}

func TestUploadResults(t *testing.T) {
	dir := t.TempDir()
	zipPath := filepath.Join(dir, "results.zip")
	jtl := filepath.Join(dir, "results.jtl")
	os.WriteFile(jtl, []byte("data"), 0644)
	if err := ZipResults(zipPath, map[string]string{"results.jtl": jtl}); err != nil {
		t.Fatal(err)
	}

	var gotPath, gotAgent, gotField string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAgent = r.URL.Query().Get("agentId")
		f, fh, err := r.FormFile("file")
		if err == nil {
			gotField = fh.Filename
			f.Close()
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	if err := UploadResults(srv.Client(), srv.URL, "run-1", "agent-1", zipPath); err != nil {
		t.Fatalf("upload: %v", err)
	}
	if gotPath != "/api/results/upload/run-1" {
		t.Errorf("path = %q", gotPath)
	}
	if gotAgent != "agent-1" {
		t.Errorf("agentId = %q", gotAgent)
	}
	if gotField != "results.zip" {
		t.Errorf("multipart filename = %q (form key 'file' missing?)", gotField)
	}
}

func TestUploadResultsRetriesThenFails(t *testing.T) {
	dir := t.TempDir()
	zipPath := filepath.Join(dir, "results.zip")
	jtl := filepath.Join(dir, "results.jtl")
	os.WriteFile(jtl, []byte("data"), 0644)
	if err := ZipResults(zipPath, map[string]string{"results.jtl": jtl}); err != nil {
		t.Fatal(err)
	}

	origBackoff := uploadBackoff
	uploadBackoff = time.Millisecond
	defer func() { uploadBackoff = origBackoff }()

	attempts := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer srv.Close()

	if err := UploadResults(srv.Client(), srv.URL, "run-1", "agent-1", zipPath); err == nil {
		t.Error("upload against failing server succeeded")
	}
	if attempts != uploadAttempts {
		t.Errorf("attempts = %d, want %d", attempts, uploadAttempts)
	}
}
