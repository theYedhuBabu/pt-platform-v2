# JMeter Agent for PT-Platform-v2 — ✅ DONE (2026-06-12)

Implemented as planned (`cmd/jmeter-agent/` + `internal/agent/`, 9 files + 6 test files; all tests green, both binaries build). Smoke-tested against the live hub: connect/register/deregister verified. **Deviations from plan, both forced by the live frontend contract (useAgentSocket.ts MetricData), which the plan's metric section didn't match:**

1. **Metric semantics are per-interval deltas, not cumulative.** RunLive.tsx sums `data.requests` across messages for totals and plots each message as a sparkline point — cumulative values would double-count. The agent emits one metric per `summary +` line and skips `summary =` lines. `MetricTracker` (emit-on-change, designed for cumulative) was replaced by `MetricFromSummary`.
2. **Metric data fields are `vus` + `framework_type`, not `threads`** — again matching the frontend. `data.run_id` is also included because the hub routes metrics on `data.run_id`, not the top-level field (hub.go:115).

Not exercised end-to-end: a real JMeter run (live JMX scripts hit real targets — run the Verification section below manually).

## Context

The hub is agent-ready (run dispatch ships the full framework package; agent-reported failures and mid-run disconnects persist; results upload finalizes runs). This builds the first agent: a JMeter executor referencing the v1 agent (`/Volumes/Sandisk_1TB/dev/JMeter-UI-Executor/jmeter-agent`) but targeting the v2 contract.

**Decisions confirmed with user:**
1. Split CSVs sliced **in place** at the same relative path — JMX references data by relative path, no `-J` file mapping.
2. Slicing: first line = header replicated to all agents (default), remaining rows in contiguous chunks `[i·L/N, (i+1)·L/N)`; `-csv-header=false` flag treats all lines as data. Single mode / 1 agent → file unchanged.
3. Lives in the same repo/module: `cmd/jmeter-agent/` + `internal/agent/`.
4. Parse JMeter summariser stdout into live metric WS messages (`-Jsummariser.interval=5`; cumulative `summary =` for requests/errors, latest `Active:` for threads).

## Hub contract (already live, do not change)

- Connect `GET {hub}/ws?agentId=<id>`; hub pings every 54s; hub fails active runs on agent disconnect without same-ID replacement.
- Hub→agent `CommandMessage` (mirror of [handlers_runs.go](internal/hub-api/handlers_runs.go)): `action start|stop, run_id, run_mode, agent_index, total_agents, framework_type, shared_urls{relpath→url}, split_urls{relpath→url}, jmeter_params{agentId,runId,script}`. Split URLs serve the full file; agent slices. `stop` carries only action+run_id.
- Agent→hub (keys must match [hub.go](internal/hub-ws/hub.go) routing switch):
  - log `{run_id, agent_id, log_line}`
  - status `{run_id, agent_id, status, message?}` — hub persists `"failed"` ([handlers_agent_events.go](internal/hub-api/handlers_agent_events.go), guarded on run still `running`)
  - metric `{type:"metric", run_id, data:{agent_id, requests, errors, threads}}`
- Results: POST `{http-base}/api/results/upload/{runID}?agentId={id}`, multipart key `file`, ZIP must contain a `.jtl` ([handlers_results.go](internal/hub-api/handlers_results.go) finalizes when every agent dir has one).

## Package layout

```
cmd/jmeter-agent/main.go   -- config load, wiring, signal handling, slog JSON
internal/agent/
  config.go      -- Config: -id ({hostname}-{4hex} default), -hub (ws://localhost:8080/ws),
                 --   -workdir (./runs), -csv-header (true), -keep-workdir (false);
                 --   download timeout 5min / cap 500MB constants
  messages.go    -- CommandMessage, LogMessage, StatusMessage, MetricMessage (+Data)
  client.go      -- WS client: reconnect forever (1s→30s capped backoff, reset on connect),
                 --   read deadline ~120s refreshed by ping handler, writeMu single-writer
                 --   Send(any), SendStatusReliable (retry ~60s), dispatch handler in goroutine
  runner.go      -- Runner{active map[runID]*activeRun}, HandleCommand start/stop,
                 --   run() pipeline (below); Sender interface decouples from client
  workspace.go   -- RunDir, SafeJoin (reject abs + ".." escapes), DownloadFile
                 --   (timeout, size cap, non-200 reject), Wipe
  csvslice.go    -- SliceFileInPlace (tmp file + rename, line-streaming) + pure sliceBounds
  summariser.go  -- ParseSummaryLine regex + MetricTracker (emit-on-change)
  executor.go    -- ResolveJMeter (PATH then $JMETER_HOME/bin/jmeter), BuildArgs
                 --   (-n -t -l -j -J... sorted), Start (Setpgid, cmd.Dir=runDir,
                 --   stdout+stderr line streaming), Wait, Stop (SIGTERM -pgid → SIGKILL after 10s)
  results.go     -- HTTPBaseFromWS, ZipResults (results.jtl + jmeter.log), HasJTL,
                 --   UploadResults (multipart "file", 3 retries)
```

Unix-only process management (same as v1). `gorilla/websocket` already in go.mod (promote from indirect via go mod tidy).

## run() pipeline (order matters)

1. **Preflight** `ResolveJMeter()` before any download → on miss: log + status `failed` + return.
2. Status `running`.
3. Create `{workdir}/{runID}/`.
4. Download all `shared_urls` to `SafeJoin`ed relative paths (recreate package tree). Any failure → log + `failed` + wipe + return (never run a partial package).
5. Download `split_urls` to same relative paths, then `SliceFileInPlace(agent_index, total_agents, csvHeader)` — skip slicing when `run_mode=="single"` or `total_agents<=1`. Warn to run UI if a slice has no data rows.
6. Resolve JMX = `SafeJoin(runDir, jmeter_params["script"])`; stat → missing = `failed`.
7. Launch: props = jmeter_params + `agent_index`, `total_agents`, `summariser.interval=5`; `cmd.Dir = runDir`; register in `active`.
8. Each output line → LogMessage; same callback feeds `ParseSummaryLine` → MetricTracker → MetricMessage on change.
9. Wait; deregister.
10. Outcome:
    - `HasJTL` → zip + upload → status `completed` (upload failure after retries → `failed`).
    - No JTL → **no upload**, status `failed` with exit error (required: hub would otherwise wait forever for this agent's JTL).
    - Non-zero exit with JTL: upload anyway (partial results), then `failed` unless stop was requested (hub guard makes late reports no-ops on settled runs).
11. Wipe run dir unless `-keep-workdir`.

Stop command: SIGTERM process group, SIGKILL after 10s; unknown run_id → log only (hub already settled the run). Concurrent runs supported (per-run dirs/process groups). Shutdown signal: stop active runs, send failed statuses best-effort, close.

## Build order

1. `messages.go` (+ contract-key marshal test) → 2. `config.go` → 3. `csvslice.go`, `summariser.go` (+ tests, pure logic) → 4. `workspace.go`, `results.go` (+ tests: SafeJoin, HTTPBaseFromWS, zip, httptest upload) → 5. `executor.go` (BuildArgs test) → 6. `runner.go` → 7. `client.go` → 8. `main.go`.

## Unit tests

- **csvslice**: header replicated; chunks disjoint/contiguous/complete; L<N (header-only slices); n=1 no-op; no-header mode; empty file; missing trailing newline.
- **summariser**: real `summary +`/`summary =` lines incl. final `Active: 0`; non-summary rejected; tracker semantics.
- **messages**: exact JSON keys match hub routing (`type`, `run_id`, `log_line`, `status`, `data.agent_id`).
- **results**: ws→http/wss→https; zip entries; multipart field+URL via httptest.
- **workspace**: SafeJoin rejects `../`+abs; download cap/non-200.
- **executor**: BuildArgs formatting.

## Verification

```bash
go test ./... && go build -o hub-server ./cmd/hub-server && go build -o jmeter-agent ./cmd/jmeter-agent
./hub-server &
./jmeter-agent -id test-agent-1                 # jmeter on PATH or JMETER_HOME set
curl -s localhost:8080/api/agents               # ["test-agent-1"]
# create project/framework/test via UI, then:
curl -s -X POST localhost:8080/api/projects/<pid>/tests/<tid>/run \
  -d '{"agentIds":["test-agent-1"],"mode":"single","splitFiles":[]}'
# watch: websocat "ws://localhost:8080/ws?agentId=web-ui-<runId>" → logs, metrics ~5s, status
curl -s localhost:8080/api/runs/<runId>         # → "passed" with RPS/P95 after upload
# distributed: 2 agents, splitFiles:["src/data/x.csv"], -keep-workdir → inspect disjoint slices
# stop: POST /api/run/<rid>/stop mid-run → partial JTL uploaded, run stays "stopped"
# failure: hide jmeter binary → run marked failed in seconds (no hang)
```

## Known risks (accepted/documented)

- **Hub has no disconnect grace window**: transient WS blips mid-run fail the run even with instant reconnect (hub-side follow-up: grace timer in AgentDisconnectHandler — out of scope here).
- Line-based CSV slicing breaks quoted embedded newlines — matches JMeter CSVDataSet's own line-based behavior; documented, not fixed.
- Logs/metrics drop while disconnected (fire-and-forget); only status uses reliable retry.
- Windows unsupported (process-group signals), same as v1.

---

# Plan 2: Concrete Tool field on FrameworkTypes — ✅ DONE (2026-06-12)

Implemented and verified live (migration ran on hub.db; Jm-01 set to tool=jmeter via API). Agents now receive `framework_type` as the canonical tool ID plus `tool_version` with the Name slug — Plan 1's `messages.go` should match on `"jmeter"`. Deviation from plan: there is only one CommandMessage construction site in startRun (the second `FrameworkType:` at handlers_runs.go:150 is the ClickHouse metadata row, which intentionally keeps the raw slug). Added beyond plan (user request): tool badges on Frameworks cards and FrameworkDetail header; Shell.tsx `Select` retyped to `SelectHTMLAttributes`.

## Context

`Frameworks.ToolType` holds a FrameworkType **Name slug** ("jmeter-5.6") and `startRun` ships it verbatim as `CommandMessage.framework_type` — the name doubles as the agent runtime contract with no validation. A k6 structure under a JMeter-ish name sails through the hub and only fails on the agent at execution time.

**Decision (confirmed with user):** first-class `Tool` field on FrameworkTypes constrained to a backend-owned registry, picked via dropdown in the Settings editor — chosen over a tag inside `Structure` JSON (which mixes runtime metadata into the file-layout schema and stays free-text). `Name` returns to pure identity/versioning; `Tool` is the agent contract. Step one toward agent capability advertising (agents declare supported tools on WS register, `startRun` rejects unsupported — **out of scope here**).

## Contract amendment (supersedes "do not change" above for one field)

`CommandMessage.framework_type` changes from name slug ("jmeter-5.6") to canonical tool ID ("jmeter"); new field `tool_version` carries the FrameworkType Name for version-aware agents. **Sequencing: land this before (or with) agent `messages.go` / `runner.go`** so the agent matches `framework_type == "jmeter"` from day one and never learns slug-prefix matching.

## Changes

### Backend

1. **`internal/tools/registry.go` (new)** — `SupportedTools = []string{"jmeter", "k6", "gatling"}` + `IsSupportedTool(string) bool`. Single source of truth; adding a tool later is a one-line change.
2. **[frameworktypes.go](internal/database/frameworktypes.go)** — `Tool string` on the struct (`json:"tool"`), `Tool TEXT NOT NULL DEFAULT ''` in DDL, threaded through insert/select/update. Migration: idempotent `ALTER TABLE FrameworkTypes ADD COLUMN` at startup guarded by a `pragma table_info` check (preserves the live hub.db — Jm-01 was hand-fixed via SQL, don't force a reset); backfill existing rows by matching name prefix against the registry.
3. **handlers_frameworks.go** — `createFrameworkType`/`updateFrameworkType` reject missing/unknown `tool` with 400 (server-side enforcement, not just UI).
4. **`GET /api/settings/tools`** — returns `{success, data: [...]}` from the registry; feeds the dropdown so the list isn't duplicated in frontend code.
5. **handlers_runs.go `startRun`** — resolve the FrameworkType row from `framework.ToolType`; set `CommandMessage.FrameworkType = ft.Tool`, `ToolVersion = ft.Name`. Legacy fallback: `Tool == ""` → send the raw name as today (no behavior change for unmigrated rows).
6. **Optional cleanup**: `validateFrameworkEntry` branches on `tool == "jmeter"` instead of sniffing `.jmx` (keep the ext check as a secondary guard).

### Frontend

7. **framework.ts** — `tool: string` on the `FrameworkType` type; `getSupportedTools()` service call.
8. **Settings.tsx** — `<select>` for Tool next to Name/Label in the FrameworkType editor, fed by the endpoint; required on save. Show the tool on existing type cards so unmigrated (empty-Tool) rows are visible at a glance.
9. **Frameworks.tsx** — tool badge on framework cards (nice-to-have, last).

## Unit tests

- **registry**: known accepted, unknown/empty rejected.
- **frameworktypes**: CRUD round-trips `Tool`; migration adds column idempotently (run twice).
- **handlers**: create/update FrameworkType without/with bad `tool` → 400; with `"jmeter"` → 200.
- **startRun**: CommandMessage carries `framework_type:"jmeter"` + `tool_version:"jmeter-5.6"`; legacy empty-Tool row falls back to name.

## Verification

```bash
go test ./... && go build -o hub-server ./cmd/hub-server && ./hub-server   # existing hub.db: column auto-added, Jm-01 backfilled to "jmeter"
curl -s localhost:8080/api/settings/tools                                  # ["jmeter","k6","gatling"]
curl -s -X POST localhost:8080/api/settings/framework-types -d '{"name":"x","label":"X","tool":"jmetre","structure":"{}"}'  # 400
# Settings UI: dropdown present, existing Jm-01 shows tool=jmeter
# start a run, watch: websocat "ws://localhost:8080/ws?agentId=test-agent-1" → framework_type:"jmeter", tool_version:"jmeter-5.6"
```

## Out of scope (follow-ups)

- Agent capability advertising + `startRun` agent-compatibility validation + CreateRun greying out incompatible agents.
- Structure-vs-tool consistency check (a k6 file tree tagged `tool: jmeter` remains expressible; visible in the editor, accepted).
