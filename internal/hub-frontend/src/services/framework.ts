import { apiFetch } from './api';
import JSZip from 'jszip';

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

// Matches the Go database.Framework JSON response shape exactly.
export interface Framework {
  id: string;
  name: string;
  projectId: string;
  description: string;
  sourceType: string;           // "git" | "upload"
  sourceRepo?: string;
  sourceBranch?: string;
  sourceLastPull?: string;
  sourceAutoVersioned: boolean;
  version: string;
  envs: string;                 // raw JSON array string from server, e.g. '["prod","staging"]'
  scripts: number;
  configs: number;
  data: number;
  plugins: number;
  util: number;
  usageCount: number;
  toolType?: string;            // references FrameworkTypes.Name
  splitFiles?: string;          // raw JSON array string
  sharedFiles?: string;         // raw JSON array string
  createdAt: string;
  updatedAt: string;
}

export interface FrameworkDetails extends Framework {
  versions?: FrameworkVersion[];
  pluginFiles?: Plugin[];
}

export interface FrameworkType {
  id: string;
  name: string;
  tool: string; // canonical runtime: "jmeter" | "k6" | "gatling" ('' on unmigrated rows)
  label: string;
  structure: string; // raw JSON string
  createdAt: string;
  updatedAt: string;
}

export type ArtifactRole = 'config' | 'plugin' | 'util';

export interface FrameworkStructureNode {
  required?: boolean;
  split?: boolean;
  entrypoint?: boolean;  // marks files here as test entry points (e.g. .jmx, scenario .js)
  role?: ArtifactRole;   // artifact group for files here (entrypoint/split take precedence)
  ext?: string;
  children?: Record<string, FrameworkStructureNode>;
}

export type FrameworkStructure = Record<string, FrameworkStructureNode>;

export interface FrameworkImportEntry {
  file: File;
  path: string;
}

export interface FrameworkImportCounts {
  scripts: number;
  configs: number;
  data: number;
  plugins: number;
  util: number;
}

export interface FrameworkImportValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  entries: FrameworkImportEntry[];
  matchedFiles: string[];
  splitFiles: string[];
  sharedFiles: string[];
  entrypointPaths: string[];   // files under entrypoint: true nodes — selectable as test entry points
  counts: FrameworkImportCounts;
}

const emptyCounts = (): FrameworkImportCounts => ({
  scripts: 0,
  configs: 0,
  data: 0,
  plugins: 0,
  util: 0,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeImportPath(path: string): string {
  const parts = path
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..');
  return parts.join('/');
}

function fileArray(files: FileList | File[]): File[] {
  return Array.isArray(files) ? files : Array.from(files);
}

function getFrameworkImportEntries(
  files: FileList | File[],
  structureRoots: string[],
): FrameworkImportEntry[] {
  const entries = fileArray(files)
    .map((file) => ({
      file,
      path: normalizeImportPath(file.webkitRelativePath || file.name),
    }))
    .filter((entry) => entry.path);

  if (entries.length === 0) return [];

  const rootNames = new Set(structureRoots.map((root) => root.toLowerCase()));
  const firstSegment = entries[0].path.split('/')[0];
  const hasCommonWrapper = firstSegment
    && !rootNames.has(firstSegment.toLowerCase())
    && entries.every((entry) => entry.path.split('/')[0] === firstSegment)
    && entries.some((entry) => entry.path.includes('/'));

  if (!hasCommonWrapper) return entries;

  return entries
    .map((entry) => ({
      ...entry,
      path: normalizeImportPath(entry.path.split('/').slice(1).join('/')),
    }))
    .filter((entry) => entry.path);
}

// Reads a drag-and-drop DataTransfer into File objects whose names carry the
// path relative to the drop root. dataTransfer.files flattens directory
// structure, so dropped folders must be walked via webkitGetAsEntry instead.
export async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  // Entries must be collected synchronously — DataTransferItems expire once
  // the drop handler yields.
  const entries = Array.from(dt.items)
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => !!entry);
  if (entries.length === 0) return Array.from(dt.files);

  const files: File[] = [];
  const walk = async (entry: FileSystemEntry, parentPath: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject));
      files.push(parentPath ? new File([file], `${parentPath}/${file.name}`, { type: file.type }) : file);
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const dirPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    // readEntries returns results in batches; keep reading until it's empty
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject));
      if (batch.length === 0) break;
      for (const child of batch) {
        await walk(child, dirPath);
      }
    }
  };
  for (const entry of entries) {
    await walk(entry, '');
  }
  return files;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

function segmentMatches(pattern: string, segment: string): boolean {
  if (pattern === segment) return true;
  const source = escapeRegExp(pattern)
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${source}$`).test(segment);
}

function fileMatches(pattern: string, node: FrameworkStructureNode, segment: string): boolean {
  if (!segmentMatches(pattern, segment)) return false;
  return !node.ext || segment.toLowerCase().endsWith(node.ext.toLowerCase());
}

function collectStructureErrors(
  tree: Record<string, unknown>,
  errors: string[],
  basePath = '',
): void {
  Object.entries(tree).forEach(([name, rawNode]) => {
    const path = basePath ? `${basePath}/${name}` : name;
    if (!isRecord(rawNode)) {
      errors.push(`Invalid structure node at "${path}".`);
      return;
    }
    if (rawNode.ext != null && typeof rawNode.ext !== 'string') {
      errors.push(`Invalid ext at "${path}".`);
    }
    if (rawNode.entrypoint != null && typeof rawNode.entrypoint !== 'boolean') {
      errors.push(`Invalid entrypoint at "${path}": must be a boolean.`);
    }
    if (rawNode.role != null && !['config', 'plugin', 'util'].includes(rawNode.role as string)) {
      errors.push(`Invalid role at "${path}": must be "config", "plugin" or "util".`);
    }
    if (rawNode.children != null) {
      if (!isRecord(rawNode.children)) {
        errors.push(`Invalid children at "${path}".`);
      } else {
        collectStructureErrors(rawNode.children, errors, path);
      }
    }
  });
}

// Returns true if any node in the tree has entrypoint: true.
export function hasEntrypoint(tree: FrameworkStructure): boolean {
  return Object.values(tree).some((node) => {
    if (node.entrypoint === true) return true;
    if (node.children) return hasEntrypoint(node.children);
    return false;
  });
}

// Returns true if any node in the tree has split: true.
export function hasSplit(tree: FrameworkStructure): boolean {
  return Object.values(tree).some((node) => {
    if (node.split === true) return true;
    if (node.children) return hasSplit(node.children);
    return false;
  });
}

interface InternalEntry extends FrameworkImportEntry {
  segments: string[];
}

interface MatchedFile {
  path: string;
  split: boolean;
  entrypoint: boolean;
  role: ArtifactRole;
}

function validateTree(
  tree: FrameworkStructure,
  entries: InternalEntry[],
  errors: string[],
  matched: Map<string, MatchedFile>,
  basePath = '',
  split = false,
  entrypoint = false,
  role: ArtifactRole = 'config',
): void {
  Object.entries(tree).forEach(([pattern, node]) => {
    const nodePath = basePath ? `${basePath}/${pattern}` : pattern;
    const nodeEntrypoint = entrypoint || node.entrypoint === true;
    const nodeRole = node.role ?? role;

    if (node.children) {
      const directoryEntries = entries.filter((entry) => (
        entry.segments.length > 0 && segmentMatches(pattern, entry.segments[0])
      ));

      if (directoryEntries.length === 0) {
        if (node.required) errors.push(`Missing required folder: ${nodePath}`);
        return;
      }

      validateTree(
        node.children,
        directoryEntries
          .map((entry) => ({ ...entry, segments: entry.segments.slice(1) }))
          .filter((entry) => entry.segments.length > 0),
        errors,
        matched,
        nodePath,
        split || node.split === true,
        nodeEntrypoint,
        nodeRole,
      );
      return;
    }

    const matchingFiles = entries.filter((entry) => (
      entry.segments.length === 1 && fileMatches(pattern, node, entry.segments[0])
    ));

    if (matchingFiles.length === 0) {
      if (node.required) errors.push(`Missing required file: ${nodePath}`);
      return;
    }

    matchingFiles.forEach((entry) => {
      matched.set(entry.path, { path: entry.path, split, entrypoint: nodeEntrypoint, role: nodeRole });
    });
  });
}

// Counts come from the structure's tags (entrypoint, split, role) — the same
// classification GET /api/frameworks/:id/files uses — so the framework card
// and the test wizard's artifact groups always agree.
function countMatchedFile(match: MatchedFile, counts: FrameworkImportCounts): void {
  if (match.entrypoint) {
    counts.scripts += 1;
  } else if (match.split) {
    counts.data += 1;
  } else if (match.role === 'plugin') {
    counts.plugins += 1;
  } else if (match.role === 'util') {
    counts.util += 1;
  } else {
    counts.configs += 1;
  }
}

export function validateFrameworkFolderImport(
  files: FileList | File[] | null,
  structureJSON: string,
): FrameworkImportValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const counts = emptyCounts();
  let structure: FrameworkStructure = {};

  try {
    const parsed = JSON.parse(structureJSON);
    if (!isRecord(parsed)) {
      errors.push('Framework structure must be a JSON object.');
    } else {
      collectStructureErrors(parsed, errors);
      structure = parsed as FrameworkStructure;
    }
  } catch {
    errors.push('Framework structure is not valid JSON.');
  }

  // Structure-level check: must have at least one entrypoint node so tests can be created.
  if (errors.length === 0 && !hasEntrypoint(structure)) {
    errors.push(
      'Structure has no entrypoint defined. Set "entrypoint": true on the folder containing executable files (e.g. scripts/ for JMeter, src/scenarios/ for k6).',
    );
  }

  const entries = files ? getFrameworkImportEntries(files, Object.keys(structure)) : [];
  if (entries.length === 0) {
    errors.push('Choose a package folder with at least one file.');
  }

  const matched = new Map<string, MatchedFile>();
  if (errors.length === 0) {
    validateTree(
      structure,
      entries.map((entry) => ({ ...entry, segments: entry.path.split('/') })),
      errors,
      matched,
    );

    if (matched.size === 0) {
      errors.push('No files matched the selected framework structure.');
    }
  }

  entries.forEach((entry) => {
    if (!matched.has(entry.path) && !entry.path.split('/').some((part) => part.startsWith('.'))) {
      warnings.push(`Ignored by structure: ${entry.path}`);
    }
  });

  const matchedFiles = Array.from(matched.values()).sort((a, b) => a.path.localeCompare(b.path));
  matchedFiles.forEach((match) => countMatchedFile(match, counts));

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    entries,
    matchedFiles: matchedFiles.map((m) => m.path),
    splitFiles: matchedFiles.filter((m) => m.split).map((m) => m.path),
    sharedFiles: matchedFiles.filter((m) => !m.split).map((m) => m.path),
    entrypointPaths: matchedFiles.filter((m) => m.entrypoint).map((m) => m.path),
    counts,
  };
}

// Inspect a ZIP archive (File) in-browser and validate its entries against the
// provided framework structure JSON. Returns the same validation shape as
// `validateFrameworkFolderImport` so the UI can reuse existing flows.
export async function validateZipArchive(
  zipFile: File,
  structureJSON: string,
): Promise<FrameworkImportValidation> {
  const zip = await JSZip.loadAsync(zipFile);
  const files: File[] = [];

  const addPromises: Promise<void>[] = [];
  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    const rel = normalizeImportPath(relativePath);
    const p = entry.async('blob').then((blob) => {
      // Create a File object for validation; the true content is unnecessary
      // for structure-only validation, but entrypoint JMX parsing will need
      // the blob to be read separately.
      const fname = rel.split('/').pop() || rel;
      const f = new File([blob], fname, { type: blob.type });
      // Attach webkitRelativePath used by existing helpers.
      (f as any).webkitRelativePath = rel;
      files.push(f);
    });
    addPromises.push(p);
  });
  await Promise.all(addPromises);

  return validateFrameworkFolderImport(files, structureJSON);
}

// Files on disk under a framework directory, grouped by structure role.
// Populated by GET /api/frameworks/:id/files.
export interface FrameworkFileSet {
  entrypoints: string[];
  configs: string[];
  plugins: string[];
  util: string[];
  dataFiles: string[];
}

// Returns files grouped by the structure's node roles (entrypoint, config, plugin, util, data).
export async function getFrameworkFiles(frameworkId: string): Promise<FrameworkFileSet> {
  const result = await apiFetch<{ data: FrameworkFileSet }>(`/api/frameworks/${frameworkId}/files`);
  return result.data;
}

export interface EntryPointValidation {
  missing: string[];   // artifact paths referenced by entry point but not in selection
  warnings: string[];  // non-fatal issues
}

// Hub reads the entry point from disk and resolves its declared dependencies.
export async function validateEntryPoint(
  frameworkId: string,
  entryPoint: string,
): Promise<EntryPointValidation> {
  const result = await apiFetch<{
    success: boolean;
    valid: boolean;
    csvParams: string[];
    missingDeps: string[];
    warnings: string[];
  }>(
    `/api/frameworks/${frameworkId}/validate-entry`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryPoint }),
    },
  );
  return {
    missing: result.missingDeps ?? [],
    warnings: result.warnings ?? [],
  };
}

export async function getFrameworks(): Promise<Framework[]> {
  const result = await apiFetch<{ data: Framework[] }>('/api/frameworks');
  return result.data || [];
}

export async function getFramework(id: string): Promise<FrameworkDetails> {
  const result = await apiFetch<{ data: FrameworkDetails }>(`/api/frameworks/${id}`);
  return result.data;
}

export async function createFramework(projectId: string, formData: FormData): Promise<Framework> {
  formData.append('projectId', projectId);
  const result = await apiFetch<{ framework: Framework }>('/api/frameworks', {
    method: 'POST',
    body: formData,
  });
  return result.framework;
}

export async function deleteFramework(id: string): Promise<void> {
  await apiFetch(`/api/frameworks/${id}`, { method: 'DELETE' });
}

export async function getProjectFrameworks(id: string): Promise<Framework[]> {
  const result = await apiFetch<{ data: Framework[] }>(`/api/projects/${id}/frameworks`);
  return result.data ?? [];
}

export async function fetchFrameworkTypes(): Promise<FrameworkType[]> {
  const r = await apiFetch<{ data: FrameworkType[] }>('/api/settings/framework-types');
  return r.data ?? [];
}

export async function fetchSupportedTools(): Promise<string[]> {
  const r = await apiFetch<{ data: string[] }>('/api/settings/tools');
  return r.data ?? [];
}

export async function createFrameworkType(
  name: string,
  tool: string,
  label: string,
  structure: string,
): Promise<void> {
  await apiFetch('/api/settings/framework-types', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, tool, label, structure }),
  });
}

export async function updateFrameworkType(
  name: string,
  tool: string,
  label: string,
  structure: string,
): Promise<void> {
  await apiFetch(`/api/settings/framework-types/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, tool, label, structure }),
  });
}

export async function deleteFrameworkType(name: string): Promise<void> {
  await apiFetch(`/api/settings/framework-types/${name}`, { method: 'DELETE' });
}
