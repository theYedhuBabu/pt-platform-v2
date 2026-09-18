# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**PT-Platform-v2** (Performance Testing Platform v2) is a **distributed load testing platform** that manages and orchestrates performance tests across a fleet of configurable agents. While currently implemented with JMeter, the platform is designed to support multiple testing frameworks and agent types.

### Architecture

- **Hub (Go backend)**: Central REST + WebSocket server (`:8080`) managing projects, tests, frameworks, agent configurations, and runs
- **Agents (extensible)**: Configurable agent processes (JMeter-based, Gatling, custom, etc.) that execute tests and stream back metrics
- **Frontend (React + TypeScript + Vite)**: Browser dashboard embedded in the Go binary via `go:embed`
- **ClickHouse**: Run metadata persistence for Grafana dashboarding (optional — hub starts without it)

### Domain Ownership

```
Project
  ├── FrameworkTypes  (global/settings — tool definitions like "jmeter-5.6")
  ├── Frameworks       (project-scoped — concrete test bundles with files)
  └── Tests
        └── Runs
```

No framework sharing between projects. Deleting a project cascades to its frameworks and tests. Deleting a framework sets `FrameworkID = NULL` on tests. Deleting a test cascades to its runs.

---

## Build & Run

### Backend (Go)

```bash
go build -o hub-server ./cmd/hub-server
./hub-server                  # listens on :8080, SQLite at internal/database/data/hub.db

go build -o jmeter-agent ./cmd/jmeter-agent
./jmeter-agent -id agent-1    # connects to ws://localhost:8080/ws; needs jmeter on PATH or JMETER_HOME

go test ./...
go fmt ./...
```

### JMeter agent flags

| Flag | Default | Purpose |
|------|---------|---------|
| `-id` | `{hostname}-{4hex}` | Agent ID (the hub addresses commands by this) |
| `-hub` | `ws://localhost:8080/ws` | Hub WebSocket URL |
| `-workdir` | `./runs` | Per-run workspaces (`{workdir}/{runID}/`) |
| `-csv-header` | `true` | First line of split CSVs is a header replicated to all agents |
| `-keep-workdir` | `false` | Keep run directories after completion (debugging) |

Unix only (process-group signals). Download limits: 5 min timeout, 500 MB per file.

### Frontend (React/TypeScript)

```bash
cd internal/hub-frontend
npm install
npm run dev       # Vite dev server, typically :5173
npm run build     # output to dist/ — embedded by go build
npm run lint
```

The frontend is embedded into the Go binary via `internal/hub-frontend/embed.go`. Run `npm run build` before `go build` to include latest frontend.

### Configuration (env vars)

| Var | Default | Purpose |
|-----|---------|---------|
| `DB_PATH` | `internal/database/data/hub.db` | SQLite file |
| `HUB_PORT` | `:8080` | Listen address |
| `HUB_HOST` | `http://localhost:8080` | Base URL agents use to download assets |
| `CORS_ALLOWED_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `SCRIPTS_DIR` | `data/scripts` | Local path for framework asset files |
| `RESULTS_DIR` | `data/results` | Local path for agent result uploads |
| `CLICKHOUSE_URL` | `http://localhost:8123` | ClickHouse HTTP endpoint |
| `CLICKHOUSE_USER` | `admin` | ClickHouse credentials |
| `CLICKHOUSE_PASSWORD` | `admin123` | ClickHouse credentials |
| `GRAFANA_BASE_URL` | `http://localhost:3000` | Grafana base URL for run log links |
| `GRAFANA_RUN_DASHBOARD_UID` | _(empty)_ | Grafana dashboard UID for run links |

### Schema reset

`CREATE TABLE IF NOT EXISTS` means new columns are NOT added to an existing DB. Delete `internal/database/data/hub.db` to apply schema changes.

---

## Directory Structure

```
cmd/hub-server/
  main.go                    -- Entry point: config, DB init, zombie reset, ClickHouse,
                             --   WS hub, router setup, frontend embedding, SPA fallback
cmd/jmeter-agent/
  main.go                    -- Agent entry point: config, client+runner wiring, signals, slog JSON

internal/
  agent/                     -- JMeter agent (Unix only; concurrent runs supported)
    config.go                -- Flags (-id/-hub/-workdir/-csv-header/-keep-workdir), download limits
    messages.go              -- CommandMessage mirror + Log/Status/Metric wire types
    client.go                -- WS client: reconnect forever (1s→30s backoff), 120s read deadline
                             --   refreshed by hub pings, Send (fire-and-forget),
                             --   SendStatusReliable (~60s retry), per-message handler goroutine
    runner.go                -- HandleCommand start/stop, run() pipeline: preflight → download
                             --   package → slice splits → launch → stream → upload → status
    workspace.go             -- SafeJoin (rejects abs/.. escapes), DownloadFile (cap, non-200), Wipe
    csvslice.go              -- SliceFileInPlace (two-pass, tmp+rename) + sliceBounds
    summariser.go            -- ParseSummaryLine + MetricFromSummary ("+"-line deltas only)
    executor.go              -- ResolveJMeter (PATH → JMETER_HOME), BuildArgs (sorted -J props),
                             --   StartProcess (Setpgid, line streaming), Stop (SIGTERM→SIGKILL 10s)
    results.go               -- HTTPBaseFromWS, HasJTL, ZipResults, UploadResults (3 retries)
  hub-config/
    config.go                -- Typed config struct loaded from env vars via Load()

  hub-ws/
    hub.go                   -- WS Hub: channel-based event loop, per-run UI routing,
                             --   GetAgentIDs(), SendCommand(), OnAgentStatus/OnAgentDisconnect hooks
    client.go                -- WS Client: readPump/writePump, 54s ping, ServeWs(), CloseSend()

  hub-clickhouse/
    client.go                -- ClickHouse HTTP client: CreateRunMetadataTable(),
                             --   UpsertRunMetadata() — called async on run start/stop

  hub-api/
    api.go                   -- SetupRouter: CORS, /ws, /static/frameworks, all /api routes
    handlers_projects.go     -- Projects CRUD + getProjectFrameworks
    handlers_frameworks.go   -- Frameworks CRUD + FrameworkTypes (Settings) CRUD
                             --   + getFrameworkFiles (walks disk, classifies by StructNode role)
                             --   + validateFrameworkEntry (confirms entrypoint exists; .jmx → csvParams)
    handlers_tests.go        -- Tests CRUD (create/get/delete); Artifacts stored as json.RawMessage
    handlers_runs.go         -- startRun, stopRun, getRunByID, getActiveRuns, getHistory,
                             --   CommandMessage, buildFileURLs, runMetadata/loadRunMetadata helpers
    handlers_files.go        -- parseJmx (legacy regex), uploadScript, staticFrameworkAsset
    handlers_results.go      -- uploadResults: agent ZIP upload → JTL merge → run marked passed
    handlers_agent_events.go -- AgentStatusHandler/AgentDisconnectHandler: persist agent-reported
                             --   failures, fail runs on mid-run agent disconnect

  tools/
    registry.go                -- Canonical tool registry: tools.Supported ("jmeter","k6","gatling"),
                               --   IsSupported() — validates FrameworkType.Tool, feeds /api/settings/tools
    jmeter/
      parser.go              -- ParseRequiredCSVs(path) + ParseRequiredCSVsFromBytes(content)
      parser_test.go
      results.go             -- MergeJTLs, ComputeStats (used by handlers_results.go)
      results_test.go

  database/
    database.go              -- SQLite init, WAL+FK pragmas, createTables() dispatcher
    projects.go              -- Project struct + DDL (cols: ProjectName/ClientName) + queries
    frameworks.go            -- Framework struct + DDL + queries (ToolType, SplitFiles, SharedFiles)
    frameworktypes.go        -- FrameworkType + StructNode struct + DDL + full CRUD
    tests.go                 -- Test struct + DDL + queries (includes Artifacts TEXT column)
    runs.go                  -- Run struct + DDL + queries; RunWithTest join;
                             --   ResetZombieRuns(), UpdateRunResults()
    init.sql                 -- Legacy/reference only (has typo — do not use)
    data/
      hub.db                 -- SQLite database file (gitignored)

  hub-frontend/
    embed.go                 -- //go:embed dist/* — exposes StaticFiles embed.FS
    src/
      App.tsx                -- Route definitions
      pages/
        Projects.tsx
        ProjectDetail.tsx
        TestDetails.tsx
        CreateTest.tsx       -- 4-step wizard: Framework → Entry point → Artifacts → Name
        CreateRun.tsx        -- agent + mode + split-file selection before starting a run
        RunLive.tsx
        Frameworks.tsx
        FrameworkDetail.tsx
        Agents.tsx
        ActiveRuns.tsx
        History.tsx
        Settings.tsx         -- FrameworkType JSON editor with live validation
      services/
        api.ts               -- apiFetch wrapper + legacy types (partially stale)
        projects.ts          -- Project type + getProjects/getProject/createProject/deleteProject
        tests.ts             -- Test, TestArtifacts, CreateTestData types + createTest/deleteTest
        runs.ts              -- Run, Agent, MetricPoint, LiveRun, LogLine types
        framework.ts         -- Framework, FrameworkType, StructNode types + all framework API
                             --   validateFrameworkFolderImport(), validateZipArchive()
                             --   filesFromDataTransfer() (drag-drop dir walker)
                             --   getFrameworkFiles(), validateEntryPoint()
                             --   hasEntrypoint(), hasSplit()
        agents.ts            -- Agent service
        liveMetrics.ts       -- WebSocket metrics handler
        mockService.ts       -- Temporary mock drop-in (swap imports to activate)
      hooks/
        useAgentSocket.ts    -- WebSocket hook for live run metrics
      layouts/
        DashboardLayout.tsx
      components/
        design/
          Charts.tsx
          Icons.tsx
          Shell.tsx
```

---

## Database Schema

SQLite. Foreign keys enforced via `PRAGMA foreign_keys=ON` on every connection. WAL mode enabled.

**Important**: Projects table uses `ProjectName` and `ClientName` as column names (not `Name`/`Client`) — the Go struct fields `Name`/`Client` map to these via explicit column references in queries.

### Projects

```sql
CREATE TABLE Projects (
  ID          TEXT PRIMARY KEY,
  ProjectName TEXT NOT NULL,   -- ← column is ProjectName (not Name)
  ClientName  TEXT NOT NULL,   -- ← column is ClientName (not Client)
  Environment TEXT NOT NULL,
  Description TEXT,
  Key         TEXT NOT NULL,
  CreatedAt   DATETIME NOT NULL,
  UpdatedAt   DATETIME,
  Status      TEXT NOT NULL    -- "ACTIVE" | "ARCHIVED"
);
```

### FrameworkTypes

Global settings table — defines tool types (e.g. "jmeter-5.6", "k6-latest").

```sql
CREATE TABLE FrameworkTypes (
  ID        TEXT PRIMARY KEY,
  Name      TEXT NOT NULL UNIQUE,      -- slug: "jmeter-5.6" (identity/versioning only)
  Tool      TEXT NOT NULL DEFAULT '',  -- canonical runtime from internal/tools registry: "jmeter" | "k6" | "gatling"
  Label     TEXT NOT NULL,             -- display: "JMeter 5.6"
  Structure TEXT NOT NULL,             -- JSON: map[string]StructNode
  CreatedAt DATETIME NOT NULL,
  UpdatedAt DATETIME
);
```

`Tool` is validated against `internal/tools/registry.go` (`tools.Supported`) on create/update and is what agents receive as `framework_type`. A startup migration in `database.go` (`migrateFrameworkTypesTool`) adds the column to pre-existing DBs and backfills rows whose Name matches a registry tool exactly or by `<tool>-` prefix; non-matching rows (e.g. "Jm-01") stay empty and must be set once via the Settings dropdown.

`Structure` is a `map[string]StructNode` JSON. `StructNode` fields: `required`, `split` (per-agent data), `entrypoint` (test entry points), `role` ("config"|"plugin"|"util", inherits down tree), `ext`, `children`.

### Frameworks

```sql
CREATE TABLE Frameworks (
  ID                  TEXT PRIMARY KEY,
  ProjectID           TEXT NOT NULL,
  Name                TEXT NOT NULL,
  Description         TEXT,
  SourceType          TEXT NOT NULL,   -- "git" | "upload"
  SourceRepo          TEXT,
  SourceBranch        TEXT,
  SourceLastPull      DATETIME,
  SourceAutoVersioned INTEGER DEFAULT 0,
  Version             TEXT,
  Envs                TEXT,            -- JSON array e.g. ["production","staging"]
  ScriptCount         INTEGER DEFAULT 0,
  ConfigCount         INTEGER DEFAULT 0,
  DataCount           INTEGER DEFAULT 0,
  PluginCount         INTEGER DEFAULT 0,
  UtilCount           INTEGER DEFAULT 0,
  UsageCount          INTEGER DEFAULT 0,
  ToolType            TEXT,            -- references FrameworkTypes.Name
  SplitFiles          TEXT,            -- JSON array: legacy, unused (startRun walks disk)
  SharedFiles         TEXT,            -- JSON array: legacy, unused (startRun walks disk)
  CreatedAt           DATETIME NOT NULL,
  UpdatedAt           DATETIME,
  FOREIGN KEY (ProjectID) REFERENCES Projects(ID) ON DELETE CASCADE
);
```

### Tests

```sql
CREATE TABLE Tests (
  ID                 TEXT PRIMARY KEY,
  ProjectID          TEXT NOT NULL,
  FrameworkID        TEXT,
  CategoryID         TEXT,
  Name               TEXT NOT NULL,
  Type               TEXT NOT NULL,   -- "native" | "external_imports"
  Mode               TEXT NOT NULL,   -- always "none" (mode is a run-time decision)
  Script             TEXT,            -- entry point path within framework (e.g. src/scripts/checkout.jmx)
  Artifacts          TEXT,            -- JSON: { configs:[], plugins:[], util:[], dataFiles:[] }
  Version            TEXT,
  EnvName            TEXT,
  LastStatus         TEXT,            -- write-through cache from latest Run
  LastRunAt          DATETIME,
  SourceFile         TEXT,
  LinkedNativeTestID TEXT,
  CreatedAt          DATETIME NOT NULL,
  UpdatedAt          DATETIME,
  Status             TEXT NOT NULL,
  FOREIGN KEY (ProjectID)          REFERENCES Projects(ID)   ON DELETE CASCADE,
  FOREIGN KEY (FrameworkID)        REFERENCES Frameworks(ID) ON DELETE SET NULL,
  FOREIGN KEY (LinkedNativeTestID) REFERENCES Tests(ID)      ON DELETE SET NULL
);
```

### Runs

```sql
CREATE TABLE Runs (
  ID          TEXT PRIMARY KEY,
  TestID      TEXT NOT NULL,
  Status      TEXT NOT NULL,    -- "running" | "passed" | "failed" | "stopped"
  Mode        TEXT NOT NULL,    -- "single" | "distributed"
  StartedAt   DATETIME NOT NULL,
  CompletedAt DATETIME,
  Duration    TEXT,
  RPS         REAL    DEFAULT 0,
  ErrPct      REAL    DEFAULT 0,
  P95         REAL    DEFAULT 0,
  P99         REAL    DEFAULT 0,
  Samples     INTEGER DEFAULT 0,
  Agents      TEXT,             -- JSON array of agent IDs
  SplitFiles  TEXT,             -- JSON array: data files split per agent (subset of Test.Artifacts.dataFiles)
  FOREIGN KEY (TestID) REFERENCES Tests(ID) ON DELETE CASCADE
);
```

---

## Go Types

### StructNode (`internal/database/frameworktypes.go`)

```go
type StructNode struct {
  Required   bool                  `json:"required,omitempty"`
  Split      bool                  `json:"split,omitempty"`       // contents are per-agent data split candidates
  Entrypoint bool                  `json:"entrypoint,omitempty"`  // contents are selectable entry points
  Role       string                `json:"role,omitempty"`        // "config" | "plugin" | "util" (inherits down)
  Ext        string                `json:"ext,omitempty"`
  Children   map[string]StructNode `json:"children,omitempty"`
}
```

### CommandMessage (`internal/hub-api/handlers_runs.go`)

```go
type CommandMessage struct {
  Action        string            `json:"action"`          // "start" | "stop"
  RunID         string            `json:"run_id"`
  RunMode       string            `json:"run_mode"`        // "single" | "distributed"
  AgentIndex    int               `json:"agent_index"`     // 0-based
  TotalAgents   int               `json:"total_agents"`
  FrameworkType string            `json:"framework_type"`  // canonical tool: "jmeter" | "k6" | "gatling"
  ToolVersion   string            `json:"tool_version"`    // FrameworkType Name slug, e.g. "jmeter-5.6"
  SharedURLs    map[string]string `json:"shared_urls"`     // filename → URL (same for all)
  SplitURLs     map[string]string `json:"split_urls"`      // filename → URL (agent serves own slice)
  JMeterParams  map[string]string `json:"jmeter_params"`   // agentId, runId, script
}
```

`framework_type`/`tool_version` come from `resolveTool()` in handlers_runs.go (FrameworkType row lookup by `Framework.ToolType`). Legacy fallback: row missing or `Tool` unset → the raw ToolType slug is sent with empty `tool_version`.

SplitURLs contain the full file — each agent slices it locally using `agent_index` / `total_agents`.

Agents receive the **entire framework package as uploaded** (disk walk of `SCRIPTS_DIR/frameworks/<id>/`): all files in SharedURLs, except the run's selected split files which move to SplitURLs. Single mode ships the package unchanged (split selection is cleared). Test.Artifacts no longer filters what agents receive — it drives UI selection only.

---

## API Routes

### Implemented

| Method | Route | Handler | Notes |
|--------|-------|---------|-------|
| GET | `/api/projects` | `getProjects` | Returns `{success, data[]}` with real `testCount` |
| POST | `/api/projects` | `createProject` | Returns `{success, id}` |
| GET | `/api/projects/:id` | `getProjectByID` | Returns `{success, project, tests, frameworks, testCount}` |
| DELETE | `/api/projects/:id` | `deleteProject` | |
| GET | `/api/projects/:id/frameworks` | `getProjectFrameworks` | Returns `{success, data[]}` |
| POST | `/api/projects/:id/tests` | `createTest` | Returns `{success, id}`. Artifacts as `json.RawMessage`. Mode always stored as `"none"`. |
| GET | `/api/projects/:id/tests/:tid` | `getTestByID` | Returns `{success, test, runs}` |
| DELETE | `/api/projects/:id/tests/:tid` | `deleteTest` | |
| POST | `/api/projects/:id/tests/:tid/run` | `startRun` | Accepts `{agentIds, mode, splitFiles[]}`. Ships the entire framework package from disk: every file → SharedURLs, except splitFiles[] → SplitURLs (distributed mode only; single mode ignores splitFiles). |
| GET | `/api/frameworks` | `getFrameworks` | `?projectId=` filter. Returns `{success, data[]}` |
| POST | `/api/frameworks` | `createFramework` | Multipart. Returns `{success, id, framework}`. Files saved to SCRIPTS_DIR. |
| GET | `/api/frameworks/:id` | `getFrameworkByID` | Returns `{success, data}` |
| DELETE | `/api/frameworks/:id` | `deleteFramework` | |
| GET | `/api/frameworks/:id/files` | `getFrameworkFiles` | Walks disk, classifies by StructNode role. Returns `{success, data: FrameworkFileSet}` |
| POST | `/api/frameworks/:id/validate-entry` | `validateFrameworkEntry` | Body: `{entryPoint}`. Returns `{success, valid, csvParams[], missingDeps[], warnings[]}` |
| GET | `/api/run/active` | `getActiveRuns` | Returns `{success, active, runs: RunWithTest[]}` |
| GET | `/api/runs/:runId` | `getRunByID` | Returns `{success, run: RunWithTest}` |
| POST | `/api/run/:rid/stop` | `stopRun` | Marks `stopped`, sends stop cmd to agents, CH upsert |
| POST | `/api/results/upload/:runId` | `uploadResults` | Agent ZIP under `file` key → unzip → merge JTLs → mark `passed` |
| GET | `/api/history` | `getHistory` | PascalCase response for legacy History.tsx; Grafana link in LogPath |
| GET | `/api/agents` | inline | Returns `{agents: string[]}` |
| GET | `/api/settings/tools` | `getSupportedTools` | Returns `{success, data: ["jmeter","k6","gatling"]}` from `internal/tools` registry |
| GET | `/api/settings/framework-types` | `getFrameworkTypes` | Returns `{success, data[]}` |
| POST | `/api/settings/framework-types` | `createFrameworkType` | `tool` required, validated against registry (400 otherwise) |
| PUT | `/api/settings/framework-types/:name` | `updateFrameworkType` | `tool` required, validated against registry (400 otherwise) |
| DELETE | `/api/settings/framework-types/:name` | `deleteFrameworkTypeHandler` | |
| POST | `/api/parse-jmx` | `parseJmx` | Legacy. Expects `jmx` form field. Use `validate-entry` instead. |
| POST | `/api/upload/script` | `uploadScript` | Legacy. |
| GET | `/static/frameworks/:fid/*assetPath` | `staticFrameworkAsset` | Serves files from SCRIPTS_DIR for agent downloads |
| GET | `/ws?agentId=` | `hubws.ServeWs` | WS: agents with ID; UI as `web-ui-{runId}` |

### Not yet implemented

- `PUT /api/projects/:id` — update project
- `PUT /api/projects/:id/tests/:tid` — update test

### Response conventions

- All JSON keys **camelCase** (except `/api/history` which is PascalCase)
- Timestamps: ISO 8601 UTC strings

---

## WebSocket Protocol

UI connects as `?agentId=web-ui-{runId}`. Agents connect as `?agentId=<agent-id>`.
Messages with a `run_id` are routed only to the matching `web-ui-{runId}` client.

### Server → Client (UI)

```json
{ "type": "metric", "run_id": "...", "data": { "run_id": "...", "agent_id": "...", "framework_type": "jmeter", "requests": 42, "errors": 1, "rate": 8.4, "vus": 100 } }
{ "run_id": "...", "log_line": "INFO ...", "agent_id": "agent-1" }
{ "run_id": "...", "status": "running"|"completed"|"failed"|"stopped", "agent_id": "SYSTEM", "reason": "..." }
```

Metric routing keys on `data.run_id` (not the top-level field). `requests`/`errors` are **per-interval counts** (the UI sums them for totals and plots each message as a point); `rate` is JMeter's own throughput for that window (requests/sec — so the UI shows req/s without dividing by the interval); `vus` is the current thread/VU count. The JMeter agent emits one metric per summariser `summary +` line (`-Jsummariser.interval=5`), skipping cumulative `summary =` lines to avoid double-counting.

### Agent → Server status persistence

Agent status messages (`{run_id, status, agent_id}`) are forwarded to the run UI **and** persisted via `Hub.OnAgentStatus` → `hubapi.AgentStatusHandler` (wired in main.go): a `"failed"` status marks the run failed (success only ever comes from results upload). `Hub.OnAgentDisconnect` → `hubapi.AgentDisconnectHandler` fails any active run the agent was part of when its connection drops without a same-ID replacement; the run UI gets a synthetic SYSTEM `failed` message with a `reason`. Late reports never overwrite a settled run (guard on `Status == "running"`).

---

## ClickHouse Schema

Table `metrics.run_metadata` (ReplacingMergeTree on `run_id`). `UpsertRunMetadata` always carries full fields — `runMetadata()`/`loadRunMetadata()` helpers in `handlers_runs.go` assemble it. `framework_type` carries the canonical tool and `tool_version` the FrameworkType Name slug (same `resolveTool()` mapping as agent CommandMessages); `CreateRunMetadataTable` self-heals older tables via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS tool_version`.

---

## Go Dependencies

```
github.com/gin-gonic/gin v1.12.0
github.com/gin-contrib/cors v1.7.7
github.com/mattn/go-sqlite3 v1.14.45
github.com/google/uuid v1.6.0
github.com/gorilla/websocket v1.5.3
```

---

## V1 Reference (`/Volumes/Sandisk_1TB/dev/JMeter-UI-Executor/`)

Already ported: WS hub pattern, JMX parser, zombie run recovery, frontend embedding, agent results upload, JMeter agent (rewritten for the v2 contract in `internal/agent/`).

Remaining (not started): Kafka metrics pipeline (topic `jmeter_metrics`, 1-second aggregation window).

---

## Known Issues & TODOs

1. **`PUT` handlers missing**: No update endpoint for projects or tests.

2. **TestCategories**: `CategoryID` column exists on Tests but no Categories table.

3. **Framework/project deletes orphan disk files**: DB rows cascade but files under `SCRIPTS_DIR/frameworks/<id>/` remain.

4. **Kafka/live metrics pipeline**: Not started. Runs can reach `passed` only via agent results upload, not live streaming.

5. **Legacy stale items in api.ts**:
   - `parseJmx` sends field `file` but server expects `jmx` — not currently called by any page
   - `createProject` (legacy) expects `result.project` but server returns `{success, id}` — use `projects.ts` version instead
   - `getActiveRun` returns wrong shape — use `runs.ts` / `getActiveRuns`

6. **32 frontend lint warnings** — mostly `any` types; 3 real issues in Charts.tsx, ActiveRuns ref-during-render, useAgentSocket reconnect closure.

7. **`internal/tools/jmeter/packager.go` + `validator.go`**: URL-building and dependency-resolution logic is inline in `startRun` / `validateFrameworkEntry` — not extracted yet.
