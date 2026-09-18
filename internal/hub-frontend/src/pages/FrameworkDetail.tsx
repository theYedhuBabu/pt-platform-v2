import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  PageHead, Panel, Btn, Empty, Tabs, FileChip,
} from '../components/design/Shell';
import { Icons as Ic } from '../components/design/Icons';
import { getFramework, fetchFrameworkTypes, type FrameworkDetails, type FrameworkVersion } from '../services/framework';
import { getProject } from '../services/projects';
import type { Test } from '../services/tests';

export default function FrameworkDetail() {
  const { fwId } = useParams<{ fwId: string }>();
  const navigate = useNavigate();
  const [framework, setFramework] = useState<FrameworkDetails | null>(null);
  const [projectName, setProjectName] = useState('');
  const [usedByTests, setUsedByTests] = useState<Array<{ test: Test; projectName: string; projectId: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('contents');
  const [tool, setTool] = useState('');

  useEffect(() => {
    if (!fwId) return;
    (async () => {
      setLoading(true);
      try {
        const fw = await getFramework(fwId);
        setFramework(fw);

        if (fw.toolType) {
          const types = await fetchFrameworkTypes().catch(() => []);
          setTool(types.find((t) => t.name === fw.toolType)?.tool || fw.toolType);
        }

        // Frameworks are project-owned — only fetch tests from the owning project
        const { project, tests } = await getProject(fw.projectId).catch(() => ({
          project: { name: fw.projectId },
          tests: [] as Test[],
        }));
        setProjectName(project.name);
        const used = tests
          .filter((t) => t.frameworkId === fwId)
          .map((t) => ({ test: t, projectName: project.name, projectId: fw.projectId }));
        setUsedByTests(used);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [fwId]);

  if (loading) return <div className="page"><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-mute)' }}>Loading…</div></div>;
  if (!framework) return (
    <div className="page">
      <Empty icon="alert" title="Framework not found" action={<Btn kind="primary" onClick={() => navigate('/frameworks')}>Back to frameworks</Btn>} />
    </div>
  );

  const versions = framework.versions ?? [];
  const currentVersion = versions.find(v => v.current) ?? (framework.version ? { v: framework.version, label: framework.version, current: true } as FrameworkVersion : null);

  const tabs = [
    { id: 'contents', label: 'Contents', icon: 'file' },
    { id: 'versions', label: 'Versions', icon: 'history', count: versions.length || undefined },
    { id: 'used', label: 'Used by', icon: 'beaker', count: usedByTests.length || undefined },
  ];

  return (
    <div className="page wide">
      <PageHead
        eyebrow={
          <>
            <span className="crumb" style={{ cursor: 'pointer' }} onClick={() => navigate('/frameworks')}>Frameworks</span>
            {' · '}
            <Ic.layers style={{ width: 13, height: 13 }} />
            {' Framework'}
          </>
        }
        title={
          <span className="flex gap8" style={{ alignItems: 'center' }}>
            <span className="mono">{framework.name}</span>
            {tool && <span className="badge neutral">{tool}</span>}
          </span>
        }
        desc={framework.description || 'No description'}
        actions={
          <>
            <Btn kind="ghost" icon="upload">New version</Btn>
            <Btn kind="ghost" icon="download">Export</Btn>
          </>
        }
      />

      {/* Source info strip */}
      <div className="panel mb24" style={{ background: 'var(--bg-2)' }}>
        <div className="panel-body" style={{ padding: '14px 18px' }}>
          <div className="flex" style={{ gap: 28, flexWrap: 'wrap' }}>
            <div>
              <div className="muted" style={{ fontSize: 11 }}>PROJECT</div>
              <div className="mono" style={{ fontSize: 13, marginTop: 5 }}>{projectName}</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11 }}>VERSION</div>
              <div style={{ marginTop: 5 }}>
                {currentVersion
                  ? <span className="ver">{currentVersion.v}</span>
                  : <span className="muted mono" style={{ fontSize: 12 }}>unversioned</span>}
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11 }}>ADDED</div>
              <div className="mono" style={{ fontSize: 13, marginTop: 5 }}>
                {framework.createdAt ? new Date(framework.createdAt).toLocaleDateString() : '—'}
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11 }}>USAGE</div>
              <div className="mono" style={{ fontSize: 13, marginTop: 5 }}>{framework.usageCount} test{framework.usageCount !== 1 ? 's' : ''}</div>
            </div>
          </div>
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'contents' && (
        <div className="grid cols-2" style={{ gap: 18 }}>
          <Panel title="Plugin bundle" sub="plugins/">
            {(framework.pluginFiles ?? []).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(framework.pluginFiles ?? []).map((p) => (
                  <FileChip key={p.name} name={p.name} kind="jar" size={p.size} />
                ))}
              </div>
            ) : framework.plugins > 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>{framework.plugins} plugin file{framework.plugins !== 1 ? 's' : ''} (detail not yet loaded)</div>
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>No plugin files attached to this framework.</div>
            )}
          </Panel>
          <Panel title="Metadata">
            <dl className="kv">
              <dt>Name</dt><dd className="mono">{framework.name}</dd>
              <dt>Project</dt><dd className="mono">{projectName}</dd>
              <dt>Version</dt><dd className="mono">{currentVersion?.label || '—'}</dd>
              <dt>Description</dt><dd>{framework.description || '—'}</dd>
              <dt>Usage count</dt><dd className="num">{framework.usageCount}</dd>
              <dt>Created</dt><dd className="mono">{framework.createdAt ? new Date(framework.createdAt).toLocaleString() : '—'}</dd>
            </dl>
          </Panel>
        </div>
      )}

      {tab === 'versions' && (
        <Panel pad={false}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Version</th>
                <th>Branch</th>
                <th>Author</th>
                <th>Date</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {versions.length === 0 ? (
                <tr><td colSpan={6} className="muted" style={{ padding: 20, textAlign: 'center' }}>No versions recorded.</td></tr>
              ) : (
                versions.map((v) => (
                  <tr key={v.v} style={{ cursor: 'default' }}>
                    <td>
                      <span className="ver">{v.v}</span>
                      {v.current && <span className="badge passed" style={{ fontSize: 9, marginLeft: 8 }}>CURRENT</span>}
                    </td>
                    <td className="mono">{v.branch || '—'}</td>
                    <td className="mono">{v.author || '—'}</td>
                    <td className="mono">{v.date || '—'}</td>
                    <td className="muted">{v.note || '—'}</td>
                    <td></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Panel>
      )}

      {tab === 'used' && (
        usedByTests.length === 0 ? (
          <Panel>
            <Empty icon="beaker" title="Not referenced yet" desc="No tests currently use this framework." />
          </Panel>
        ) : (
          <Panel pad={false}>
            <table className="tbl">
              <thead>
                <tr><th>Test</th><th>Project</th><th>Script</th><th>Last status</th><th></th></tr>
              </thead>
              <tbody>
                {usedByTests.map(({ test, projectName, projectId }) => (
                  <tr key={test.id} onClick={() => navigate(`/projects/${projectId}/tests/${test.id}`)}>
                    <td className="strong">{test.name}</td>
                    <td className="muted">{projectName}</td>
                    <td className="mono">{test.scriptName || '—'}</td>
                    <td>{test.lastStatus ? <span className={`badge ${test.lastStatus}`}>{test.lastStatus.toUpperCase()}</span> : <span className="badge neutral">NONE</span>}</td>
                    <td><Ic.chevR style={{ width: 16, height: 16, color: 'var(--text-mute)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )
      )}
    </div>
  );
}
