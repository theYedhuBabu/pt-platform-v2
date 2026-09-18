import { apiFetch } from './api';
import type { Run } from './runs';

export interface TestArtifacts {
  configs: string[];
  plugins: string[];
  util: string[];
  dataFiles: string[];
}

export interface Test {
  id: string;
  name: string;
  projectId: string;
  scriptName: string;
  frameworkId?: string;
  artifacts?: TestArtifacts;
  lastStatus?: string;
  lastRunAt?: string;
  createdAt: string;
}

export interface CreateTestData {
  name: string;
  type: 'native' | 'external_imports';
  scriptName?: string;
  frameworkId?: string;
  artifacts?: TestArtifacts;
  version?: string;
  envName?: string;
}

export async function getTest(
  projectId: string,
  testId: string,
): Promise<{ test: Test; runs: Run[] }> {
  return apiFetch(`/api/projects/${projectId}/tests/${testId}`);
}

export async function createTest(
  projectId: string,
  data: CreateTestData,
): Promise<{ id: string }> {
  const result = await apiFetch<{ success: boolean; id: string }>(
    `/api/projects/${projectId}/tests`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    },
  );
  return { id: result.id };
}

export async function deleteTest(projectId: string, testId: string): Promise<void> {
  await apiFetch(`/api/projects/${projectId}/tests/${testId}`, { method: 'DELETE' });
}
