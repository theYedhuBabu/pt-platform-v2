import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead, Panel, Stat, Btn, Modal, Field, Input, Empty } from '../components/design/Shell';
import { Icons as Ic } from '../components/design/Icons';
import { getProjects, createProject, type Project } from '../services/projects';
import { getActiveRun } from '../services/runs';
import { getFrameworks } from '../services/framework';

export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [totalFrameworks, setTotalFrameworks] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newEnv, setNewEnv] = useState('staging');
  const [newDesc, setNewDesc] = useState('');
  const [newClient, setNewClient] = useState('')
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [ps, fws, ar] = await Promise.all([
        getProjects(),
        getFrameworks().catch(() => []),
        getActiveRun().catch(() => ({ active: false, runId: null })),
      ]);
      setProjects(ps);
      setTotalFrameworks(fws.length);
      setActiveCount(ar.active ? 1 : 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await createProject(newName.trim(), newClient.trim(), newEnv.trim(), newKey.trim(), newDesc.trim() || undefined);
      setShowCreate(false);
      setNewName(''); setNewKey(''); setNewEnv('staging'); setNewDesc('');
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const totalTests = projects.reduce((a, p) => a + p.testCount, 0);

  return (
    <div className="page">
      <PageHead
        eyebrow="Workspace"
        title="Projects"
        desc="Each project owns its frameworks and tests. Tests are built from a framework script and produce runs."
        actions={
          <>
            <Btn icon="refresh" kind="ghost" onClick={load} disabled={loading}>Sync</Btn>
            <Btn icon="plus" kind="primary" onClick={() => setShowCreate(true)}>New project</Btn>
          </>
        }
      />

      <div className="grid cols-4 mb24">
        <Stat k="Projects" icon="folder" v={projects.length} />
        <Stat k="Frameworks" icon="layers" v={totalFrameworks} />
        <Stat k="Tests" icon="beaker" v={totalTests} />
        <Stat
          k="Active runs"
          icon="activity"
          v={activeCount}
          delta={activeCount ? 'streaming now' : 'idle'}
          deltaDir={activeCount ? 'up' : 'flat'}
        />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-mute)' }}>Loading…</div>
      ) : projects.length === 0 ? (
        <Panel>
          <Empty
            icon="folder"
            title="No projects yet"
            desc="Create your first project to start organising load tests."
            action={<Btn kind="primary" icon="plus" onClick={() => setShowCreate(true)}>New project</Btn>}
          />
        </Panel>
      ) : (
        <div className="grid" style={{ gap: 12 }}>
          {projects.map((p) => (
            <div className="lrow" key={p.id} onClick={() => navigate(`/projects/${p.id}`)}>
              <div className="ico"><Ic.folder /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex gap12">
                  <span className="title">{p.name}</span>
                  <span className="badge neutral">{p.env || 'empty'}</span>
                  <span className="badge neutral">{p.key || 'empty'}</span>
                  {p.status !== 'DELETED' && (
                    <span className={`badge ${p.status === 'ACTIVE' ? 'passed' : 'neutral'}`}>
                      {p.status}
                    </span>
                  )}

                </div>
                <div className="meta">
                  <span>{p.description || 'No description'}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 70 }}>
                <div className="muted" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>Tests</div>
                <div className="num" style={{ fontSize: 18, fontWeight: 600 }}>{p.testCount}</div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 130 }}>
                <div className="muted" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Created</div>
                <span className="mono" style={{ fontSize: 12 }}>
                  {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}
                </span>
              </div>
              <Ic.chevR style={{ width: 18, height: 18, color: 'var(--text-mute)' }} />
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal
          title="New project"
          onClose={() => { setShowCreate(false); setNewName(''); setNewKey(''); setNewEnv('staging'); setNewDesc(''); }}
          foot={
            <>
              <Btn kind="ghost" onClick={() => setShowCreate(false)}>Cancel</Btn>
              <Btn
                kind="primary"
                icon="check"
                disabled={saving || !newName.trim()}
                onClick={handleCreate}
              >
                {saving ? 'Creating…' : 'Create project'}
              </Btn>
            </>
          }
        >
          <Field label="Project name">
            <Input
              placeholder="e.g. Checkout API"
              value={newName}
              autoFocus
              onChange={(e) => {
                setNewName(e.target.value);
                if (!newKey) setNewKey(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5));
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </Field>
          <Field label="Client" hint="Client name associated with the project">
              <Input
                mono
                placeholder="Enter Client"
                value={newClient}
                onChange={(e) => setNewClient(e.target.value.toUpperCase())}
              />
            </Field>
          <div className="row2">
            <Field label="Key" hint="Short prefix used in run IDs">
              <Input
                mono
                placeholder="CHK"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Environment">
              <select className="select" value={newEnv} onChange={(e) => setNewEnv(e.target.value)}>
                <option value="staging">staging</option>
                <option value="perf">perf</option>
                <option value="pre-prod">pre-prod</option>
                <option value="dev">dev</option>
                <option value="end-to-end">end to end</option>
                
              </select>
            </Field>
          </div>
          <div className='row3'>
              
          </div>
          <Field label="Description">
            <textarea
              className="input"
              placeholder="What does this project test?"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </Field>
        </Modal>
      )}
    </div>
  );
}
