import { apiFetch } from './api';
import type { Test } from './tests';

export interface Project {
  id: string;
  name: string;
  client: string;
  description?: string;
  env: string;
  key: string;
  createdAt: string;
  status: string;
  testCount: number;
}

export async function getProjects(): Promise<Project[]> {
  const result = await apiFetch<{ data: Project[] }>('/api/projects');
  return result.data || [];
}

export async function getProject(id: string): Promise<{ project: Project; tests: Test[] }> {
  return apiFetch(`/api/projects/${id}`);
}

export async function createProject(
  name: string,
  client: string,
  env: string,
  key: string,
  description?: string,
): Promise<{ id: string }> {
  const result = await apiFetch<{ success: boolean; id: string }>('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, client, env, key, description }),
  });
  return { id: result.id };
}

export async function deleteProject(id: string): Promise<void> {
  await apiFetch(`/api/projects/${id}`, { method: 'DELETE' });
}
