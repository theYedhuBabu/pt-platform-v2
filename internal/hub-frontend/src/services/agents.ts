import { apiFetch } from './api';

export async function getAgents(): Promise<string[]> {
  const result = await apiFetch<{ agents: string[] }>('/api/agents');
  return result.agents || [];
}
