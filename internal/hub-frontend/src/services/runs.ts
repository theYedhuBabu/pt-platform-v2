import { apiFetch } from './api';

export interface Run {
  id: string;
  testId: string;
  status: string;        // "running" | "passed" | "failed" | "stopped"
  mode: string;          // "single" | "distributed" | "none"
  startedAt: string;
  completedAt?: string;
  duration?: string;
  rps: number;
  errPct: number;
  p95: number;
  p99: number;
  samples: number;
  agents: string;        // raw JSON array string
  splitFiles?: string;   // raw JSON array string
}

// Run joined with its test, as returned by GET /api/runs/:runId
export interface RunWithTest extends Run {
  testName: string;
  projectId: string;
  scriptName: string;
}

// Legacy PascalCase shape returned by GET /api/history
export interface TestRun {
  ID: string;
  ScriptName: string;
  Status: string;
  StartTime: string;
  EndTime: string;
  LogPath: string;
}

export async function getActiveRun(): Promise<{ active: boolean; runId: string | null }> {
  const result = await apiFetch<{ active: boolean; runs: Array<{ id: string }> }>('/api/run/active');
  return {
    active: result.active,
    runId: result.runs?.[0]?.id ?? null,
  };
}

export async function startRun(
  projectId: string,
  testId: string,
  agentIds?: string[],
  splitFiles?: string[],
  mode?: 'single' | 'distributed',
): Promise<{ runId: string }> {
  return apiFetch(`/api/projects/${projectId}/tests/${testId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentIds, splitFiles, mode }),
  });
}

export async function getRun(runId: string): Promise<RunWithTest> {
  const result = await apiFetch<{ success: boolean; run: RunWithTest }>(`/api/runs/${runId}`);
  return result.run;
}

export async function stopRun(runId: string): Promise<void> {
  await apiFetch(`/api/run/${runId}/stop`, { method: 'POST' });
}

export async function getHistory(): Promise<TestRun[]> {
  const result = await apiFetch<{ data: TestRun[] }>('/api/history');
  return result.data || [];
}
