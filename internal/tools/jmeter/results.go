package jmeter

import (
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"sort"
	"strconv"
	"time"
)

// RunStats holds the aggregate metrics computed from a merged JTL file.
type RunStats struct {
	Samples  int
	Duration time.Duration
	RPS      float64
	ErrPct   float64
	P95      float64
	P99      float64
}

// MergeJTLs concatenates JTL (CSV) files into outPath, keeping a single header
// row from the first file. Subsequent files must share the same column layout.
func MergeJTLs(paths []string, outPath string) error {
	if len(paths) == 0 {
		return fmt.Errorf("no JTL files to merge")
	}
	out, err := os.Create(outPath)
	if err != nil {
		return err
	}
	defer out.Close()

	w := csv.NewWriter(out)
	defer w.Flush()

	headerWritten := false
	for _, p := range paths {
		f, err := os.Open(p)
		if err != nil {
			return err
		}
		r := csv.NewReader(f)
		r.FieldsPerRecord = -1
		first := true
		for {
			rec, err := r.Read()
			if err == io.EOF {
				break
			}
			if err != nil {
				f.Close()
				return fmt.Errorf("read %s: %w", p, err)
			}
			if first {
				first = false
				if headerWritten {
					continue // skip duplicate header rows
				}
				headerWritten = true
			}
			if err := w.Write(rec); err != nil {
				f.Close()
				return err
			}
		}
		f.Close()
	}
	return nil
}

// AggregateJTL computes summary statistics from a CSV JTL file with at least
// the timeStamp, elapsed and success columns.
func AggregateJTL(path string) (RunStats, error) {
	f, err := os.Open(path)
	if err != nil {
		return RunStats{}, err
	}
	defer f.Close()
	return AggregateJTLFromReader(f)
}

// AggregateJTLFromReader computes summary statistics from JTL content.
func AggregateJTLFromReader(r io.Reader) (RunStats, error) {
	cr := csv.NewReader(r)
	cr.FieldsPerRecord = -1

	header, err := cr.Read()
	if err != nil {
		return RunStats{}, fmt.Errorf("read JTL header: %w", err)
	}
	col := map[string]int{}
	for i, name := range header {
		col[name] = i
	}
	tsIdx, ok1 := col["timeStamp"]
	elIdx, ok2 := col["elapsed"]
	okIdx, ok3 := col["success"]
	if !ok1 || !ok2 || !ok3 {
		return RunStats{}, fmt.Errorf("JTL missing required columns (timeStamp, elapsed, success), got %v", header)
	}

	var (
		elapsedVals  []float64
		minTS, maxTS int64
		lastElapsed  float64
		errors       int
	)
	for {
		rec, err := cr.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return RunStats{}, fmt.Errorf("read JTL row: %w", err)
		}
		if len(rec) <= tsIdx || len(rec) <= elIdx || len(rec) <= okIdx {
			continue
		}
		ts, err := strconv.ParseInt(rec[tsIdx], 10, 64)
		if err != nil {
			continue // skip stray header rows or malformed lines
		}
		el, err := strconv.ParseFloat(rec[elIdx], 64)
		if err != nil {
			continue
		}
		elapsedVals = append(elapsedVals, el)
		if minTS == 0 || ts < minTS {
			minTS = ts
		}
		if ts >= maxTS {
			maxTS = ts
			lastElapsed = el
		}
		if rec[okIdx] != "true" {
			errors++
		}
	}

	samples := len(elapsedVals)
	if samples == 0 {
		return RunStats{}, fmt.Errorf("JTL contains no samples")
	}

	// JTL timestamps are epoch millis of request start; include the last
	// request's elapsed time so single-sample runs have a non-zero duration.
	sort.Float64s(elapsedVals)
	duration := time.Duration(maxTS-minTS)*time.Millisecond +
		time.Duration(lastElapsed)*time.Millisecond
	durationSec := duration.Seconds()
	rps := 0.0
	if durationSec > 0 {
		rps = float64(samples) / durationSec
	}

	return RunStats{
		Samples:  samples,
		Duration: duration,
		RPS:      rps,
		ErrPct:   float64(errors) / float64(samples) * 100,
		P95:      percentile(elapsedVals, 0.95),
		P99:      percentile(elapsedVals, 0.99),
	}, nil
}

// percentile returns the value at quantile q from an ascending-sorted slice.
func percentile(sorted []float64, q float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	idx := int(float64(len(sorted))*q+0.5) - 1
	if idx < 0 {
		idx = 0
	}
	if idx >= len(sorted) {
		idx = len(sorted) - 1
	}
	return sorted[idx]
}
