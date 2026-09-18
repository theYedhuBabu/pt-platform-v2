/* ---- Live Metrics ---- */

export interface MetricPoint {
  ts: number; // unix timestamp
  rps: number;
  p95: number;
  errPct: number;
}

export interface LiveRun {
  runId: string;
  testId: string;
  projectId: string;
  status: 'running' | 'stopping' | 'stopped';
  startedAt: number;
  metrics: MetricPoint[];
  activeAgents: string[];
  logLines: LogLine[];
}

export interface LogLine {
  ts: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  agent: string;
  text: string;
}