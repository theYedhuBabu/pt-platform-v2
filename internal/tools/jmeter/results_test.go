package jmeter

import (
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

const jtlHeader = "timeStamp,elapsed,label,responseCode,responseMessage,threadName,dataType,success,failureMessage,bytes,sentBytes,grpThreads,allThreads,URL,Latency,IdleTime,Connect"

func jtlRow(ts int64, elapsed int, success bool) string {
	ok := "true"
	if !success {
		ok = "false"
	}
	return strings.Join([]string{
		// timeStamp, elapsed, label, rc, msg, thread, type, success, rest zeroed
		strconv.FormatInt(ts, 10), strconv.Itoa(elapsed), "HTTP Request", "200", "OK", "tg 1-1", "text", ok, "", "0", "0", "1", "1", "http://x", "0", "0", "0",
	}, ",")
}

func TestAggregateJTLFromReader(t *testing.T) {
	// 4 samples over 3 seconds (start spread), 1 failure
	rows := []string{
		jtlHeader,
		jtlRow(1000, 100, true),
		jtlRow(2000, 200, true),
		jtlRow(3000, 300, false),
		jtlRow(4000, 400, true),
	}
	stats, err := AggregateJTLFromReader(strings.NewReader(strings.Join(rows, "\n")))
	if err != nil {
		t.Fatalf("AggregateJTLFromReader() error: %v", err)
	}
	if stats.Samples != 4 {
		t.Errorf("Samples = %d, want 4", stats.Samples)
	}
	if math.Abs(stats.ErrPct-25.0) > 0.001 {
		t.Errorf("ErrPct = %f, want 25.0", stats.ErrPct)
	}
	// duration = (4000-1000)ms + last request's 400ms elapsed = 3.4s
	if stats.Duration.Milliseconds() != 3400 {
		t.Errorf("Duration = %v, want 3.4s", stats.Duration)
	}
	if stats.RPS <= 0 {
		t.Errorf("RPS = %f, want > 0", stats.RPS)
	}
	if stats.P95 != 400 || stats.P99 != 400 {
		t.Errorf("P95/P99 = %f/%f, want 400/400", stats.P95, stats.P99)
	}
}

func TestAggregateJTLEmptyFails(t *testing.T) {
	if _, err := AggregateJTLFromReader(strings.NewReader(jtlHeader)); err == nil {
		t.Error("expected error for JTL with no samples")
	}
}

func TestAggregateJTLMissingColumns(t *testing.T) {
	if _, err := AggregateJTLFromReader(strings.NewReader("a,b,c\n1,2,3")); err == nil {
		t.Error("expected error for JTL missing required columns")
	}
}

func TestMergeJTLs(t *testing.T) {
	dir := t.TempDir()
	f1 := filepath.Join(dir, "agent1.jtl")
	f2 := filepath.Join(dir, "agent2.jtl")
	os.WriteFile(f1, []byte(jtlHeader+"\n"+jtlRow(1000, 100, true)+"\n"), 0644)
	os.WriteFile(f2, []byte(jtlHeader+"\n"+jtlRow(2000, 200, true)+"\n"), 0644)

	out := filepath.Join(dir, "merged.jtl")
	if err := MergeJTLs([]string{f1, f2}, out); err != nil {
		t.Fatalf("MergeJTLs() error: %v", err)
	}

	stats, err := AggregateJTL(out)
	if err != nil {
		t.Fatalf("AggregateJTL(merged) error: %v", err)
	}
	if stats.Samples != 2 {
		t.Errorf("merged Samples = %d, want 2 (header rows must not be counted)", stats.Samples)
	}
}

func TestMergeJTLsEmptyInput(t *testing.T) {
	if err := MergeJTLs(nil, filepath.Join(t.TempDir(), "out.jtl")); err == nil {
		t.Error("expected error for empty input list")
	}
}
