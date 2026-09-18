package agent

import (
	"archive/zip"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"time"
)

const uploadAttempts = 3

// uploadBackoff is a var so tests can shrink the retry delay.
var uploadBackoff = 2 * time.Second

// HTTPBaseFromWS derives the hub's HTTP base URL from its WebSocket URL:
// ws://host/ws → http://host, wss://host/ws → https://host.
func HTTPBaseFromWS(wsURL string) (string, error) {
	u, err := url.Parse(wsURL)
	if err != nil {
		return "", err
	}
	switch u.Scheme {
	case "ws":
		u.Scheme = "http"
	case "wss":
		u.Scheme = "https"
	case "http", "https":
		// already usable
	default:
		return "", fmt.Errorf("unsupported scheme %q in hub URL %s", u.Scheme, wsURL)
	}
	u.Path, u.RawQuery, u.Fragment = "", "", ""
	return u.String(), nil
}

// HasJTL reports whether path exists with content — JMeter creates the JTL
// up front, so a zero-byte file means no sample was ever written.
func HasJTL(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir() && info.Size() > 0
}

// ZipResults writes a ZIP at zipPath containing files, a map of archive name
// → source path. Missing sources are skipped (jmeter.log may not exist when
// the process died before logging).
func ZipResults(zipPath string, files map[string]string) error {
	out, err := os.Create(zipPath)
	if err != nil {
		return err
	}
	zw := zip.NewWriter(out)

	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)

	for _, name := range names {
		src, err := os.Open(files[name])
		if os.IsNotExist(err) {
			continue
		}
		if err == nil {
			var w io.Writer
			if w, err = zw.Create(name); err == nil {
				_, err = io.Copy(w, src)
			}
			src.Close()
		}
		if err != nil {
			zw.Close()
			out.Close()
			os.Remove(zipPath)
			return err
		}
	}
	if err := zw.Close(); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// UploadResults POSTs the results ZIP to the hub under multipart key "file",
// retrying transient failures. The hub finalizes the run once every agent's
// directory holds a .jtl.
func UploadResults(client *http.Client, httpBase, runID, agentID, zipPath string) error {
	uploadURL := fmt.Sprintf("%s/api/results/upload/%s?agentId=%s",
		httpBase, url.PathEscape(runID), url.QueryEscape(agentID))
	var lastErr error
	for attempt := 0; attempt < uploadAttempts; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(attempt) * uploadBackoff)
		}
		if lastErr = uploadOnce(client, uploadURL, zipPath); lastErr == nil {
			return nil
		}
	}
	return fmt.Errorf("upload failed after %d attempts: %w", uploadAttempts, lastErr)
}

func uploadOnce(client *http.Client, uploadURL, zipPath string) error {
	f, err := os.Open(zipPath)
	if err != nil {
		return err
	}
	defer f.Close()

	pr, pw := io.Pipe()
	mw := multipart.NewWriter(pw)
	go func() {
		part, err := mw.CreateFormFile("file", filepath.Base(zipPath))
		if err == nil {
			_, err = io.Copy(part, f)
		}
		if cerr := mw.Close(); err == nil {
			err = cerr
		}
		pw.CloseWithError(err)
	}()

	req, err := http.NewRequest(http.MethodPost, uploadURL, pr)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("upload status %s: %s", resp.Status, body)
	}
	return nil
}
