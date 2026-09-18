import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead, Panel, Stat, Btn, Status } from '../components/design/Shell';
import { Icons as Ic } from '../components/design/Icons';
import { Spark } from '../components/design/Charts';
import { getActiveRun, stopRun } from '../services/runs';
import { useAgentSocket, type MetricData } from '../hooks/useAgentSocket';

const WS_URL = import.meta.env.DEV
  ? 'ws://localhost:8080/ws'
  : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
const HISTORY_LEN = 30;

export default function ActiveRuns() {
  const navigate = useNavigate();
  const [activeRun, setActiveRun] = useState<{ active: boolean; runId: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState(false);

  const { connectionStatus, metrics, runStatus } = useAgentSocket(WS_URL, activeRun?.runId ?? undefined);

  useEffect(() => {
    getActiveRun()
      .then(setActiveRun)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Per-agent rps history for sparklines
  const historyRef = useRef<Record<string, number[]>>({});
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (metrics.length === 0) return;
    const latest = metrics[metrics.length - 1];
    const id = latest.data.agent_id;
    if (!historyRef.current[id]) historyRef.current[id] = Array(HISTORY_LEN).fill(0);
    historyRef.current[id] = [...historyRef.current[id].slice(1), latest.data.requests];
    forceUpdate((x) => x + 1);
  }, [metrics]);

  const agentMetrics = useMemo(() => {
    const map: Record<string, MetricData> = {};
    metrics.forEach((m) => { map[m.data.agent_id] = m.data; });
    return map;
  }, [metrics]);

  const agentIds = Object.keys(agentMetrics);
  const totalRequests = agentIds.reduce((a, id) => a + (agentMetrics[id]?.requests || 0), 0);
  const totalErrors = agentIds.reduce((a, id) => a + (agentMetrics[id]?.errors || 0), 0);
  const totalVus = agentIds.reduce((a, id) => a + (agentMetrics[id]?.vus || 0), 0);

  const runId = activeRun?.runId;
  const isRunning = activeRun?.active || false;

  const handleStop = async () => {
    if (!runId) return;
    setStopping(true);
    try {
      await stopRun(runId);
      setActiveRun({ active: false, runId: null });
    } catch (e) {
      console.error(e);
    } finally {
      setStopping(false);
    }
  };

  return (
    <div className="page wide">
      <PageHead
        eyebrow="Execution"
        title="Active runs"
        desc="Every run currently executing across the fleet. Live metrics stream from the shared Kafka broker."
        badge={isRunning ? <span className="badge live" style={{ marginLeft: 10 }}><span className="dot" />live</span> : undefined}
        actions={
          isRunning && runId ? (
            <Btn kind="danger" icon="stop" onClick={handleStop} disabled={stopping}>
              {stopping ? 'Stopping…' : 'Stop run'}
            </Btn>
          ) : (
            <Btn kind="ghost" icon="history" onClick={() => navigate('/history')}>View history</Btn>
          )
        }
      />

      <div className="grid cols-4 mb24">
        <Stat
          k="Run status"
          icon="activity"
          v={loading ? '…' : isRunning ? 'Running' : 'Idle'}
          delta={runId ?? 'no active run'}
          deltaDir={isRunning ? 'up' : 'flat'}
        />
        <Stat k="Active agents" icon="server" v={agentIds.length} delta={`${totalVus.toLocaleString()} VUs`} deltaDir={agentIds.length ? 'up' : 'flat'} />
        <Stat k="Requests / s" icon="gauge" v={totalRequests.toLocaleString()} delta={`${totalErrors} errors`} deltaDir={totalErrors > 0 ? 'down' : 'flat'} />
        <Stat k="Hub socket" icon="link" v={connectionStatus} delta={runStatus ?? undefined} deltaDir={connectionStatus === 'connected' ? 'up' : 'down'} />
      </div>

      {!isRunning && !loading ? (
        <Panel>
          <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--text-mute)' }}>
            <Ic.activity style={{ width: 40, height: 40, opacity: 0.4, marginBottom: 14 }} />
            <h4 style={{ color: 'var(--text-dim)', margin: '0 0 6px' }}>Nothing running</h4>
            <div style={{ marginBottom: 16 }}>Start a run from any test to see it here.</div>
            <Btn kind="primary" icon="folder" onClick={() => navigate('/projects')}>Go to projects</Btn>
          </div>
        </Panel>
      ) : agentIds.length > 0 ? (
        <div className="grid cols-2">
          {agentIds.map((id) => {
            const m = agentMetrics[id];
            const hist = historyRef.current[id] || Array(HISTORY_LEN).fill(0);
            const errRate = m.requests > 0 ? ((m.errors / m.requests) * 100).toFixed(1) : '0.0';
            return (
              <div
                className="panel"
                key={id}
                style={{ cursor: runId ? 'pointer' : 'default', borderColor: 'var(--blue)' }}
                onClick={() => runId && navigate(`/active?runId=${runId}`)}
              >
                <div className="panel-body">
                  <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
                    <div>
                      <div className="muted mono" style={{ fontSize: 12 }}>Agent</div>
                      <div style={{ fontWeight: 600, fontSize: 15.5, marginTop: 2 }} className="mono">{id}</div>
                    </div>
                    <Status s="running" />
                  </div>
                  <div className="grid cols-3" style={{ gap: 10, marginBottom: 14 }}>
                    <div>
                      <div className="muted" style={{ fontSize: 11 }}>RPS</div>
                      <div className="num" style={{ fontSize: 19, fontWeight: 600 }}>{m.requests.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: 11 }}>VUs</div>
                      <div className="num" style={{ fontSize: 19, fontWeight: 600 }}>{m.vus.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: 11 }}>Err %</div>
                      <div className="num" style={{ fontSize: 19, fontWeight: 600, color: parseFloat(errRate) > 1 ? 'var(--red)' : 'var(--text)' }}>{errRate}</div>
                    </div>
                  </div>
                  <Spark data={hist} color="var(--accent)" width={400} height={32} />
                </div>
              </div>
            );
          })}
        </div>
      ) : isRunning ? (
        <Panel>
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-mute)', fontSize: 13 }}>
            Run is active — waiting for agent metrics…
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
