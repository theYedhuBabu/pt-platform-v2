package agent

import (
	"regexp"
	"strconv"
	"strings"
)

// JMeter summariser stdout, with -Jsummariser.interval=5:
//
//	summary +     42 in 00:00:05 =    8.4/s Avg:   120 Min:    45 Max:   350 Err:     0 (0.00%) Active: 10 Started: 10 Finished: 0
//	summary =    250 in 00:00:30 =    8.3/s Avg:   118 Min:    40 Max:   400 Err:     2 (0.80%)
//
// "+" lines are per-interval deltas and carry the live thread count; "="
// lines are cumulative totals. Live metrics are built from the delta lines —
// the run UI sums request/error deltas for totals and plots each message as
// a new point (useAgentSocket.ts MetricData).
var summaryRe = regexp.MustCompile(`summary ([+=]) +(\d+) in +[\d:.]+ += +([\d.,]+)/s Avg: +(-?\d+) Min: +(-?\d+) Max: +(-?\d+) Err: +(\d+) \([\d.,]+%\)(?: +Active: +(\d+) +Started: +(\d+) +Finished: +(\d+))?`)

// Summary is one parsed summariser line.
type Summary struct {
	Cumulative bool    // "=" line (totals) vs "+" line (interval delta)
	Count      int64   // samples in this line's window
	Errors     int64   // errors in this line's window
	Rate       float64 // throughput JMeter reports for this window (the "/s" value)
	Active     int     // current thread count; only present on "+" lines
	HasActive  bool
}

// ParseSummaryLine extracts a Summary from a JMeter stdout line. The second
// return value is false for non-summariser lines.
func ParseSummaryLine(line string) (Summary, bool) {
	m := summaryRe.FindStringSubmatch(line)
	if m == nil {
		return Summary{}, false
	}
	count, _ := strconv.ParseInt(m[2], 10, 64)
	errs, _ := strconv.ParseInt(m[7], 10, 64)
	// Strip any thousands separators JMeter's DecimalFormat may emit ("1,234.5").
	rate, _ := strconv.ParseFloat(strings.ReplaceAll(m[3], ",", ""), 64)
	s := Summary{
		Cumulative: m[1] == "=",
		Count:      count,
		Errors:     errs,
		Rate:       rate,
	}
	if m[8] != "" {
		active, _ := strconv.Atoi(m[8])
		s.Active = active
		s.HasActive = true
	}
	return s, true
}

// MetricFromSummary converts a parsed summariser line into wire metric data.
// Only interval ("+") lines produce a metric: cumulative lines repeat counts
// the UI already summed, so emitting them would double-count.
func MetricFromSummary(s Summary, runID, agentID string) (MetricData, bool) {
	if s.Cumulative {
		return MetricData{}, false
	}
	return MetricData{
		RunID:         runID,
		AgentID:       agentID,
		FrameworkType: "jmeter",
		Requests:      s.Count,
		Errors:        s.Errors,
		Rate:          s.Rate,
		VUs:           s.Active,
	}, true
}
