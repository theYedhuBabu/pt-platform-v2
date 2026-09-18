package agent

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"
)

// stopGracePeriod is how long Stop waits after SIGTERM before SIGKILL —
// gives JMeter time to flush the JTL.
const stopGracePeriod = 10 * time.Second

// ResolveJMeter locates the jmeter binary: PATH first, then
// $JMETER_HOME/bin/jmeter.
func ResolveJMeter() (string, error) {
	if p, err := exec.LookPath("jmeter"); err == nil {
		return p, nil
	}
	home := os.Getenv("JMETER_HOME")
	if home == "" {
		return "", errors.New("jmeter not found in PATH and JMETER_HOME is not set")
	}
	p := filepath.Join(home, "bin", "jmeter")
	if info, err := os.Stat(p); err != nil || info.IsDir() {
		return "", fmt.Errorf("jmeter not found in PATH and %s is not a usable binary", p)
	}
	return p, nil
}

// BuildArgs assembles the non-GUI JMeter command line. Properties are
// emitted in sorted key order so the command is deterministic.
func BuildArgs(jmxPath, jtlPath, logPath string, props map[string]string) []string {
	args := []string{"-n", "-t", jmxPath, "-l", jtlPath, "-j", logPath}
	keys := make([]string, 0, len(props))
	for k := range props {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		args = append(args, fmt.Sprintf("-J%s=%s", k, props[k]))
	}
	return args
}

// Process is a running JMeter instance in its own process group (Unix only,
// same as v1 — group signals don't exist on Windows).
type Process struct {
	cmd     *exec.Cmd
	done    chan struct{}
	waitErr error
}

// StartProcess launches bin in dir, streaming every non-empty stdout/stderr
// line to onLine. The returned Process is already running.
func StartProcess(bin string, args []string, dir string, onLine func(string)) (*Process, error) {
	cmd := exec.Command(bin, args...)
	cmd.Dir = dir
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}

	p := &Process{cmd: cmd, done: make(chan struct{})}
	go func() {
		var wg sync.WaitGroup
		wg.Add(2)
		go func() { defer wg.Done(); streamLines(stdout, onLine) }()
		go func() { defer wg.Done(); streamLines(stderr, onLine) }()
		// Drain both pipes before Wait closes them.
		wg.Wait()
		p.waitErr = cmd.Wait()
		close(p.done)
	}()
	return p, nil
}

// PID returns the process ID.
func (p *Process) PID() int { return p.cmd.Process.Pid }

// Wait blocks until the process exits and returns its exit error.
func (p *Process) Wait() error {
	<-p.done
	return p.waitErr
}

// Stop SIGTERMs the process group, escalating to SIGKILL after the grace
// period. Blocks until the process is gone (at most the grace period).
func (p *Process) Stop() {
	pgid, err := syscall.Getpgid(p.cmd.Process.Pid)
	if err != nil {
		// Already gone, or not group leader — fall back to killing the process.
		p.cmd.Process.Kill() //nolint:errcheck
		return
	}
	syscall.Kill(-pgid, syscall.SIGTERM) //nolint:errcheck
	select {
	case <-p.done:
	case <-time.After(stopGracePeriod):
		syscall.Kill(-pgid, syscall.SIGKILL) //nolint:errcheck
	}
}

func streamLines(r io.Reader, onLine func(string)) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		if onLine != nil {
			onLine(line)
		}
	}
}
