package agent

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// SafeJoin joins a hub-supplied relative path onto base, rejecting absolute
// paths and any ".." escape. The hub builds these paths from its own disk
// walk, but the agent must not trust them.
func SafeJoin(base, rel string) (string, error) {
	if rel == "" {
		return "", errors.New("empty path")
	}
	if filepath.IsAbs(rel) || strings.HasPrefix(rel, "/") {
		return "", fmt.Errorf("absolute path not allowed: %s", rel)
	}
	clean := filepath.Clean(filepath.FromSlash(rel))
	if clean == ".." || strings.HasPrefix(clean, ".."+string(os.PathSeparator)) {
		return "", fmt.Errorf("path escapes run directory: %s", rel)
	}
	return filepath.Join(base, clean), nil
}

// DownloadFile fetches url into dest (creating parent directories), failing
// on non-200 responses and bodies larger than maxBytes. A failed or oversize
// download leaves no file behind.
func DownloadFile(client *http.Client, url, dest string, maxBytes int64) error {
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download %s: unexpected status %s", url, resp.Status)
	}
	if resp.ContentLength > maxBytes {
		return fmt.Errorf("download %s: %d bytes exceeds cap %d", url, resp.ContentLength, maxBytes)
	}

	if err := os.MkdirAll(filepath.Dir(dest), 0755); err != nil {
		return err
	}
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	n, err := io.Copy(out, io.LimitReader(resp.Body, maxBytes+1))
	if cerr := out.Close(); err == nil {
		err = cerr
	}
	if err == nil && n > maxBytes {
		err = fmt.Errorf("download %s: exceeds cap %d bytes", url, maxBytes)
	}
	if err != nil {
		os.Remove(dest)
		return err
	}
	return nil
}

// Wipe removes a run directory and everything under it.
func Wipe(dir string) error {
	return os.RemoveAll(dir)
}
