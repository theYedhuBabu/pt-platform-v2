/**
 * TEMPORARY MOCK — delete when done validating UI.
 *
 * Fully self-contained drop-in for framework.ts + api.ts.
 * To activate in any page, swap the import:
 *
 *   import { getFrameworks, getProjectFrameworks, ... } from '../services/_mock';
 *
 * Swap back to the real services to restore live API calls.
 */

// ─── Interfaces (copied from framework.ts / api.ts) ───────────────────────────

export interface LoadParam {
  key: string;
  value: string | number;
  unit?: string;
  sla?: boolean;
}

export interface JMXScript {
  name: string;
  description: string;
  params: LoadParam[];
}

export interface EnvConfig {
  env: string;
  file: string;
  params: Array<{ key: string; value: string }>;
}

export interface DataFile {
  name: string;
  env: string | null;
  rows: number;
  size: string;
}

export interface Plugin {
  name: string;
  size: string;
  description: string;
}

export interface UtilScript {
  name: string;
  size: string;
}

export interface FrameworkSource {
  type: 'git' | 'upload';
  repo?: string;
  branch?: string;
  lastPull?: string;
  autoVersioned: boolean;
}

export interface FrameworkVersion {
  v: string;
  label: string;
  sha?: string;
  branch?: string;
  date: string;
  author: string;
  note: string;
  current: boolean;
}

export interface Framework {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  description: string;
  source: FrameworkSource;
  versions: FrameworkVersion[];
  envs: string[];
  scripts: JMXScript[];
  configs: EnvConfig[];
  data: DataFile[];
  plugins: Plugin[];
  util: UtilScript[];
  usageCount: number;
  createdAt: string;
}

export interface FrameworkDetails extends Framework {}

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

export interface Test {
  id: string;
  name: string;
  projectId: string;
  scriptName: string;
  frameworkId?: string;
  lastStatus?: string;
  lastRunAt?: string;
  createdAt: string;
}

export interface TestRun {
  ID: string;
  ScriptName: string;
  Status: string;
  StartTime: string;
  EndTime: string;
  LogPath: string;
}

// ─── Static data ──────────────────────────────────────────────────────────────

export const MOCK_PROJECTS: Project[] = [
  {
    id: 'proj-1',
    name: 'Checkout Platform',
    client: 'Acme Corp',
    description: 'End-to-end checkout flow performance suite.',
    env: 'production',
    key: 'CKT',
    createdAt: '2025-11-01T09:00:00Z',
    status: 'active',
    testCount: 3,
  },
  {
    id: 'proj-2',
    name: 'Payments Gateway',
    client: 'Acme Corp',
    description: 'Load tests for the payment processing service.',
    env: 'staging',
    key: 'PAY',
    createdAt: '2025-12-15T14:30:00Z',
    status: 'active',
    testCount: 2,
  },
  {
    id: 'proj-3',
    name: 'User Auth Service',
    client: 'Internal',
    description: 'Auth service stress tests.',
    env: 'qa',
    key: 'AUTH',
    createdAt: '2026-01-20T11:00:00Z',
    status: 'active',
    testCount: 0,
  },
];

export const MOCK_FRAMEWORKS: Framework[] = [
  {
    id: 'fw-1',
    name: 'checkout-core-suite',
    projectId: 'proj-1',
    projectName: 'Checkout Platform',
    description: 'Core JMeter bundle for checkout flow tests — includes cart, coupon, and payment steps.',
    source: { type: 'git', repo: 'git@github.com:acme/checkout-suite.git', branch: 'main', lastPull: '2026-05-28T08:12:00Z', autoVersioned: true },
    versions: [
      { v: 'main · 2.3.1 · a3f9c1d', label: '2.3.1', sha: 'a3f9c1d', branch: 'main', date: '2026-05-28', author: 'alice', note: 'Add coupon validation step', current: true },
      { v: 'main · 2.2.0 · b7e2a88', label: '2.2.0', sha: 'b7e2a88', branch: 'main', date: '2026-04-10', author: 'bob', note: 'Refactor cart thread group', current: false },
      { v: 'main · 2.1.0 · c1d3f55', label: '2.1.0', sha: 'c1d3f55', branch: 'main', date: '2026-02-20', author: 'alice', note: 'Initial stable release', current: false },
    ],
    envs: ['production', 'staging', 'qa'],
    scripts: [
      { name: 'checkout_500vu.jmx', description: '500 virtual users, 10 min ramp', params: [{ key: 'vusers', value: 500 }, { key: 'rampup', value: 120, unit: 's' }, { key: 'p95_sla', value: 1200, unit: 'ms', sla: true }] },
      { name: 'checkout_1000vu.jmx', description: '1000 virtual users, stress test', params: [{ key: 'vusers', value: 1000 }, { key: 'rampup', value: 180, unit: 's' }, { key: 'p95_sla', value: 2000, unit: 'ms', sla: true }] },
    ],
    configs: [
      { env: 'production', file: 'config/prod.properties', params: [{ key: 'host', value: 'checkout.acme.com' }, { key: 'port', value: '443' }] },
      { env: 'staging', file: 'config/staging.properties', params: [{ key: 'host', value: 'staging-checkout.acme.com' }, { key: 'port', value: '443' }] },
    ],
    data: [
      { name: 'users_prod.csv', env: 'production', rows: 50000, size: '4.2 MB' },
      { name: 'users_staging.csv', env: 'staging', rows: 5000, size: '420 KB' },
      { name: 'products_shared.csv', env: null, rows: 12000, size: '1.1 MB' },
    ],
    plugins: [
      { name: 'checkout-plugins-2.3.1.jar', size: '2.8 MB', description: 'Custom samplers and listeners for checkout metrics' },
    ],
    util: [
      { name: 'generate_tokens.sh', size: '3.1 KB' },
      { name: 'seed_coupons.py', size: '1.8 KB' },
    ],
    usageCount: 2,
    createdAt: '2025-11-05T10:00:00Z',
  },
  {
    id: 'fw-2',
    name: 'checkout-smoke-suite',
    projectId: 'proj-1',
    projectName: 'Checkout Platform',
    description: 'Lightweight smoke test bundle — 10 VU sanity checks before each deploy.',
    source: { type: 'upload', autoVersioned: false },
    versions: [
      { v: '1.0.0', label: '1.0.0', date: '2026-03-01', author: 'charlie', note: 'Initial upload', current: true },
    ],
    envs: ['production', 'staging'],
    scripts: [
      { name: 'smoke_10vu.jmx', description: '10 VU sanity check, 2 min', params: [{ key: 'vusers', value: 10 }, { key: 'duration', value: 120, unit: 's' }] },
    ],
    configs: [],
    data: [
      { name: 'test_accounts.csv', env: null, rows: 20, size: '1.2 KB' },
    ],
    plugins: [],
    util: [],
    usageCount: 1,
    createdAt: '2026-03-01T15:00:00Z',
  },
  {
    id: 'fw-3',
    name: 'payments-core-suite',
    projectId: 'proj-2',
    projectName: 'Payments Gateway',
    description: 'Payment processor load tests — card auth, refunds, and webhook throughput.',
    source: { type: 'git', repo: 'git@github.com:acme/payments-suite.git', branch: 'release/1.x', lastPull: '2026-06-01T07:00:00Z', autoVersioned: true },
    versions: [
      { v: 'release/1.x · 1.4.2 · f4a0b3c', label: '1.4.2', sha: 'f4a0b3c', branch: 'release/1.x', date: '2026-06-01', author: 'diana', note: 'Fix refund thread timing', current: true },
      { v: 'release/1.x · 1.4.0 · e9c2d11', label: '1.4.0', sha: 'e9c2d11', branch: 'release/1.x', date: '2026-05-12', author: 'diana', note: 'Add webhook throughput script', current: false },
    ],
    envs: ['staging'],
    scripts: [
      { name: 'card_auth_200vu.jmx', description: 'Card authorisation at 200 VU', params: [{ key: 'vusers', value: 200 }, { key: 'p99_sla', value: 800, unit: 'ms', sla: true }] },
      { name: 'refund_50vu.jmx', description: 'Refund flow at 50 VU', params: [{ key: 'vusers', value: 50 }] },
      { name: 'webhook_throughput.jmx', description: 'Webhook delivery throughput', params: [{ key: 'tps_target', value: 500 }] },
    ],
    configs: [
      { env: 'staging', file: 'config/staging.yaml', params: [{ key: 'gateway_url', value: 'https://pay-staging.acme.com' }, { key: 'api_key_env', value: 'PAY_STAGING_KEY' }] },
    ],
    data: [
      { name: 'card_tokens.csv', env: null, rows: 10000, size: '780 KB' },
      { name: 'merchant_ids.csv', env: 'staging', rows: 500, size: '12 KB' },
    ],
    plugins: [
      { name: 'payments-sampler-1.4.2.jar', size: '1.4 MB', description: 'Custom payment protocol sampler' },
      { name: 'hmac-signer-1.0.jar', size: '220 KB', description: 'Request signing utility' },
    ],
    util: [
      { name: 'rotate_api_keys.sh', size: '2.4 KB' },
    ],
    usageCount: 2,
    createdAt: '2025-12-20T09:30:00Z',
  },
];

export const MOCK_TESTS: Record<string, Test[]> = {
  'proj-1': [
    { id: 'test-1', name: 'Checkout 500 VU baseline', projectId: 'proj-1', scriptName: 'checkout_500vu.jmx', frameworkId: 'fw-1', lastStatus: 'passed', lastRunAt: '2026-06-09T14:22:00Z', createdAt: '2025-11-10T10:00:00Z' },
    { id: 'test-2', name: 'Checkout 1000 VU stress', projectId: 'proj-1', scriptName: 'checkout_1000vu.jmx', frameworkId: 'fw-1', lastStatus: 'failed', lastRunAt: '2026-06-08T09:45:00Z', createdAt: '2025-11-12T10:00:00Z' },
    { id: 'test-3', name: 'Pre-deploy smoke check', projectId: 'proj-1', scriptName: 'smoke_10vu.jmx', frameworkId: 'fw-2', lastStatus: 'passed', lastRunAt: '2026-06-10T07:05:00Z', createdAt: '2026-03-02T08:00:00Z' },
  ],
  'proj-2': [
    { id: 'test-4', name: 'Card auth 200 VU', projectId: 'proj-2', scriptName: 'card_auth_200vu.jmx', frameworkId: 'fw-3', lastStatus: 'passed', lastRunAt: '2026-06-07T16:00:00Z', createdAt: '2026-01-05T11:00:00Z' },
    { id: 'test-5', name: 'Webhook throughput baseline', projectId: 'proj-2', scriptName: 'webhook_throughput.jmx', frameworkId: 'fw-3', createdAt: '2026-06-01T12:00:00Z' },
  ],
  'proj-3': [],
};

// ─── Drop-in service functions ─────────────────────────────────────────────────

const delay = (ms = 300) => new Promise<void>((r) => setTimeout(r, ms));

export async function getProjects(): Promise<Project[]> {
  await delay();
  return MOCK_PROJECTS;
}

export async function getProject(id: string): Promise<{ project: Project; tests: Test[] }> {
  await delay();
  const project = MOCK_PROJECTS.find((p) => p.id === id);
  if (!project) throw new Error(`Project ${id} not found`);
  return { project, tests: MOCK_TESTS[id] ?? [] };
}

export async function getFrameworks(): Promise<Framework[]> {
  await delay();
  return MOCK_FRAMEWORKS;
}

export async function getFramework(id: string): Promise<FrameworkDetails> {
  await delay();
  const fw = MOCK_FRAMEWORKS.find((f) => f.id === id);
  if (!fw) throw new Error(`Framework ${id} not found`);
  return fw;
}

export async function getProjectFrameworks(projectId: string): Promise<Framework[]> {
  await delay();
  return MOCK_FRAMEWORKS.filter((f) => f.projectId === projectId);
}

export async function createFramework(_projectId: string, _formData: FormData): Promise<Framework> {
  await delay(600);
  throw new Error('createFramework is a no-op in mock mode');
}

export async function deleteFramework(_id: string): Promise<void> {
  await delay();
  throw new Error('deleteFramework is a no-op in mock mode');
}

export async function getActiveRun(): Promise<{ active: boolean; runId: string | null }> {
  await delay();
  return { active: false, runId: null };
}
