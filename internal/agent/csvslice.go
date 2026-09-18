package agent

import (
	"bufio"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// sliceBounds returns the half-open data-row range [start, end) owned by
// agent index out of total. Chunks are contiguous, disjoint and cover all
// rows; when rows < total some agents get an empty range.
func sliceBounds(rows, total, index int) (start, end int) {
	return rows * index / total, rows * (index + 1) / total
}

// SliceFileInPlace rewrites path so it contains only this agent's contiguous
// chunk of data rows, preserving the header line on every agent when
// hasHeader is true. Returns the number of data rows this agent keeps.
//
// total <= 1 leaves the file untouched (the count is still computed for the
// empty-slice warning). Slicing is line-based — quoted embedded newlines are
// not understood, matching JMeter CSVDataSet's own line-based reads. Lines
// are rewritten with trailing "\n" regardless of the original line endings.
func SliceFileInPlace(path string, index, total int, hasHeader bool) (int, error) {
	if total > 1 && (index < 0 || index >= total) {
		return 0, errors.New("agent index out of range")
	}

	// Pass 1: count lines.
	lineCount := 0
	if err := forEachFileLine(path, func(string) error {
		lineCount++
		return nil
	}); err != nil {
		return 0, err
	}
	dataRows := lineCount
	if hasHeader && lineCount > 0 {
		dataRows--
	}

	if total <= 1 {
		return dataRows, nil
	}
	start, end := sliceBounds(dataRows, total, index)

	// Pass 2: stream the kept lines to a temp file, then swap it in.
	tmp, err := os.CreateTemp(filepath.Dir(path), ".slice-*")
	if err != nil {
		return 0, err
	}
	defer os.Remove(tmp.Name()) // no-op after a successful rename

	w := bufio.NewWriter(tmp)
	headerPending := hasHeader
	row := 0
	err = forEachFileLine(path, func(line string) error {
		keep := false
		if headerPending {
			headerPending = false
			keep = true
		} else {
			keep = row >= start && row < end
			row++
		}
		if !keep {
			return nil
		}
		_, werr := w.WriteString(line + "\n")
		return werr
	})
	if err == nil {
		err = w.Flush()
	}
	if cerr := tmp.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		return 0, err
	}
	if info, serr := os.Stat(path); serr == nil {
		os.Chmod(tmp.Name(), info.Mode()) //nolint:errcheck
	}
	if err := os.Rename(tmp.Name(), path); err != nil {
		return 0, err
	}
	return end - start, nil
}

// forEachFileLine streams path line by line (stripping the trailing newline
// and any CR before it), including a final line without a newline.
func forEachFileLine(path string, fn func(line string) error) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	r := bufio.NewReader(f)
	for {
		line, err := r.ReadString('\n')
		if len(line) > 0 {
			if ferr := fn(strings.TrimRight(line, "\r\n")); ferr != nil {
				return ferr
			}
		}
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
	}
}
