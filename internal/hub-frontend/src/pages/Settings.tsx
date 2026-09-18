import { useState, useEffect } from 'react';
import { PageHead, Panel, Btn, Field, Input, Select, Switch, Modal, Empty } from '../components/design/Shell';
import {
  fetchFrameworkTypes, fetchSupportedTools, createFrameworkType, updateFrameworkType, deleteFrameworkType,
  hasEntrypoint, hasSplit, type FrameworkStructure, type FrameworkType,
} from '../services/framework';

const STORAGE_KEY = 'jm_settings';

interface AppSettings {
  agentScanInterval: number;
  maxLogLines: number;
  autoScrollLogs: boolean;
  showAgentMetricsOnDash: boolean;
}

const defaults: AppSettings = {
  agentScanInterval: 30,
  maxLogLines: 1000,
  autoScrollLogs: true,
  showAgentMetricsOnDash: true,
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch { return defaults; }
}

async function saveFrameworkType(ft: { name: string; tool: string; label: string; structure: string }, editing: boolean): Promise<void> {
  if (editing) {
    await updateFrameworkType(ft.name, ft.tool, ft.label, ft.structure);
  } else {
    await createFrameworkType(ft.name, ft.tool, ft.label, ft.structure);
  }
}

// --- Component ---

const DEFAULT_STRUCTURE = JSON.stringify({
  scripts: { entrypoint: true, required: true, ext: '.jmx' },
  data: { split: true, children: { '*.csv': { ext: '.csv' } } },
  plugins: { role: 'plugin', children: { '*.jar': { ext: '.jar' } } },
  util: { role: 'util', children: { '*.groovy': { ext: '.groovy' } } },
}, null, 2);

function parseStructure(raw: string): { parsed: unknown; error: string } {
  try {
    return { parsed: JSON.parse(raw), error: '' };
  } catch (e: unknown) {
    return { parsed: null, error: e instanceof SyntaxError ? e.message : 'Invalid JSON' };
  }
}

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [saved, setSaved] = useState(false);

  const [fwTypes, setFwTypes] = useState<FrameworkType[]>([]);
  const [fwLoading, setFwLoading] = useState(true);
  const [fwModal, setFwModal] = useState<{ open: boolean; editing: FrameworkType | null }>({ open: false, editing: null });
  const [fwForm, setFwForm] = useState({ name: '', tool: '', label: '', structure: DEFAULT_STRUCTURE });
  const [toolOptions, setToolOptions] = useState<string[]>([]);
  const [fwError, setFwError] = useState('');
  const [fwSaving, setFwSaving] = useState(false);
  const [structureJsonError, setStructureJsonError] = useState('');
  const [structureHasEntrypoint, setStructureHasEntrypoint] = useState(true);
  const [structureHasSplit, setStructureHasSplit] = useState(true);

  useEffect(() => {
    fetchFrameworkTypes()
      .then(setFwTypes)
      .finally(() => setFwLoading(false));
    fetchSupportedTools().then(setToolOptions).catch(() => setToolOptions([]));
  }, []);

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) =>
    setSettings(p => ({ ...p, [k]: v }));

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setSettings(defaults);
    localStorage.removeItem(STORAGE_KEY);
  };

  const applyStructure = (raw: string) => {
    const { parsed, error } = parseStructure(raw);
    setStructureJsonError(error);
    setStructureHasEntrypoint(!error && hasEntrypoint(parsed as FrameworkStructure));
    setStructureHasSplit(!error && hasSplit(parsed as FrameworkStructure));
  };

  const handleStructureChange = (raw: string) => {
    setFwForm(f => ({ ...f, structure: raw }));
    applyStructure(raw);
  };

  const handleFormatStructure = () => {
    const { parsed, error } = parseStructure(fwForm.structure);
    if (!error) setFwForm(f => ({ ...f, structure: JSON.stringify(parsed, null, 2) }));
  };

  const openNewFwType = () => {
    setFwForm({ name: '', tool: '', label: '', structure: DEFAULT_STRUCTURE });
    setFwError('');
    applyStructure(DEFAULT_STRUCTURE);
    setFwModal({ open: true, editing: null });
  };

  const openEditFwType = (ft: FrameworkType) => {
    setFwForm({ name: ft.name, tool: ft.tool ?? '', label: ft.label, structure: ft.structure });
    setFwError('');
    applyStructure(ft.structure);
    setFwModal({ open: true, editing: ft });
  };

  const handleFwSave = async () => {
    if (!fwForm.name.trim() || !fwForm.label.trim()) {
      setFwError('Name and label are required.');
      return;
    }
    if (!fwForm.tool) {
      setFwError('Tool is required — agents use it to pick the runtime that executes the framework.');
      return;
    }
    const { parsed, error } = parseStructure(fwForm.structure);
    if (error) {
      setFwError(`Structure is not valid JSON: ${error}`);
      return;
    }
    if (!hasEntrypoint(parsed as FrameworkStructure)) {
      setFwError('Structure must have at least one node with "entrypoint": true — tests need an entry point to execute.');
      return;
    }
    setFwSaving(true);
    setFwError('');
    try {
      await saveFrameworkType(fwForm, !!fwModal.editing);
      const updated = await fetchFrameworkTypes();
      setFwTypes(updated);
      setFwModal({ open: false, editing: null });
    } catch (e: any) {
      setFwError(e?.message ?? 'Save failed.');
    } finally {
      setFwSaving(false);
    }
  };

  const handleFwDelete = async (name: string) => {
    if (!confirm(`Delete framework type "${name}"? This cannot be undone.`)) return;
    try {
      await deleteFrameworkType(name);
      setFwTypes(t => t.filter(x => x.name !== name));
    } catch (e: any) {
      alert(e?.message ?? 'Delete failed.');
    }
  };

  const wsUrl = import.meta.env.DEV
    ? 'ws://localhost:8080/ws'
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
  const apiUrl = import.meta.env.DEV ? 'http://localhost:8080' : window.location.origin;

  return (
    <div className="page">
      <PageHead
        eyebrow="System"
        title="Settings"
        desc="Hub connection details, UI preferences, and framework type definitions."
        actions={
          <div className="flex gap8">
            <Btn kind="ghost" onClick={handleReset}>Reset to defaults</Btn>
            <Btn kind="primary" icon={saved ? 'check' : undefined} onClick={handleSave}>
              {saved ? 'Saved!' : 'Save settings'}
            </Btn>
          </div>
        }
      />

      <div className="grid cols-2 mb24" style={{ alignItems: 'start' }}>
        <Panel title="Hub connection">
          <Field label="API base URL" hint="Read-only — set by build environment.">
            <Input value={apiUrl} readOnly mono />
          </Field>
          <Field label="WebSocket URL" hint="Read-only — set by build environment.">
            <Input value={wsUrl} readOnly mono />
          </Field>
        </Panel>

        <Panel title="Agent fleet">
          <Field label="Rescan interval (seconds)" hint="How often the Agents page polls /api/agents.">
            <Input
              type="number" min={5} max={300}
              value={settings.agentScanInterval}
              onChange={e => set('agentScanInterval', Number(e.target.value))}
            />
          </Field>
          <Field label="Show agent metrics on Dashboard">
            <Switch on={settings.showAgentMetricsOnDash} onClick={() => set('showAgentMetricsOnDash', !settings.showAgentMetricsOnDash)} />
          </Field>
        </Panel>

        <Panel title="Logs">
          <Field label="Max log lines retained" hint="Older lines are discarded when this limit is reached.">
            <Input
              type="number" min={100} max={10000}
              value={settings.maxLogLines}
              onChange={e => set('maxLogLines', Number(e.target.value))}
            />
          </Field>
          <Field label="Auto-scroll log terminal">
            <Switch on={settings.autoScrollLogs} onClick={() => set('autoScrollLogs', !settings.autoScrollLogs)} />
          </Field>
        </Panel>

        <Panel title="About">
          <table className="tbl">
            <tbody>
              <tr><td className="muted">App</td><td>PT Platform Hub</td></tr>
              <tr><td className="muted">Frontend</td><td>React + Vite (TypeScript)</td></tr>
              <tr><td className="muted">Build</td><td className="mono">{import.meta.env.MODE}</td></tr>
              <tr><td className="muted">Theme</td><td className="mono">{localStorage.getItem('jm_theme') || 'slate'}</td></tr>
            </tbody>
          </table>
        </Panel>
      </div>

      {/* Framework Types */}
      <Panel
        title="Framework Types"
        sub="Define the structure and asset layout for each tool type (JMeter, K6, Gatling, etc.)"
        right={<Btn kind="primary" sm onClick={openNewFwType}>+ Add type</Btn>}
      >
        {fwLoading ? (
          <p className="muted" style={{ padding: '12px 0' }}>Loading…</p>
        ) : fwTypes.length === 0 ? (
          <Empty icon="layers" title="No framework types defined" desc="Add a type to validate framework structure on import." />
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Tool</th>
                <th>Label</th>
                <th>Structure</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fwTypes.map(ft => (
                <tr key={ft.name}>
                  <td className="mono">{ft.name}</td>
                  <td>
                    {ft.tool
                      ? <span className="badge neutral">{ft.tool}</span>
                      : <span className="badge warn">not set</span>}
                  </td>
                  <td>{ft.label}</td>
                  <td className="muted" style={{ maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ft.structure}
                  </td>
                  <td>
                    <div className="flex gap8" style={{ justifyContent: 'flex-end' }}>
                      <Btn kind="ghost" sm onClick={() => openEditFwType(ft)}>Edit</Btn>
                      <Btn kind="ghost" sm onClick={() => handleFwDelete(ft.name)}>Delete</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {fwModal.open && (
        <Modal
          title={fwModal.editing ? `Edit: ${fwModal.editing.label}` : 'New Framework Type'}
          onClose={() => setFwModal({ open: false, editing: null })}
          foot={
            <div className="flex gap8" style={{ justifyContent: 'flex-end' }}>
              <Btn kind="ghost" onClick={() => setFwModal({ open: false, editing: null })}>Cancel</Btn>
              <Btn kind="primary" onClick={handleFwSave} disabled={fwSaving}>
                {fwSaving ? 'Saving…' : 'Save'}
              </Btn>
            </div>
          }
        >
          <Field label="Name (slug)" hint='Unique identifier, e.g. "jmeter-5.6" or "k6-latest". Cannot be changed after creation.'>
            <Input
              value={fwForm.name}
              onChange={e => setFwForm(f => ({ ...f, name: e.target.value }))}
              disabled={!!fwModal.editing}
              mono
            />
          </Field>
          <Field label="Tool" hint="Runtime agents use to execute frameworks of this type.">
            <Select
              value={fwForm.tool}
              onChange={e => setFwForm(f => ({ ...f, tool: e.target.value }))}
            >
              <option value="" disabled>Select tool…</option>
              {toolOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Label" hint="Human-readable display name, e.g. JMeter 5.6.">
            <Input
              value={fwForm.label}
              onChange={e => setFwForm(f => ({ ...f, label: e.target.value }))}
            />
          </Field>
          <Field
            label="Structure JSON"
            hint='Recursive tree. Node keys: required, split, entrypoint, role, ext, children. Mark executable folders "entrypoint": true (tests pick their entry point there), data folders "split": true (per-agent split candidates), and group the rest with role: "plugin" | "util" | "config" (default config).'
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <Btn kind="ghost" sm onClick={handleFormatStructure} disabled={!!structureJsonError}>
                Format
              </Btn>
            </div>
            <textarea
              className="input mono"
              style={{
                minHeight: 280,
                resize: 'vertical',
                fontFamily: 'monospace',
                fontSize: 12,
                borderColor: structureJsonError ? 'var(--red)' : undefined,
              }}
              value={fwForm.structure}
              onChange={e => handleStructureChange(e.target.value)}
              spellCheck={false}
            />
            {structureJsonError && (
              <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 4 }}>
                JSON error: {structureJsonError}
              </p>
            )}
            {!structureJsonError && !structureHasEntrypoint && (
              <p style={{ color: 'var(--yellow, #e5a000)', fontSize: 12, marginTop: 4 }}>
                No <code>entrypoint: true</code> node found — tests won't be able to select an entry point.
              </p>
            )}
            {!structureJsonError && !structureHasSplit && (
              <p style={{ color: 'var(--yellow, #e5a000)', fontSize: 12, marginTop: 4 }}>
                No <code>split: true</code> node found — files won't be classified as data files, so they can't be split across agents.
              </p>
            )}
          </Field>
          {fwError && <p style={{ color: 'var(--red)', marginTop: 4, fontSize: 13 }}>{fwError}</p>}
        </Modal>
      )}
    </div>
  );
}
