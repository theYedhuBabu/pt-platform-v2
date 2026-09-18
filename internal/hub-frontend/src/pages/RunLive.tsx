import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHead, Panel, Stat, Btn, Status, Switch, Gauge, Modal } from '../components/design/Shell';
import { Icons as Ic } from '../components/design/Icons';
import { Spark } from '../components/design/Charts';
import { stopRun, getRun, type RunWithTest } from '../services/runs';
import { useAgentSocket } from '../hooks/useAgentSocket';

const AGENT_COLORS = ['var(--accent)', 'var(--blue)', 'var(--purple)', 'var(--amber)'];
const HISTORY_LEN = 40;

const GRAFANA_BASE = import.meta.env.VITE_GRAFANA_BASE_URL ?? '';
const GRAFANA_UID  = import.meta.env.VITE_GRAFANA_RUN_DASHBOARD_UID ?? '';
const GRAFANA_PANEL_THROUGHPUT = import.meta.env.VITE_GRAFANA_PANEL_THROUGHPUT ?? '';
const GRAFANA_PANEL_VUS        = import.meta.env.VITE_GRAFANA_PANEL_THREADS ?? '';
const GRAFANA_PANEL_ERRORS     = import.meta.env.VITE_GRAFANA_PANEL_ERRORS ?? '';
// The dashboard queries interpolate ${granularity} (bucket size in seconds)
// straight into SQL, so it must always be set. Time window for the live view.
const GRAFANA_GRANULARITY = import.meta.env.VITE_GRAFANA_GRANULARITY ?? '10';
const GRAFANA_TIME_FROM   = import.meta.env.VITE_GRAFANA_TIME_FROM ?? 'now-15m';

// TimeWindow is the Grafana from/to pair. For a live run it stays relative
// (now-15m → now); for an ended run it's the run's own epoch-ms bounds so the
// snapshot shows that run's data instead of the last 15 minutes.
interface TimeWindow { from: string; to: string; }
const LIVE_WINDOW: TimeWindow = { from: GRAFANA_TIME_FROM, to: 'now' };

function GrafanaPanel({ panelId, runId, win, height = 230 }: { panelId: string; runId: string; win: TimeWindow; height?: number }) {
  if (!GRAFANA_BASE || !GRAFANA_UID || !panelId) {
    // Build-time env was empty for one of these — surface which so the browser
    // console explains the "Grafana not configured" placeholder.
    console.debug('[GrafanaPanel] not configured', { base: GRAFANA_BASE, uid: GRAFANA_UID, panelId });
    return (
      <div style={{ height, display: 'grid', placeItems: 'center', color: 'var(--text-mute)', fontSize: 13 }}>
        Grafana not configured
      </div>
    );
  }
  // The dashboard keys on var-test_name (which holds the run ID) and requires
  // var-granularity; these panels don't filter by transaction.
  const src = `${GRAFANA_BASE}/d-solo/${GRAFANA_UID}`
    + `?orgId=1&panelId=${panelId}`
    + `&var-test_name=${encodeURIComponent(runId)}`
    + `&var-granularity=${GRAFANA_GRANULARITY}`
    + `&from=${win.from}&to=${win.to}&refresh=5s&theme=dark&kiosk`;
  return <iframe src={src} width="100%" height={height} frameBorder="0" style={{ borderRadius: 8 }} />;
}

// fullDashboardUrl builds the "Open in Grafana" link to the full dashboard for
// a run, scoped by the same variables and time window the embedded panels use.
function fullDashboardUrl(runId: string, win: TimeWindow): string {
  return `${GRAFANA_BASE}/d/${GRAFANA_UID}`
    + `?var-test_name=${encodeURIComponent(runId)}`
    + `&var-granularity=${GRAFANA_GRANULARITY}`
    + `&from=${win.from}&to=${win.to}`;
}

export default function RunLive() {
  const { projectId, testId, runId } = useParams<{ projectId: string; testId: string; runId: string }>();
  const navigate = useNavigate();

  const wsBase = import.meta.env.DEV
    ? 'ws://localhost:8080'
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
  const wsUrl = `${wsBase}/ws?agentId=web-ui-${runId}`;

  const { connectionStatus, logs, metrics, runStatus } = useAgentSocket(wsUrl, runId);

  // Run state from the hub — covers initial load and page refreshes,
  // where WS status messages alone can't tell us the run already ended.
  const [run, setRun] = useState<RunWithTest | null>(null);
  useEffect(() => {
    if (!runId) return;
    getRun(runId).then(setRun).catch(() => setRun(null));
  }, [runId]);

  // Grafana time window: relative for a live run, the run's own bounds for an
  // ended run so its snapshot shows that run's data (±10s padding so the first
  // and last samples aren't clipped).
  const grafanaWindow = useMemo<TimeWindow>(() => {
    if (run && run.status !== 'running' && run.startedAt) {
      const from = new Date(run.startedAt).getTime() - 10_000;
      const to = run.completedAt ? new Date(run.completedAt).getTime() + 10_000 : Date.now();
      return { from: String(from), to: String(to) };
    }
    return LIVE_WINDOW;
  }, [run]);

  // Per-agent history ring buffers (rps for sparkline, vus for latest value)
  const historyRef = useRef<Record<string, { rps: number[]; vus: number[] }>>({});
  const [tick, setTick] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const [follow, setFollow] = useState(true);
  const [confirmStop, setConfirmStop] = useState(false);
  const [stopping, setStopping] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);

  const dbEnded = run !== null && run.status !== 'running';
  const isRunning = !dbEnded && runStatus !== 'completed' && runStatus !== 'failed' && runStatus !== 'stopped' && connectionStatus === 'connected';

  // Derive framework type from latest metric (for VU label)
  const frameworkType = useMemo(() => {
    for (let i = metrics.length - 1; i >= 0; i--) {
      if (metrics[i].data.framework_type) return metrics[i].data.framework_type;
    }
    return 'jmeter';
  }, [metrics]);
  const vuLabel = frameworkType === 'jmeter' ? 'threads' : 'VUs';

  // Update per-agent history from WebSocket metrics
  useEffect(() => {
    if (metrics.length === 0) return;
    const latest = metrics[metrics.length - 1];
    const id = latest.data.agent_id;
    if (!historyRef.current[id]) {
      historyRef.current[id] = { rps: [], vus: [] };
    }
    const h = historyRef.current[id];
    // rate is requests/sec (JMeter's own throughput); data.requests is the raw
    // count for the interval and is summed separately for the run total.
    h.rps = [...h.rps.slice(-(HISTORY_LEN - 1)), latest.data.rate];
    h.vus = [...h.vus.slice(-(HISTORY_LEN - 1)), latest.data.vus];
    setTick(x => x + 1);
  }, [metrics]);

  // Elapsed clock
  useEffect(() => {
    if (!isRunning) return;
    const iv = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
    return () => clearInterval(iv);
  }, [isRunning]);

  // Auto-scroll terminal
  useEffect(() => {
    if (follow && termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [logs, follow]);

  const agentIds = Object.keys(historyRef.current);

  const curRps = useMemo(() => {
    return agentIds.reduce((a, id) => {
      const arr = historyRef.current[id]?.rps;
      return a + (arr?.[arr.length - 1] ?? 0);
    }, 0);
  }, [tick]);

  const curVus = useMemo(() => {
    return agentIds.reduce((a, id) => {
      const arr = historyRef.current[id]?.vus;
      return a + (arr?.[arr.length - 1] ?? 0);
    }, 0);
  }, [tick]);

  // Errors/sec for the latest interval, derived from JMeter's throughput:
  // errors/sec = (errors / requests) * rate. Keeps the same /sec basis as RPS.
  const curErrRate = useMemo(() => {
    if (metrics.length === 0) return 0;
    const d = metrics[metrics.length - 1].data;
    return d.requests > 0 ? (d.errors / d.requests) * d.rate : 0;
  }, [metrics]);

  // Error rate % for the latest interval, from raw counts.
  const errPct = useMemo(() => {
    if (metrics.length === 0) return '0.00';
    const latest = metrics[metrics.length - 1];
    return latest.data.requests > 0
      ? ((latest.data.errors / latest.data.requests) * 100).toFixed(2)
      : '0.00';
  }, [metrics]);
  const totalReq = useMemo(() => metrics.filter(m => m.data.run_id === runId).reduce((a, m) => a + m.data.requests, 0), [metrics, runId]);

  const hh = String(Math.floor(elapsed / 3600)).padStart(2, '0');
  const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  const handleStop = async () => {
    if (!runId) return;
    setStopping(true);
    try {
      await stopRun(runId);
      setConfirmStop(false);
      navigate(-1);
    } catch (e) {
      console.error(e);
    } finally {
      setStopping(false);
    }
  };

  return (
    <div className="page wide">
      <PageHead
        eyebrow={
          <>
            <span className="crumb" style={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${projectId}/tests/${testId}`)}>
              Test
            </span>
            {' · Run'}
          </>
        }
        title={
          <span className="flex gap12">
            <span style={{ fontSize: 20 }}>{run?.testName ?? runId}</span>
            {isRunning ? <Status s="running" /> : <Status s={run?.status === 'failed' ? 'failed' : 'passed'} label={run && !isRunning ? run.status.toUpperCase() : undefined} />}
          </span>
        }
        desc={
          <span className="flex gap8 muted mono" style={{ fontSize: 12.5 }}>
            <span>run {runId}</span>
            <span>· WebSocket: {connectionStatus}</span>
            {/* runStatus defaults to "running" for any recovered run, so only
                trust it while the run is actually live; the title badge shows
                the settled status for ended runs. */}
            {isRunning && runStatus && <span>· {runStatus}</span>}
          </span>
        }
        actions={
          isRunning ? (
            <>
              {GRAFANA_BASE && GRAFANA_UID && (
                <Btn kind="ghost" onClick={() => window.open(fullDashboardUrl(runId!, grafanaWindow), '_blank')}>
                  Full dashboard
                </Btn>
              )}
              <Btn kind="ghost" icon="download" disabled title="Loki — coming soon">Logs</Btn>
              <Btn kind="danger" icon="stop" onClick={() => setConfirmStop(true)}>Stop run</Btn>
            </>
          ) : (
            <>
              {GRAFANA_BASE && GRAFANA_UID && (
                <Btn kind="ghost" onClick={() => window.open(fullDashboardUrl(runId!, grafanaWindow), '_blank')}>
                  Full dashboard
                </Btn>
              )}
              <Btn kind="ghost" icon="download">Download results</Btn>
              <Btn kind="primary" icon="refresh" onClick={() => navigate(`/projects/${projectId}/tests/${testId}/run`)}>Re-run</Btn>
            </>
          )
        }
      />

      {/* Stats row: live WS metrics while running, persisted run aggregates
          once the run has ended (the live stream doesn't replay). */}
      {dbEnded && run ? (
        <div className="grid mb24" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
          <Stat k="Duration" icon="clock" v={run.duration || '—'} />
          <Stat k="Avg req / sec" icon="bolt" v={run.rps.toLocaleString(undefined, { maximumFractionDigits: 1 })} delta="run average" deltaDir="flat" />
          <Stat k="Samples" icon="server" v={run.samples.toLocaleString()} delta="total requests" deltaDir="flat" />
          <Stat k="Error rate" icon="alert" v={`${run.errPct.toFixed(2)}%`} deltaDir={run.errPct > 1 ? 'down' : 'flat'} delta={run.errPct > 1 ? 'above 1%' : 'within 1%'} />
          <Stat k="P95 latency" icon="activity" v={`${Math.round(run.p95)} ms`} />
          <Stat k="P99 latency" icon="activity" v={`${Math.round(run.p99)} ms`} />
        </div>
      ) : (
        <div className="grid mb24" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          <div className="stat" style={{ borderColor: isRunning ? 'var(--blue)' : 'var(--border-soft)' }}>
            <div className="k"><Ic.clock style={{ width: 14, height: 14 }} />Elapsed</div>
            <div className="v num">{hh}:{mm}:{ss}</div>
          </div>
          <Stat k="Requests / sec" icon="bolt" v={curRps.toLocaleString(undefined, { maximumFractionDigits: 1 })} delta={`${totalReq.toLocaleString()} total`} deltaDir="flat" />
          <Stat k={`Active ${vuLabel}`} icon="cpu" v={curVus.toLocaleString()} deltaDir="flat" delta="across agents" />
          <Stat k="Errors / sec" icon="alert" v={curErrRate.toLocaleString(undefined, { maximumFractionDigits: 1 })} deltaDir={parseFloat(errPct) > 1 ? 'down' : 'flat'} delta={`${errPct}% rate`} />
          <Stat k="Agents" icon="server" v={agentIds.length || '—'} delta={connectionStatus} deltaDir={connectionStatus === 'connected' ? 'up' : 'down'} />
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1fr 340px', gap: 18, alignItems: 'start' }}>
        {/* Left: Grafana panels + terminal */}
        <div className="grid" style={{ gap: 18 }}>
          <Panel title="Throughput" sub="requests/sec — Grafana">
            <GrafanaPanel panelId={GRAFANA_PANEL_THROUGHPUT} runId={runId!} win={grafanaWindow} height={230} />
          </Panel>

          <div className="grid cols-2">
            <Panel title={`Active ${vuLabel}`} sub="Grafana">
              <GrafanaPanel panelId={GRAFANA_PANEL_VUS} runId={runId!} win={grafanaWindow} height={170} />
            </Panel>
            <Panel title="Errors / sec" sub="Grafana">
              <GrafanaPanel panelId={GRAFANA_PANEL_ERRORS} runId={runId!} win={grafanaWindow} height={170} />
            </Panel>
          </div>

          {/* Terminal */}
          <Panel
            title="Live log stream"
            pad={false}
            right={
              <>
                <span className={`badge ${isRunning ? 'live' : 'neutral'}`} style={{ fontSize: 10 }}>
                  {isRunning && <span className="dot" />}
                  {isRunning ? 'streaming' : 'ended'}
                </span>
                <label className="flex gap8" style={{ fontSize: 12, cursor: 'pointer', marginLeft: 8 }}>
                  <Switch on={follow} onClick={() => setFollow(!follow)} />
                  follow
                </label>
              </>
            }
          >
            <div className="term" style={{ height: 320, borderRadius: 0, border: 'none' }}>
              <div className="term-head">
                <div className="term-dots">
                  <i style={{ background: 'var(--red)' }} />
                  <i style={{ background: 'var(--amber)' }} />
                  <i style={{ background: 'var(--accent)' }} />
                </div>
                <span className="muted mono" style={{ fontSize: 11.5 }}>run {runId}</span>
              </div>
              <div className="term-body" ref={termRef} onWheel={() => setFollow(false)}>
                {logs.length === 0 ? (
                  <div style={{ color: 'var(--text-mute)' }}>
                    {isRunning ? 'Waiting for log output…' : 'No logs captured.'}
                  </div>
                ) : (
                  logs.map((entry, i) => (
                    <div key={i} className="term-line INFO">
                      <span className="ag">[{entry.agentId}]</span>
                      <span className="msg">{entry.text}</span>
                    </div>
                  ))
                )}
                {isRunning && <div className="term-line"><span className="cursor-blink" /></div>}
              </div>
            </div>
          </Panel>
        </div>

        {/* Right rail */}
        <div className="grid" style={{ gap: 18 }}>
          {/* Agent fleet */}
          <Panel title="Agent fleet" sub={`${agentIds.length} reporting`}>
            {agentIds.length === 0 ? (
              <div style={{ color: 'var(--text-mute)', fontSize: 13 }}>No agents reporting yet…</div>
            ) : (
              <div className="grid" style={{ gap: 12 }}>
                {agentIds.map((id, i) => {
                  const h = historyRef.current[id];
                  const rps = h?.rps[h.rps.length - 1] ?? 0;
                  const vus = h?.vus[h.vus.length - 1] ?? 0;
                  return (
                    <div key={id} style={{ padding: 13, border: '1px solid var(--border-soft)', borderRadius: 9, background: 'var(--bg-2)' }}>
                      <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="flex gap8" style={{ fontWeight: 600 }}>
                          <i style={{ width: 8, height: 8, borderRadius: '50%', background: AGENT_COLORS[i % 4], display: 'inline-block' }} />
                          <span className="mono" style={{ fontSize: 13 }}>{id}</span>
                        </span>
                        {isRunning ? <Status s="running" /> : <Status s="passed" label="DONE" />}
                      </div>
                      <div className="flex" style={{ justifyContent: 'space-between', fontSize: 12.5, marginBottom: 8 }}>
                        <span className="num"><span className="muted">rps </span><strong>{rps.toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong></span>
                        <span className="num"><span className="muted">{vuLabel} </span><strong>{vus.toLocaleString()}</strong></span>
                      </div>
                      <Spark data={h?.rps ?? []} color={AGENT_COLORS[i % 4]} width={260} height={28} />
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* Process control */}
          <Panel title="Process control">
            <div className="grid" style={{ gap: 10 }}>
              <div className="flex" style={{ justifyContent: 'space-between', fontSize: 13 }}>
                <span className="muted">Thread state</span>
                <span className={`badge ${isRunning ? 'running' : 'neutral'}`}>
                  {isRunning && <span className="dot" />}
                  {isRunning ? 'running' : 'stopped'}
                </span>
              </div>
              <Gauge value={curVus} max={Math.max(1, curVus + 100)} />
              <div className="muted mono" style={{ fontSize: 11.5 }}>{curVus.toLocaleString()} active {vuLabel}</div>
              <div className="divider" style={{ margin: '6px 0' }} />
              <Btn icon="stop" disabled={!isRunning}>Shutdown (graceful)</Btn>
              <Btn kind="danger" icon="bolt" disabled={!isRunning} onClick={() => setConfirmStop(true)}>Stop test now</Btn>
              <div className="hint">
                Stop now sends <span className="mono">StopTestNow</span> on port 4445 to every agent and collects partial results.
              </div>
            </div>
          </Panel>

          {/* Result collection */}
          <Panel title="Result collection">
            <div className="grid" style={{ gap: 10 }}>
              {([
                ['Samples captured', totalReq.toLocaleString()],
                ['Result archives', isRunning ? 'pending' : `${agentIds.length} / ${agentIds.length}`],
                ['Merged report', isRunning ? '—' : 'ready'],
              ] as [string, string][]).map(([k, v]) => (
                <div className="flex" key={k} style={{ justifyContent: 'space-between', fontSize: 13 }}>
                  <span className="muted">{k}</span>
                  <span className="num strong">{v}</span>
                </div>
              ))}
              <Btn kind="ghost" icon="download" disabled={isRunning} style={{ marginTop: 4 }}>
                Download merged JTL
              </Btn>
            </div>
          </Panel>
        </div>
      </div>

      {confirmStop && (
        <Modal
          title="Stop run?"
          onClose={() => setConfirmStop(false)}
          foot={
            <>
              <Btn kind="ghost" onClick={() => setConfirmStop(false)}>Keep running</Btn>
              <Btn kind="danger" icon="stop" disabled={stopping} onClick={handleStop}>
                {stopping ? 'Stopping…' : 'Stop & collect'}
              </Btn>
            </>
          }
        >
          <p style={{ margin: 0, color: 'var(--text-dim)' }}>
            This sends <span className="mono">StopTestNow</span> to all agents.
            Partial results will be collected and merged. The run will be marked complete.
          </p>
        </Modal>
      )}
    </div>
  );
}
