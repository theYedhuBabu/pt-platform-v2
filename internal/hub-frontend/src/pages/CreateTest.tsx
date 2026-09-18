import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHead, Panel, Btn, Field, Input, Empty, cx } from '../components/design/Shell';
import { Icons as Ic } from '../components/design/Icons';
import { createTest, type TestArtifacts } from '../services/tests';
import {
  getProjectFrameworks,
  fetchFrameworkTypes,
  getFrameworkFiles,
  validateEntryPoint,
  type Framework,
  type FrameworkType,
  type FrameworkFileSet,
  type EntryPointValidation,
} from '../services/framework';

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS = ['Framework', 'Entry point', 'Artifacts', 'Name'];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex gap0" style={{ marginBottom: 28 }}>
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex" style={{ flex: 1, alignItems: 'center' }}>
            <div className="flex" style={{ flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600,
                background: done ? 'var(--accent)' : active ? 'var(--blue)' : 'var(--panel-2)',
                color: done || active ? '#fff' : 'var(--text-mute)',
                border: '2px solid ' + (done ? 'var(--accent)' : active ? 'var(--blue)' : 'var(--border)'),
                flexShrink: 0,
              }}>
                {done ? <Ic.check style={{ width: 13, height: 13 }} /> : i + 1}
              </div>
              <span style={{
                fontSize: 11.5, fontWeight: active ? 600 : 400,
                color: active ? 'var(--text)' : done ? 'var(--accent)' : 'var(--text-mute)',
                whiteSpace: 'nowrap',
              }}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: '0 6px', marginBottom: 22,
                background: done ? 'var(--accent)' : 'var(--border)',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Framework selection ───────────────────────────────────────────────

function FrameworkCard({
  fw, selected, onClick,
}: { fw: Framework; selected: boolean; onClick: () => void }) {
  return (
    <div
      className={cx('panel', selected && 'sel')}
      style={{
        cursor: 'pointer', padding: 16,
        border: `2px solid ${selected ? 'var(--blue)' : 'var(--border)'}`,
        borderRadius: 8, background: selected ? 'var(--blue-soft, rgba(59,130,246,.06))' : 'var(--panel)',
        transition: 'border-color .15s',
      }}
      onClick={onClick}
    >
      <div className="flex gap8 mb8" style={{ alignItems: 'center' }}>
        <Ic.layers style={{ width: 16, height: 16, color: 'var(--blue)', flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: 14, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fw.name}
        </span>
        {fw.toolType && (
          <span className="tag mono" style={{ fontSize: 11 }}>{fw.toolType}</span>
        )}
      </div>
      {fw.description && (
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>{fw.description}</div>
      )}
      <div className="flex gap12 muted" style={{ fontSize: 11.5, fontFamily: 'var(--mono)' }}>
        {fw.scripts > 0 && <span>{fw.scripts} script{fw.scripts !== 1 ? 's' : ''}</span>}
        {fw.data > 0 && <span>{fw.data} data</span>}
        {fw.plugins > 0 && <span>{fw.plugins} plugin{fw.plugins !== 1 ? 's' : ''}</span>}
        {fw.version && <span className="ver" style={{ marginLeft: 'auto' }}>{fw.version}</span>}
      </div>
    </div>
  );
}

// ── Step 3: Artifact group ────────────────────────────────────────────────────

function ArtifactGroup({
  label, icon, files, selected, count, onToggle,
}: {
  label: string;
  icon: React.ReactNode;
  files: string[];
  selected: string[];
  count: number;
  onToggle: (file: string) => void;
}) {
  const pending = files.length === 0 && count > 0;
  const empty = files.length === 0 && count === 0;
  if (empty) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="flex gap8 mb8" style={{ alignItems: 'center' }}>
        {icon}
        <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
        <span className="muted" style={{ fontSize: 12 }}>
          {pending ? `${count} imported, none found on disk` : `${files.length} file${files.length !== 1 ? 's' : ''}`}
        </span>
      </div>
      {pending ? (
        <div style={{ padding: '10px 12px', border: '1px dashed var(--border)', borderRadius: 6, fontSize: 12.5, color: 'var(--text-mute)' }}>
          No {label.toLowerCase()} matched the framework type's structure on disk.
          Re-import the framework with its folder structure intact.
        </div>
      ) : (
        <div className="grid" style={{ gap: 6 }}>
          {files.map((f) => {
            const on = selected.includes(f);
            return (
              <div key={f} className={cx('checkrow', on && 'sel')} onClick={() => onToggle(f)}>
                <div className="cbox">{on && <Ic.check />}</div>
                <span className="mono" style={{ fontSize: 12.5 }}>{f}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CreateTest() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // Navigation
  const [step, setStep] = useState(0);

  // Step 1
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [loadingFw, setLoadingFw] = useState(true);
  const [selectedFw, setSelectedFw] = useState<Framework | null>(null);

  // Step 2
  const [frameworkType, setFrameworkType] = useState<FrameworkType | null>(null);
  const [fileSet, setFileSet] = useState<FrameworkFileSet | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [entryPoint, setEntryPoint] = useState('');

  // Step 3
  const [artifacts, setArtifacts] = useState<TestArtifacts>({ configs: [], plugins: [], util: [], dataFiles: [] });
  const [validation, setValidation] = useState<EntryPointValidation | null>(null);
  const [validating, setValidating] = useState(false);

  // Step 4
  const [testName, setTestName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId) return;
    getProjectFrameworks(projectId)
      .then(setFrameworks)
      .finally(() => setLoadingFw(false));
  }, [projectId]);

  const selectFramework = async (fw: Framework) => {
    setSelectedFw(fw);
    setEntryPoint('');
    setFileSet(null);
    setValidation(null);
    setArtifacts({ configs: [], plugins: [], util: [], dataFiles: [] });

    // Load framework type structure + file listing in parallel
    setLoadingFiles(true);
    try {
      const [types, files] = await Promise.all([
        fetchFrameworkTypes(),
        getFrameworkFiles(fw.id).catch(() => null),
      ]);
      const ft = types.find((t) => t.name === fw.toolType) ?? null;
      setFrameworkType(ft);
      if (files) {
        setFileSet(files);
        // Pre-select all non-data files; data files left to user
        setArtifacts({
          configs: files.configs,
          plugins: files.plugins,
          util: files.util,
          dataFiles: [],
        });
      }
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleValidate = async () => {
    if (!selectedFw || !entryPoint) return;
    setValidating(true);
    try {
      const result = await validateEntryPoint(selectedFw.id, entryPoint);
      setValidation(result);
    } catch {
      setValidation({ missing: [], warnings: ['Validation service not yet available.'] });
    } finally {
      setValidating(false);
    }
  };

  const toggleArtifact = (field: keyof TestArtifacts, file: string) => {
    setArtifacts((prev) => {
      const list = prev[field];
      return {
        ...prev,
        [field]: list.includes(file) ? list.filter((f) => f !== file) : [...list, file],
      };
    });
  };

  const handleCreate = async () => {
    if (!projectId || !selectedFw || !testName.trim() || !entryPoint.trim()) return;
    setSaving(true);
    setError('');
    try {
      await createTest(projectId, {
        name: testName.trim(),
        type: 'native',
        frameworkId: selectedFw.id,
        scriptName: entryPoint,
        artifacts,
      });
      navigate(`/projects/${projectId}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create test');
    } finally {
      setSaving(false);
    }
  };

  // ── Can proceed from each step ───────────────────────────────────────────────

  const canNext = [
    !!selectedFw,                          // step 0 → 1
    !!entryPoint.trim(),                   // step 1 → 2
    true,                                  // step 2 → 3 (artifacts optional)
    !!testName.trim() && !saving,          // step 3 → create
  ];

  const back = () => setStep((s) => s - 1);
  const next = () => setStep((s) => s + 1);

  if (loadingFw) {
    return (
      <div className="page">
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-mute)' }}>Loading…</div>
      </div>
    );
  }

  const entryPointHint = frameworkType
    ? (() => {
        try {
          const structure = JSON.parse(frameworkType.structure);
          const hints: string[] = [];
          const walk = (tree: Record<string, unknown>, path = '') => {
            Object.entries(tree).forEach(([key, node]: [string, unknown]) => {
              const n = node as Record<string, unknown>;
              const p = path ? `${path}/${key}` : key;
              if (n.entrypoint) hints.push(p);
              if (n.children) walk(n.children as Record<string, unknown>, p);
            });
          };
          walk(structure);
          return hints.length ? `e.g. ${hints[0]}/your-script${(frameworkType.structure.includes('.jmx') ? '.jmx' : '.js')}` : 'e.g. scripts/checkout.jmx';
        } catch { return 'e.g. scripts/checkout.jmx'; }
      })()
    : 'e.g. scripts/checkout.jmx';

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageHead
        eyebrow={
          <span className="crumb" style={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${projectId}`)}>
            ← Back to project
          </span>
        }
        title="Create test"
        desc="Configure a reusable test definition from an existing framework."
      />

      <StepBar current={step} />

      {/* ── Step 0: Framework ── */}
      {step === 0 && (
        <Panel title="Select framework" sub="Choose the framework bundle this test will use.">
          {frameworks.length === 0 ? (
            <Empty
              icon="layers"
              title="No frameworks in this project"
              desc="Import a framework bundle before creating a test."
              action={
                <Btn kind="primary" onClick={() => navigate(`/projects/${projectId}`)}>
                  Go import a framework
                </Btn>
              }
            />
          ) : (
            <div className="grid" style={{ gap: 10 }}>
              {frameworks.map((fw) => (
                <FrameworkCard
                  key={fw.id}
                  fw={fw}
                  selected={selectedFw?.id === fw.id}
                  onClick={() => selectFramework(fw)}
                />
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* ── Step 1: Entry point ── */}
      {step === 1 && selectedFw && (
        <Panel
          title="Entry point"
          sub="The script that will be executed when this test runs."
        >
          <div className="flex gap8 mb16" style={{ padding: '10px 12px', background: 'var(--panel-2)', borderRadius: 6, alignItems: 'center' }}>
            <Ic.layers style={{ width: 14, height: 14, color: 'var(--blue)' }} />
            <span style={{ fontWeight: 600, fontSize: 13 }}>{selectedFw.name}</span>
            {selectedFw.toolType && <span className="tag mono" style={{ fontSize: 11 }}>{selectedFw.toolType}</span>}
          </div>

          {loadingFiles ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-mute)', fontSize: 13 }}>
              Loading file list…
            </div>
          ) : fileSet && fileSet.entrypoints.length > 0 ? (
            <Field label="Entry point file">
              <select
                className="select"
                value={entryPoint}
                onChange={(e) => setEntryPoint(e.target.value)}
              >
                <option value="">Select entry point…</option>
                {fileSet.entrypoints.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </Field>
          ) : (
            <Field
              label="Entry point file"
              hint={`Path relative to the framework root. ${entryPointHint}`}
            >
              <Input
                mono
                placeholder={entryPointHint}
                value={entryPoint}
                autoFocus
                onChange={(e) => setEntryPoint(e.target.value)}
              />
              <p style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 6 }}>
                No entry points were found in this framework — its files may not match the
                framework type's structure. Enter the path manually, or re-import the framework
                with its folder structure intact.
              </p>
            </Field>
          )}
        </Panel>
      )}

      {/* ── Step 2: Artifacts ── */}
      {step === 2 && selectedFw && (
        <Panel title="Artifacts" sub="Select which framework files this test will use.">
          {/* Validation */}
          <div className="flex gap8 mb20" style={{ alignItems: 'flex-start' }}>
            <Btn
              kind="ghost"
              sm
              icon="refresh"
              onClick={handleValidate}
              disabled={validating || !entryPoint}
            >
              {validating ? 'Validating…' : 'Validate dependencies'}
            </Btn>
            {validation && (
              <div style={{ flex: 1 }}>
                {validation.missing.length === 0 && validation.warnings.length === 0 && (
                  <span style={{ fontSize: 12.5, color: 'var(--accent)' }}>
                    <Ic.check style={{ width: 13, height: 13, display: 'inline', marginRight: 4 }} />
                    No missing dependencies
                  </span>
                )}
                {validation.missing.map((m) => (
                  <div key={m} style={{ fontSize: 12.5, color: 'var(--red)' }}>Missing: <code>{m}</code></div>
                ))}
                {validation.warnings.map((w) => (
                  <div key={w} style={{ fontSize: 12.5, color: 'var(--yellow, #e5a000)' }}>{w}</div>
                ))}
              </div>
            )}
          </div>

          <ArtifactGroup
            label="Data files"
            icon={<Ic.file style={{ width: 14, height: 14, color: 'var(--text-mute)' }} />}
            files={fileSet?.dataFiles ?? []}
            selected={artifacts.dataFiles}
            count={selectedFw.data}
            onToggle={(f) => toggleArtifact('dataFiles', f)}
          />
          <ArtifactGroup
            label="Config files"
            icon={<Ic.settings style={{ width: 14, height: 14, color: 'var(--text-mute)' }} />}
            files={fileSet?.configs ?? []}
            selected={artifacts.configs}
            count={selectedFw.configs}
            onToggle={(f) => toggleArtifact('configs', f)}
          />
          <ArtifactGroup
            label="Plugins"
            icon={<Ic.layers style={{ width: 14, height: 14, color: 'var(--text-mute)' }} />}
            files={fileSet?.plugins ?? []}
            selected={artifacts.plugins}
            count={selectedFw.plugins}
            onToggle={(f) => toggleArtifact('plugins', f)}
          />
          <ArtifactGroup
            label="Utilities"
            icon={<Ic.grid style={{ width: 14, height: 14, color: 'var(--text-mute)' }} />}
            files={fileSet?.util ?? []}
            selected={artifacts.util}
            count={selectedFw.util}
            onToggle={(f) => toggleArtifact('util', f)}
          />

          {selectedFw.data === 0 && selectedFw.configs === 0 && selectedFw.plugins === 0 && selectedFw.util === 0 && (
            <p className="muted" style={{ fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              This framework has no additional artifact files.
            </p>
          )}
        </Panel>
      )}

      {/* ── Step 3: Name ── */}
      {step === 3 && selectedFw && (
        <>
          <Panel title="Test details">
            <Field label="Test name">
              <Input
                autoFocus
                placeholder="e.g. Checkout 500 VU baseline"
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canNext[3]) handleCreate(); }}
              />
            </Field>
          </Panel>

          <Panel title="Summary" style={{ marginTop: 14 }}>
            <dl className="kv" style={{ fontSize: 13 }}>
              <dt>Framework</dt>
              <dd className="mono">{selectedFw.name}{selectedFw.version ? ` · ${selectedFw.version}` : ''}</dd>
              <dt>Entry point</dt>
              <dd className="mono">{entryPoint}</dd>
              <dt>Data files</dt>
              <dd className="num">{artifacts.dataFiles.length} selected</dd>
              <dt>Configs</dt>
              <dd className="num">{artifacts.configs.length} selected</dd>
              <dt>Plugins</dt>
              <dd className="num">{artifacts.plugins.length} selected</dd>
              <dt>Utilities</dt>
              <dd className="num">{artifacts.util.length} selected</dd>
            </dl>
          </Panel>
          {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{error}</p>}
        </>
      )}

      {/* ── Footer navigation ── */}
      <div className="flex gap8" style={{ marginTop: 24, justifyContent: 'space-between' }}>
        <Btn kind="ghost" onClick={step === 0 ? () => navigate(`/projects/${projectId}`) : back}>
          {step === 0 ? 'Cancel' : '← Back'}
        </Btn>
        {step < STEPS.length - 1 ? (
          <Btn kind="primary" icon="arrowR" disabled={!canNext[step]} onClick={next}>
            Continue
          </Btn>
        ) : (
          <Btn kind="primary" icon="check" disabled={!canNext[step]} onClick={handleCreate}>
            {saving ? 'Creating…' : 'Create test'}
          </Btn>
        )}
      </div>
    </div>
  );
}
