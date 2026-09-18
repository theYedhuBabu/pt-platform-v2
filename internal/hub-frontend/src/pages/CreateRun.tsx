import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHead, Panel, Btn, Status, Seg, Empty, cx } from '../components/design/Shell';
import { Icons as Ic } from '../components/design/Icons';
import { getProject } from '../services/projects';
import { getAgents } from '../services/agents';
import { startRun } from '../services/runs';
import type { Test } from '../services/tests';

const PHASES = [
  'Registering run in SQLite',
  'Dispatching start command over WebSocket',
  'Agents downloading framework assets',
  'Starting test executor (non-GUI)',
  'Streaming live metrics',
];

export default function CreateRun() {
  const { projectId, testId } = useParams<{ projectId: string; testId: string }>();
  const navigate = useNavigate();

  const [test, setTest] = useState<Test | null>(null);
  const [agents, setAgents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'single' | 'distributed'>('distributed');
  const [selected, setSelected] = useState<string[]>([]);
  const [splitFiles, setSplitFiles] = useState<string[]>([]);
  const [launching, setLaunching] = useState(false);
  const [launchStep, setLaunchStep] = useState(0);

  useEffect(() => {
    if (!projectId || !testId) return;
    (async () => {
      setLoading(true);
      try {
        const [{ tests }, agentIds] = await Promise.all([
          getProject(projectId),
          getAgents().catch(() => [] as string[]),
        ]);
        const t = tests.find((x) => x.id === testId) ?? null;
        setTest(t);
        setAgents(agentIds);
        setSelected(agentIds.slice(0, 2));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, testId]);

  const toggleAgent = (id: string) => {
    if (mode === 'single') { setSelected([id]); return; }
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  };

  const toggleSplitFile = (f: string) => {
    setSplitFiles((s) => s.includes(f) ? s.filter((x) => x !== f) : [...s, f]);
  };

  const changeMode = (m: string) => {
    const next = m as 'single' | 'distributed';
    setMode(next);
    setSelected(next === 'single' ? agents.slice(0, 1) : agents.slice(0, 2));
    if (next === 'single') setSplitFiles([]);
  };

  const launch = async () => {
    if (!projectId || !testId || !selected.length) return;
    setLaunching(true);
    setLaunchStep(0);

    let step = 0;
    const iv = setInterval(() => {
      step += 1;
      setLaunchStep(step);
      if (step >= PHASES.length) {
        clearInterval(iv);
        startRun(projectId, testId, selected, splitFiles, mode)
          .then(({ runId }) => {
            navigate(`/projects/${projectId}/tests/${testId}/runs/${runId}`);
          })
          .catch((e) => {
            console.error(e);
            navigate('/active');
          });
      }
    }, 700);
  };

  if (loading) {
    return (
      <div className="page">
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-mute)' }}>Loading…</div>
      </div>
    );
  }
  if (!test) {
    return (
      <div className="page">
        <Empty icon="alert" title="Test not found" action={<Btn kind="primary" onClick={() => navigate(`/projects/${projectId}`)}>Back</Btn>} />
      </div>
    );
  }

  const dataFiles = test.artifacts?.dataFiles ?? [];
  const showSplitPanel = mode === 'distributed' && dataFiles.length > 0;
  const agentCount = selected.length;

  /* ── Launch animation ── */
  if (launching) {
    return (
      <div className="page" style={{ maxWidth: 620 }}>
        <PageHead eyebrow="Run Test" title="Launching run…" desc={test.name} />
        <Panel>
          <div className="grid" style={{ gap: 4 }}>
            {PHASES.map((p, i) => (
              <div className="flex gap12" key={i} style={{ padding: '12px 4px', opacity: i <= launchStep ? 1 : 0.4, transition: 'opacity .3s' }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
                  background: i < launchStep ? 'var(--accent)' : i === launchStep ? 'var(--blue-soft)' : 'var(--panel-2)',
                  border: '1px solid ' + (i < launchStep ? 'var(--accent)' : i === launchStep ? 'var(--blue)' : 'var(--border)'),
                }}>
                  {i < launchStep
                    ? <Ic.check style={{ width: 13, height: 13, color: 'var(--accent-fg)' }} />
                    : i === launchStep
                      ? <Ic.refresh className="spin" style={{ width: 13, height: 13, color: 'var(--blue)' }} />
                      : <span className="mono muted" style={{ fontSize: 11 }}>{i + 1}</span>}
                </div>
                <span style={{ fontWeight: i === launchStep ? 600 : 500, fontSize: 14 }}>{p}</span>
                {i < launchStep && <span className="badge passed" style={{ marginLeft: 'auto', fontSize: 10 }}>done</span>}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    );
  }

  /* ── Configure ── */
  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <PageHead
        eyebrow={
          <>
            <span className="crumb" style={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${projectId}/tests/${testId}`)}>
              {test.name}
            </span>
            {' · Run Test'}
          </>
        }
        title="Configure run"
        desc="Choose execution mode, agents, and how data files are distributed."
        actions={
          <>
            <Btn kind="ghost" onClick={() => navigate(`/projects/${projectId}/tests/${testId}`)}>Cancel</Btn>
            <Btn kind="primary" icon="play" disabled={!selected.length} onClick={launch}>
              Execute run · {selected.length} agent{selected.length !== 1 ? 's' : ''}
            </Btn>
          </>
        }
      />

      <div className="grid" style={{ gridTemplateColumns: '1fr 300px', gap: 18, alignItems: 'start' }}>
        <div className="grid" style={{ gap: 18 }}>

          {/* Mode */}
          <Panel title="Execution mode">
            <Seg
              value={mode}
              onChange={changeMode}
              options={[
                { value: 'single', label: 'Single agent', icon: 'server' },
                { value: 'distributed', label: 'Distributed', icon: 'layers' },
              ]}
            />
            <div className="hint" style={{ marginTop: 10 }}>
              {mode === 'single'
                ? 'One agent runs the full load.'
                : `Load is distributed across all selected agents.`}
            </div>
          </Panel>

          {/* Agents */}
          <Panel
            title="Agents"
            sub={`${selected.length} selected`}
            right={<span className="muted mono" style={{ fontSize: 12 }}>{agents.length} available</span>}
          >
            {agents.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-mute)', fontSize: 13 }}>
                No agents connected. Start an agent with{' '}
                <span className="mono">./agent -hub=ws://localhost:8080/ws -id=agent-1</span>
              </div>
            ) : (
              <div className="grid" style={{ gap: 8 }}>
                {agents.map((id) => {
                  const on = selected.includes(id);
                  return (
                    <div key={id} className={cx('checkrow', on && 'sel')} onClick={() => toggleAgent(id)}>
                      <div className="cbox">{on && <Ic.check />}</div>
                      <Ic.server style={{ width: 18, height: 18, color: 'var(--text-dim)' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }} className="mono">{id}</div>
                      </div>
                      <Status s="connected" />
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* Data splitting — only for distributed + test has data files */}
          {showSplitPanel && (
            <Panel
              title="Data splitting"
              sub="Select which data files to partition across agents. Each agent reads its own slice."
            >
              <div className="grid" style={{ gap: 8 }}>
                {dataFiles.map((f) => {
                  const on = splitFiles.includes(f);
                  return (
                    <div key={f} className={cx('checkrow', on && 'sel')} onClick={() => toggleSplitFile(f)}>
                      <div className="cbox">{on && <Ic.check />}</div>
                      <Ic.file style={{ width: 16, height: 16, color: 'var(--text-dim)' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="mono" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f}
                        </div>
                      </div>
                      {on && agentCount > 1 && (
                        <span className="tag" style={{ fontSize: 11, flexShrink: 0 }}>
                          ÷ {agentCount} agents
                        </span>
                      )}
                      {!on && (
                        <span className="muted" style={{ fontSize: 11, flexShrink: 0 }}>shared</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {splitFiles.length === 0 && (
                <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
                  No files split — all data files will be shared identically across agents.
                </p>
              )}
            </Panel>
          )}
        </div>

        {/* Summary */}
        <Panel title="Run summary">
          <dl className="kv" style={{ gridTemplateColumns: '90px 1fr', fontSize: 13 }}>
            <dt>Test</dt><dd>{test.name}</dd>
            <dt>Script</dt><dd className="mono" style={{ fontSize: 12 }}>{test.scriptName || '—'}</dd>
            <dt>Mode</dt><dd><span className="badge neutral">{mode}</span></dd>
            <dt>Agents</dt><dd className="num">{selected.length}</dd>
            {showSplitPanel && (
              <>
                <dt>Split files</dt><dd className="num">{splitFiles.length}</dd>
                <dt>Shared files</dt><dd className="num">{dataFiles.length - splitFiles.length}</dd>
              </>
            )}
          </dl>
        </Panel>
      </div>
    </div>
  );
}
