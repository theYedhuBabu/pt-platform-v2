import { useState, useEffect, useMemo } from 'react';
import { PageHead, Panel, Stat, Btn, Status } from '../components/design/Shell';
import { getAgents } from '../services/agents';
import { useAgentSocket, type MetricData } from '../hooks/useAgentSocket';

const WS_BASE = import.meta.env.DEV
  ? 'ws://localhost:8080/ws'
  : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
// The hub requires an agentId on every WS connection; the web-ui prefix keeps
// this client out of the agent fleet. Random suffix so two tabs don't collide.
const WS_URL = `${WS_BASE}?agentId=web-ui-agents-${Math.random().toString(36).slice(2, 8)}`;

export default function Agents() {
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { connectionStatus, metrics } = useAgentSocket(WS_URL);

  // Latest metric per agent_id — later entries in the array overwrite earlier ones
  const agentMetrics = useMemo(() => {
    const map: Record<string, MetricData> = {};
    metrics.forEach(m => { map[m.data.agent_id] = m.data; });
    return map;
  }, [metrics]);

  const fetchFleet = async () => {
    setLoading(true);
    try {
      const data = await getAgents();
      setAgentIds(data || []);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFleet(); }, []);

  const activeIds = agentIds.filter(id => agentMetrics[id]);
  const idleIds   = agentIds.filter(id => !agentMetrics[id]);

  return (
    <div className="page">
      <PageHead
        eyebrow="Execution"
        title="Agents"
        desc="Load-generator agents connected to the hub over WebSocket. The hub dispatches framework bundles and merges their results."
        actions={
          <Btn icon="refresh" kind="ghost" onClick={fetchFleet} disabled={loading}>
            {loading ? 'Scanning…' : 'Rescan fleet'}
          </Btn>
        }
      />

      <div className="grid cols-4 mb24">
        <Stat k="Registered" icon="server" v={agentIds.length} />
        <Stat k="Active" icon="activity" v={activeIds.length}
          delta={activeIds.length ? 'sending metrics' : 'none running'}
          deltaDir={activeIds.length ? 'up' : 'flat'} />
        <Stat k="Idle" icon="clock" v={idleIds.length} />
        <Stat k="Hub Socket" icon="link" v={connectionStatus}
          delta={WS_URL}
          deltaDir={connectionStatus === 'connected' ? 'up' : 'down'} />
      </div>

      <Panel pad={false}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Status</th>
              <th className="num">Threads</th>
              <th className="num">Requests</th>
              <th className="num">Errors</th>
            </tr>
          </thead>
          <tbody>
            {loading && agentIds.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-mute)' }}>
                  Scanning for agents…
                </td>
              </tr>
            ) : agentIds.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-mute)' }}>
                  No agents registered. Start an agent to see it here.
                </td>
              </tr>
            ) : (
              agentIds.map(id => {
                const m = agentMetrics[id];
                const status = m ? 'running' : 'connected';
                return (
                  <tr key={id}>
                    <td className="mono strong">{id}</td>
                    <td><Status s={status} /></td>
                    <td className="num">{m ? m.vus.toLocaleString() : '—'}</td>
                    <td className="num">{m ? m.requests.toLocaleString() : '—'}</td>
                    <td className="num" style={{ color: m && m.errors > 0 ? 'var(--red)' : undefined }}>
                      {m ? m.errors.toLocaleString() : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
