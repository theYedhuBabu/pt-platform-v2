import { useState, useEffect, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  PageHead, Panel, Btn, Status, Modal, Field, Input, Empty, Tabs, FileChip,
} from '../components/design/Shell';
import { Icons as Ic } from '../components/design/Icons';
import { Donut } from '../components/design/Charts';
import { getProject, deleteProject, type Project } from '../services/projects';
import { deleteTest, type Test } from '../services/tests';
import {
  getProjectFrameworks, createFramework, type Framework,
} from '../services/framework'
/* ---- TestCard ---- */
function TestCard({ test, projectId, onNav, action }: { test: Test; projectId: string; onNav: (path: string) => void; action?: ReactNode }) {
  const liveStatus = test.lastStatus === 'running';
  return (
    <div
      className="lrow"
      style={{ gap: 14 }}
      onClick={() => onNav(`/projects/${projectId}/tests/${test.id}`)}
    >
      <div className="ico">
        {liveStatus
          ? <Ic.activity style={{ color: 'var(--blue)' }} />
          : <Ic.beaker style={{ color: 'var(--accent)' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14.5 }}>{test.name}</div>
        <div className="meta" style={{ marginTop: 4 }}>
          {test.scriptName && <span className="tag">{test.scriptName}</span>}
          {test.frameworkId && <span className="tag mono">fw attached</span>}
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        {liveStatus
          ? <span className="badge running"><span className="dot" />RUNNING</span>
          : test.lastStatus
            ? <Status s={test.lastStatus} />
            : <span className="badge neutral">NO RUNS</span>}
        {test.lastRunAt && !liveStatus && (
          <div className="muted mono" style={{ fontSize: 11, marginTop: 4 }}>
            {new Date(test.lastRunAt).toLocaleString()}
          </div>
        )}
      </div>
      {action}
      <Ic.chevR style={{ width: 18, height: 18, color: 'var(--text-mute)' }} />
    </div>
  );
}

/* ---- FrameworkCard ---- */
function FrameworkCard({ fw, onNav }: { fw: Framework; onNav: (path: string) => void }) {
   
  return (
    <div
      className="panel"
      style={{ cursor: 'pointer', background: 'var(--bg-2)' }}
      onClick={() => onNav(`/frameworks/${fw.id}`)}
    >
      <div className="panel-body" style={{ padding: 16 }}>
        <div className="flex gap8 mb16">
          <Ic.layers style={{ width: 18, height: 18, color: 'var(--blue)' }} />
          <span className="mono" style={{ fontWeight: 600, fontSize: 13.5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fw.name}
          </span>
        </div>
        <div className="dim" style={{ fontSize: 12.5, minHeight: 36 }}>{fw.description || 'No description'}</div>
         <div className="flex gap8" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          {fw.version && (
            <span className="ver">{fw.version}</span>
          )}
        </div>
        <div className="divider" style={{ margin: '12px 0' }} />
        <div className="flex muted" style={{ fontSize: 11.5, gap: 14, fontFamily: 'var(--mono)' }}>
          <span>{fw.usageCount} test{fw.usageCount !== 1 ? 's' : ''}</span>
          
          <span>{fw.createdAt ? new Date(fw.createdAt).toLocaleDateString() : ''}</span>
        </div>
      </div>
    </div>
  );
}

/* ---- ImportFramework wizard ---- */
function ImportFramework({
  projectId,
  onClose,
  onDone,
}: {
  projectId: string;
  onClose: () => void;
  onDone: (fw: Framework) => void;
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [desc, setDesc] = useState('');
  const [pluginFile, setPluginFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const doImport = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('sourceType', 'upload');
      if (desc.trim()) fd.append('description', desc.trim());
      if (version.trim()) fd.append('version', version.trim());
      if (pluginFile) {
        fd.append('file', pluginFile);
        fd.append('plugins', '1');
        fd.append('sharedFiles', JSON.stringify([pluginFile.name]));
      }
      const fw = await createFramework(projectId, fd);
      onDone(fw);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const foot =
    step === 1 ? (
      <>
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" icon="arrowR" disabled={!name.trim()} onClick={() => setStep(2)}>
          Continue
        </Btn>
      </>
    ) : (
      <>
        <Btn kind="ghost" icon="chevL" onClick={() => setStep(1)}>Back</Btn>
        <Btn kind="primary" icon="check" disabled={saving} onClick={doImport}>
          {saving ? 'Importing…' : 'Import framework'}
        </Btn>
      </>
    );

  return (
    <Modal title="Import framework" onClose={onClose} wide foot={foot}>
      {step === 1 && (
        <>
          <Field label="Framework name">
            <Input mono placeholder="e.g. checkout-core-suite" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="row2">
            <Field label="Version">
              <Input mono value={version} onChange={(e) => setVersion(e.target.value)} />
            </Field>
            <Field label="Description">
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What does this bundle include?" />
            </Field>
          </div>
          <Field label="Plugin file" hint="Optional .jar or .zip bundle.">
            <input type="file" accept=".jar,.zip" id="fw-plugin-upload" style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && setPluginFile(e.target.files[0])} />
            {pluginFile
              ? <FileChip name={pluginFile.name} kind="jar" onRemove={() => setPluginFile(null)} />
              : <label htmlFor="fw-plugin-upload" className="btn ghost" style={{ cursor: 'pointer' }}><span>Choose .jar or .zip</span></label>}
          </Field>
        </>
      )}
      {step === 2 && (
        <div className="panel" style={{ background: 'var(--bg-2)' }}>
          <div className="panel-body">
            <div className="flex gap8 mb16">
              <Ic.check style={{ width: 18, height: 18, color: 'var(--accent)' }} />
              <strong>Ready to import</strong>
            </div>
            <dl className="kv" style={{ fontSize: 13 }}>
              <dt>Name</dt><dd className="mono">{name}</dd>
              <dt>Version</dt><dd className="mono">{version}</dd>
              {desc && <><dt>Description</dt><dd>{desc}</dd></>}
              <dt>Plugin</dt><dd className="mono">{pluginFile ? pluginFile.name : 'none'}</dd>
            </dl>
          </div>
        </div>
      )}
    </Modal>
  );
}


/* ---- Main page ---- */
export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [tests, setTests] = useState<Test[]>([]);
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('tests');
  const [showImportFw, setShowImportFw] = useState(false);
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false);
  const [confirmDeleteTest, setConfirmDeleteTest] = useState<Test | null>(null);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [{ project: p, tests: t }, allFws] = await Promise.all([
        getProject(projectId),
        getProjectFrameworks(projectId).catch(() => [] as Framework[]),
      ]);
      setProject(p);
      setTests(t);
      setFrameworks(allFws);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const handleDeleteProject = async () => {
    if (!projectId) return;
    try { await deleteProject(projectId); navigate('/projects'); }
    catch (e) { console.error(e); }
  };

  const handleDeleteTest = async () => {
    if (!confirmDeleteTest || !projectId) return;
    try { await deleteTest(projectId, confirmDeleteTest.id); setConfirmDeleteTest(null); await load(); }
    catch (e) { console.error(e); }
  };

  if (loading) {
    return <div className="page"><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-mute)' }}>Loading…</div></div>;
  }

  if (!project) {
    return (
      <div className="page">
        <Empty icon="alert" title="Project not found" action={<Btn kind="primary" onClick={() => navigate('/projects')}>Back to projects</Btn>} />
      </div>
    );
  }

  const nativeTests = tests; // All API tests are "native" for now
  const passed = tests.filter((t) => t.lastStatus === 'passed').length;
  const failed = tests.filter((t) => t.lastStatus === 'failed').length;
  const noRuns = tests.filter((t) => !t.lastStatus).length;
  const liveCount = tests.filter((t) => t.lastStatus === 'running').length;

  const tabs = [
    { id: 'tests', label: 'Tests', icon: 'beaker', count: tests.length },
    { id: 'frameworks', label: 'Frameworks', icon: 'layers', count: frameworks.length },
    { id: 'overview', label: 'Overview', icon: 'grid' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];

  return (
    <div className="page wide">
      <PageHead
        eyebrow={<><Ic.folder style={{ width: 14, height: 14 }} /> Project</>}
        title={project.name}
        desc={project.description}
        badge={liveCount ? <span className="badge live" style={{ marginLeft: 10 }}><span className="dot" />{liveCount} live</span> : undefined}
        actions={
          <>
            <Btn icon="layers" kind="ghost" onClick={() => setShowImportFw(true)}>Import framework</Btn>
            <Btn icon="plus" kind="primary" onClick={() => navigate(`/projects/${projectId}/tests/new`)}>New test</Btn>
          </>
        }
      />

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {/* ---- TESTS ---- */}
      {tab === 'tests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Native tests category */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10 }}>
              <Ic.play style={{ width: 16, height: 16, color: 'var(--accent)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Native tests</div>
                <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 2 }}>Tests built from JMX scripts and dispatched to the agent fleet</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)' }}>{nativeTests.length} test{nativeTests.length !== 1 ? 's' : ''}</span>
            </div>
            {nativeTests.length === 0 ? (
              <Panel>
                <Empty icon="beaker" title="No tests yet" desc="Create a test from an existing framework."
                  action={<Btn icon="plus" kind="primary" onClick={() => navigate(`/projects/${projectId}/tests/new`)}>New test</Btn>} />
              </Panel>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 8 }}>
                {nativeTests.map((t) => (
                  <TestCard
                    key={t.id}
                    test={t}
                    projectId={projectId!}
                    onNav={navigate}
                    action={
                      <button
                        className="btn ghost sm"
                        style={{ color: 'var(--red)', flexShrink: 0 }}
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteTest(t); }}
                        aria-label="Delete test"
                      >
                        <Ic.trash style={{ width: 14, height: 14 }} />
                      </button>
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {/* External imports category */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10 }}>
              <Ic.download style={{ width: 16, height: 16, color: 'var(--text-mute)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>External imports</div>
                <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 2 }}>JTL and other imported test artifacts for comparison</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)' }}>0 tests</span>
            </div>
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 8 }}>
              JTL import coming soon — upload historical results to compare against native runs
            </div>
          </div>
        </div>
      )}

      {/* ---- FRAMEWORKS ---- */}
      {tab === 'frameworks' && (
        frameworks.length === 0 ? (
          <Panel>
            <Empty icon="layers" title="No frameworks yet"
              desc="Import a framework bundle to start building tests."
              action={<Btn icon="plus" kind="primary" onClick={() => setShowImportFw(true)}>Import framework</Btn>} />
          </Panel>
        ) : (
          <div className="grid cols-3" style={{ gap: 14 }}>
            {frameworks.map((f) => <FrameworkCard key={f.id} fw={f} onNav={navigate} />)}
          </div>
        )
      )}

      {/* ---- OVERVIEW ---- */}
      {tab === 'overview' && (
        <div className="grid cols-2">
          <Panel title="Project info">
            <dl className="kv">
              <dt>Created</dt><dd className="mono">{project.createdAt ? new Date(project.createdAt).toLocaleDateString() : '—'}</dd>
              <dt>Tests</dt><dd className="num">{tests.length}</dd>
              <dt>Passed</dt><dd className="num" style={{ color: 'var(--accent)' }}>{passed}</dd>
              <dt>Failed</dt><dd className="num" style={{ color: 'var(--red)' }}>{failed}</dd>
              <dt>Never run</dt><dd className="num" style={{ color: 'var(--text-mute)' }}>{noRuns}</dd>
            </dl>
          </Panel>
          <Panel title="Pass rate">
            <div className="flex gap16" style={{ alignItems: 'center' }}>
              <Donut segments={[
                { value: passed, color: 'var(--accent)' },
                { value: failed, color: 'var(--red)' },
                { value: noRuns, color: 'var(--border)' },
              ]} size={120} />
              <div className="legend" style={{ flexDirection: 'column', gap: 10 }}>
                <span><i style={{ background: 'var(--accent)' }} />Passed · {passed}</span>
                <span><i style={{ background: 'var(--red)' }} />Failed · {failed}</span>
                <span><i style={{ background: 'var(--border)' }} />No runs · {noRuns}</span>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* ---- SETTINGS ---- */}
      {tab === 'settings' && (
        <Panel title="Project settings" style={{ maxWidth: 720 }}>
          <Field label="Project name"><Input defaultValue={project.name} /></Field>
          <Field label="Description"><textarea className="input" defaultValue={project.description || ''} /></Field>
          <div className="divider" />
          <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--red)' }}>Delete project</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Removes all frameworks, tests and run history. Cannot be undone.</div>
            </div>
            <Btn kind="danger" icon="trash" onClick={() => setConfirmDeleteProject(true)}>Delete</Btn>
          </div>
        </Panel>
      )}

      {/* ---- MODALS ---- */}
      {showImportFw && (
        <ImportFramework
          projectId={projectId!}
          onClose={() => setShowImportFw(false)}
          onDone={() => { setShowImportFw(false); load(); }}
        />
      )}

      {confirmDeleteProject && (
        <Modal title="Delete project" onClose={() => setConfirmDeleteProject(false)}
          foot={
            <>
              <Btn kind="ghost" onClick={() => setConfirmDeleteProject(false)}>Cancel</Btn>
              <Btn kind="danger" onClick={handleDeleteProject}>Delete project</Btn>
            </>
          }
        >
          <p>Delete <strong>{project.name}</strong> and all its tests? This cannot be undone.</p>
        </Modal>
      )}

      {confirmDeleteTest && (
        <Modal title="Delete test" onClose={() => setConfirmDeleteTest(null)}
          foot={
            <>
              <Btn kind="ghost" onClick={() => setConfirmDeleteTest(null)}>Cancel</Btn>
              <Btn kind="danger" onClick={handleDeleteTest}>Delete test</Btn>
            </>
          }
        >
          <p>Delete test <strong>{confirmDeleteTest.name}</strong>? This cannot be undone.</p>
        </Modal>
      )}
    </div>
  );
}
