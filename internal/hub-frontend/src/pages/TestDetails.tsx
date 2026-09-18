import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHead, Panel, Stat, Btn, Status, Empty, Tabs } from '../components/design/Shell';
import { Icons as Ic } from '../components/design/Icons';
import { getTest, type Test } from '../services/tests';
import type { Run } from '../services/runs';
import { getFrameworks, type Framework } from '../services/framework';

// runDuration prefers the persisted Duration string and falls back to the
// started→completed delta (mirrors History.tsx).
function runDuration(run: Run): string {
  if (run.duration) return run.duration;
  if (!run.startedAt || !run.completedAt) return '—';
  const ms = new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();
  if (isNaN(ms) || ms < 0) return '—';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

export default function TestDetails() {
  const { projectId, testId } = useParams<{ projectId: string; testId: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<Test | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [framework, setFramework] = useState<Framework | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('details');

  useEffect(() => {
    if (!projectId || !testId) return;
    (async () => {
      setLoading(true);
      try {
        const [{ test: t, runs: r }, fws] = await Promise.all([
          getTest(projectId, testId),
          getFrameworks().catch(() => [] as Framework[]),
        ]);
        setTest(t);
        setRuns(r || []);
        if (t?.frameworkId) setFramework(fws.find((f) => f.id === t.frameworkId) || null);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, testId]);

  if (loading) return <div className="page"><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-mute)' }}>Loading…</div></div>;
  if (!test) return (
    <div className="page">
      <Empty icon="alert" title="Test not found" action={<Btn kind="primary" onClick={() => navigate(`/projects/${projectId}`)}>Back to project</Btn>} />
    </div>
  );

  const tabs = [
    { id: 'details', label: 'Details', icon: 'file' },
    { id: 'runs', label: 'Runs', icon: 'history' },
  ];

  return (
    <div className="page wide">
      <PageHead
        eyebrow={
          <>
            <span className="crumb" style={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${projectId}`)}>
              Project
            </span>
            {' · '}
            <Ic.beaker style={{ width: 13, height: 13 }} />
            {' Test'}
          </>
        }
        title={test.name}
        desc={
          <span className="flex gap8">
            {test.scriptName && <span className="tag mono">{test.scriptName}</span>}
            {framework && <span className="ver">{framework.name}{framework.version ? ` ${framework.version}` : ''}</span>}
            {test.lastStatus && <Status s={test.lastStatus} />}
          </span>
        }
        actions={
          <>
            <Btn kind="ghost" icon="edit" onClick={() => navigate(`/projects/${projectId}`)}>Edit</Btn>
            <Btn kind="primary" icon="play" onClick={() => navigate(`/projects/${projectId}/tests/${testId}/run`)}>
              Run test
            </Btn>
          </>
        }
      />

      <div className="grid cols-4 mb24">
        <Stat k="Last status" icon="activity" v={test.lastStatus || 'Never run'} />
        <Stat k="Last run" icon="clock" v={test.lastRunAt ? new Date(test.lastRunAt).toLocaleDateString() : '—'} />
        <Stat k="Framework" icon="layers" v={framework ? framework.name : '—'} />
        <Stat k="Script" icon="file" v={test.scriptName || '—'} />
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'details' && (
        <Panel title="Test configuration">
          <dl className="kv">
            <dt>Test name</dt><dd>{test.name}</dd>
            <dt>Script</dt><dd className="mono">{test.scriptName || '—'}</dd>
            <dt>Framework</dt>
            <dd>
              {framework
                ? <span style={{ cursor: 'pointer', color: 'var(--blue)' }} onClick={() => navigate(`/frameworks/${framework.id}`)}>{framework.name}</span>
                : '—'}
            </dd>
            <dt>Last status</dt>
            <dd>{test.lastStatus ? <Status s={test.lastStatus} /> : <span className="badge neutral">NONE</span>}</dd>
            <dt>Last run at</dt>
            <dd className="mono">{test.lastRunAt ? new Date(test.lastRunAt).toLocaleString() : '—'}</dd>
            <dt>Created</dt>
            <dd className="mono">{test.createdAt ? new Date(test.createdAt).toLocaleString() : '—'}</dd>
          </dl>
          <div style={{ marginTop: 20 }}>
            <Btn kind="primary" icon="play" onClick={() => navigate(`/projects/${projectId}/tests/${testId}/run`)}>
              Run test
            </Btn>
          </div>
        </Panel>
      )}

      {tab === 'runs' && (
        runs.length === 0 ? (
          <Panel>
            <Empty
              icon="history"
              title="No runs yet"
              desc="This test hasn't been run. Start a run to see it here."
              action={<Btn kind="primary" icon="play" onClick={() => navigate(`/projects/${projectId}/tests/${testId}/run`)}>Start a new run</Btn>}
            />
          </Panel>
        ) : (
          <Panel pad={false} title="Runs">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} onClick={() => navigate(`/projects/${projectId}/tests/${testId}/runs/${run.id}`)}>
                    <td><Status s={run.status} /></td>
                    <td className="mono" style={{ fontSize: 12 }}>{run.startedAt ? new Date(run.startedAt).toLocaleString() : '—'}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{runDuration(run)}</td>
                    <td><span className="muted" style={{ fontSize: 11 }}>View</span></td>
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
