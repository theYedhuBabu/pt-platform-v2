package agent

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeTemp(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "data.csv")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	return path
}

func readLines(t *testing.T, path string) []string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	s := strings.TrimRight(string(b), "\n")
	if s == "" {
		return nil
	}
	return strings.Split(s, "\n")
}

func TestSliceBoundsDisjointAndComplete(t *testing.T) {
	for _, tc := range []struct{ rows, total int }{
		{10, 3}, {2, 5}, {7, 7}, {0, 4}, {100, 1},
	} {
		covered := 0
		prevEnd := 0
		for i := 0; i < tc.total; i++ {
			start, end := sliceBounds(tc.rows, tc.total, i)
			if start != prevEnd {
				t.Errorf("rows=%d total=%d agent %d: start %d != previous end %d", tc.rows, tc.total, i, start, prevEnd)
			}
			if end < start {
				t.Errorf("rows=%d total=%d agent %d: end %d < start %d", tc.rows, tc.total, i, end, start)
			}
			covered += end - start
			prevEnd = end
		}
		if covered != tc.rows || prevEnd != tc.rows {
			t.Errorf("rows=%d total=%d: covered %d, final end %d", tc.rows, tc.total, covered, prevEnd)
		}
	}
}

func TestSliceHeaderReplicated(t *testing.T) {
	content := "user,pass\n" + "u1,p1\nu2,p2\nu3,p3\nu4,p4\nu5,p5\n"
	for i := 0; i < 2; i++ {
		path := writeTemp(t, content)
		rows, err := SliceFileInPlace(path, i, 2, true)
		if err != nil {
			t.Fatal(err)
		}
		lines := readLines(t, path)
		if lines[0] != "user,pass" {
			t.Errorf("agent %d: header missing, got %q", i, lines[0])
		}
		if len(lines)-1 != rows {
			t.Errorf("agent %d: reported %d rows, file has %d", i, rows, len(lines)-1)
		}
	}
}

func TestSliceChunksDisjointContiguousComplete(t *testing.T) {
	var sb strings.Builder
	sb.WriteString("h\n")
	for i := 1; i <= 10; i++ {
		fmt.Fprintf(&sb, "row%d\n", i)
	}
	content := sb.String()

	var all []string
	for i := 0; i < 3; i++ {
		path := writeTemp(t, content)
		if _, err := SliceFileInPlace(path, i, 3, true); err != nil {
			t.Fatal(err)
		}
		all = append(all, readLines(t, path)[1:]...) // skip header
	}
	want := readLines(t, writeTemp(t, content))[1:]
	if len(all) != len(want) {
		t.Fatalf("reassembled %d rows, want %d", len(all), len(want))
	}
	for i := range want {
		if all[i] != want[i] {
			t.Errorf("row %d: got %q want %q (chunks not contiguous)", i, all[i], want[i])
		}
	}
}

func TestSliceFewerRowsThanAgents(t *testing.T) {
	content := "h\nonly,row\n"
	gotRows := 0
	for i := 0; i < 4; i++ {
		path := writeTemp(t, content)
		rows, err := SliceFileInPlace(path, i, 4, true)
		if err != nil {
			t.Fatal(err)
		}
		lines := readLines(t, path)
		if lines[0] != "h" {
			t.Errorf("agent %d: header lost", i)
		}
		gotRows += rows
		if rows == 0 && len(lines) != 1 {
			t.Errorf("agent %d: expected header-only file, got %v", i, lines)
		}
	}
	if gotRows != 1 {
		t.Errorf("total rows across agents = %d, want 1", gotRows)
	}
}

func TestSliceSingleAgentNoOp(t *testing.T) {
	content := "h\na\nb\n"
	path := writeTemp(t, content)
	rows, err := SliceFileInPlace(path, 0, 1, true)
	if err != nil {
		t.Fatal(err)
	}
	if rows != 2 {
		t.Errorf("rows = %d, want 2", rows)
	}
	b, _ := os.ReadFile(path)
	if string(b) != content {
		t.Errorf("file modified on total=1: %q", b)
	}
}

func TestSliceNoHeaderMode(t *testing.T) {
	content := "a\nb\nc\nd\n"
	var all []string
	for i := 0; i < 2; i++ {
		path := writeTemp(t, content)
		rows, err := SliceFileInPlace(path, i, 2, false)
		if err != nil {
			t.Fatal(err)
		}
		if rows != 2 {
			t.Errorf("agent %d: rows = %d, want 2", i, rows)
		}
		all = append(all, readLines(t, path)...)
	}
	if strings.Join(all, ",") != "a,b,c,d" {
		t.Errorf("reassembled = %v", all)
	}
}

func TestSliceEmptyFile(t *testing.T) {
	path := writeTemp(t, "")
	rows, err := SliceFileInPlace(path, 0, 3, true)
	if err != nil {
		t.Fatal(err)
	}
	if rows != 0 {
		t.Errorf("rows = %d, want 0", rows)
	}
	if lines := readLines(t, path); lines != nil {
		t.Errorf("expected empty file, got %v", lines)
	}
}

func TestSliceMissingTrailingNewline(t *testing.T) {
	content := "h\na\nb\nc" // no trailing newline
	var all []string
	for i := 0; i < 2; i++ {
		path := writeTemp(t, content)
		if _, err := SliceFileInPlace(path, i, 2, true); err != nil {
			t.Fatal(err)
		}
		all = append(all, readLines(t, path)[1:]...)
	}
	if strings.Join(all, ",") != "a,b,c" {
		t.Errorf("reassembled = %v", all)
	}
}
