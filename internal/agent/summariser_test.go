package agent

import "testing"

func TestParseSummaryLineDelta(t *testing.T) {
	line := "summary +     42 in 00:00:05 =    8.4/s Avg:   120 Min:    45 Max:   350 Err:     0 (0.00%) Active: 10 Started: 10 Finished: 0"
	s, ok := ParseSummaryLine(line)
	if !ok {
		t.Fatal("line not recognised")
	}
	if s.Cumulative {
		t.Error("\"+\" line parsed as cumulative")
	}
	if s.Count != 42 || s.Errors != 0 {
		t.Errorf("count=%d errors=%d, want 42/0", s.Count, s.Errors)
	}
	if s.Rate != 8.4 {
		t.Errorf("rate=%v, want 8.4", s.Rate)
	}
	if !s.HasActive || s.Active != 10 {
		t.Errorf("active=%d hasActive=%v, want 10/true", s.Active, s.HasActive)
	}
}

func TestParseSummaryLineCumulative(t *testing.T) {
	line := "summary =    250 in 00:00:30 =    8.3/s Avg:   118 Min:    40 Max:   400 Err:     2 (0.80%)"
	s, ok := ParseSummaryLine(line)
	if !ok {
		t.Fatal("line not recognised")
	}
	if !s.Cumulative {
		t.Error("\"=\" line not parsed as cumulative")
	}
	if s.Count != 250 || s.Errors != 2 {
		t.Errorf("count=%d errors=%d, want 250/2", s.Count, s.Errors)
	}
	if s.HasActive {
		t.Error("cumulative line should not carry Active")
	}
}

func TestParseSummaryLineFinalDelta(t *testing.T) {
	line := "summary +      8 in 00:00:02 =    3.6/s Avg:    11 Min:     9 Max:    21 Err:     1 (12.50%) Active: 0 Started: 10 Finished: 10"
	s, ok := ParseSummaryLine(line)
	if !ok {
		t.Fatal("final delta line not recognised")
	}
	if s.Count != 8 || s.Errors != 1 {
		t.Errorf("count=%d errors=%d, want 8/1", s.Count, s.Errors)
	}
	if !s.HasActive || s.Active != 0 {
		t.Errorf("active=%d hasActive=%v, want 0/true", s.Active, s.HasActive)
	}
}

func TestParseSummaryLineRejectsNonSummary(t *testing.T) {
	for _, line := range []string{
		"",
		"Starting standalone test @ 2026 Jun 12 10:00:00",
		"INFO o.a.j.r.Summariser: summariser started",
		"Tidying up ...    @ 2026 Jun 12 10:05:00",
		"summary of something else entirely",
	} {
		if _, ok := ParseSummaryLine(line); ok {
			t.Errorf("line %q should not parse", line)
		}
	}
}

func TestMetricFromSummary(t *testing.T) {
	delta := Summary{Count: 42, Errors: 3, Rate: 8.4, Active: 7, HasActive: true}
	data, emit := MetricFromSummary(delta, "r1", "a1")
	if !emit {
		t.Fatal("delta line should emit a metric")
	}
	if data.RunID != "r1" || data.AgentID != "a1" || data.FrameworkType != "jmeter" {
		t.Errorf("identity fields wrong: %+v", data)
	}
	if data.Requests != 42 || data.Errors != 3 || data.Rate != 8.4 || data.VUs != 7 {
		t.Errorf("values wrong: %+v", data)
	}

	cumulative := Summary{Cumulative: true, Count: 250, Errors: 9}
	if _, emit := MetricFromSummary(cumulative, "r1", "a1"); emit {
		t.Error("cumulative line must not emit (UI sums deltas; would double-count)")
	}
}
