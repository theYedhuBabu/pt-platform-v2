# JMeter Hub — API Spec

The canonical spec is **[openapi.yaml](./openapi.yaml)** (OpenAPI 3.0.3).

Load it in [Swagger UI](https://editor.swagger.io/) or import into Postman/Insomnia.
To generate Go server stubs: `oapi-codegen -generate chi-server,types -package api openapi.yaml`

---

## Quick reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agents` | List connected agents |
| `POST` | `/api/parse-jmx` | Parse JMX → required CSV names |
| `POST` | `/api/upload/script` | Upload JMX + CSVs |
| `GET` | `/api/projects` | List projects |
| `POST` | `/api/projects` | Create project |
| `GET` | `/api/projects/:projectId` | Project + tests |
| `PUT` | `/api/projects/:projectId` | Update project |
| `DELETE` | `/api/projects/:projectId` | Delete project + tests |
| `POST` | `/api/projects/:projectId/tests` | Create test |
| `PUT` | `/api/projects/:projectId/tests/:testId` | Update test |
| `DELETE` | `/api/projects/:projectId/tests/:testId` | Delete test |
| `POST` | `/api/projects/:projectId/tests/:testId/run` | Start a run |
| `GET` | `/api/frameworks` | List frameworks |
| `POST` | `/api/frameworks` | Import framework bundle |
| `GET` | `/api/frameworks/:frameworkId` | Framework detail |
| `DELETE` | `/api/frameworks/:frameworkId` | Delete framework |
| `GET` | `/api/run/active` | Active run state |
| `POST` | `/api/run/:runId/stop` | Stop active run |
| `GET` | `/api/runs/:runId` | Run record by ID |
| `GET` | `/api/history` | All historical runs (legacy PascalCase) |
| `WS` | `/ws?runId=` | Live metrics, logs, run status |

---

## WebSocket message shapes

### Server → Client

```json
// Metric tick (per agent, ~1/sec while running)
{ "type": "metric", "data": { "agent_id": "agent-1", "requests": 1234, "errors": 5, "threads": 100 } }

// Log line
{ "log_line": "INFO ...", "agent_id": "agent-1" }

// Run status change
{ "status": "running" | "completed" | "failed" | "stopped", "agent_id": "SYSTEM" }
```

### Client → Server

```json
{ "action": "start" | "stop", "targetAgentId": "agent-1" }
```

---

## Known issues / TODOs

- `GET /api/history` returns Go-default **PascalCase** fields (`ID`, `ScriptName`, etc.) — add `json:` tags to the struct and update the frontend `TestRun` interface to camelCase.