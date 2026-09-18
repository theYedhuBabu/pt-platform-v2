package agent

import (
	"reflect"
	"testing"
)

func TestBuildArgs(t *testing.T) {
	args := BuildArgs("/run/x.jmx", "/run/results.jtl", "/run/jmeter.log", map[string]string{
		"runId":               "r1",
		"agentId":             "a1",
		"total_agents":        "3",
		"agent_index":         "1",
		"summariser.interval": "5",
	})
	want := []string{
		"-n",
		"-t", "/run/x.jmx",
		"-l", "/run/results.jtl",
		"-j", "/run/jmeter.log",
		"-JagentId=a1",
		"-Jagent_index=1",
		"-JrunId=r1",
		"-Jsummariser.interval=5",
		"-Jtotal_agents=3",
	}
	if !reflect.DeepEqual(args, want) {
		t.Errorf("BuildArgs:\n got %v\nwant %v", args, want)
	}
}

func TestBuildArgsNoProps(t *testing.T) {
	args := BuildArgs("a.jmx", "r.jtl", "j.log", nil)
	want := []string{"-n", "-t", "a.jmx", "-l", "r.jtl", "-j", "j.log"}
	if !reflect.DeepEqual(args, want) {
		t.Errorf("BuildArgs = %v", args)
	}
}
