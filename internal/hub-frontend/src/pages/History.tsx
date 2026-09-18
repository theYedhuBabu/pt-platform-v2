import { useState, useEffect } from 'react';
import { PageHead, Panel, Stat, Btn, Status, Tabs, Modal, Empty } from '../components/design/Shell';
import { getHistory, type TestRun } from '../services/runs';

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'passed', label: 'Passed' },
  { id: 'failed', label: 'Failed' },
  { id: 'running', label: 'Running' },
];

function duration(start: string, end: string): string {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (isNaN(ms) || ms < 0) return '—';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

export default function History() {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState<TestRun | null>(null);

  const load = async () => {
    setLoading(true);
    try { setRuns(await getHistory()); } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = tab === 'all' ? runs : runs.filter(r => r.Status.toLowerCase() === tab);

  const counts = {
    passed: runs.filter(r => r.Status.toLowerCase() === 'passed').length,
    failed: runs.filter(r => r.Status.toLowerCase() === 'failed').length,
    running: runs.filter(r => r.Status.toLowerCase() === 'running').length,
  };

  const tabsWithCount = STATUS_TABS.map(t => ({
    ...t,
    count: t.id === 'all' ? runs.length : counts[t.id as keyof typeof counts],
  }));

  return (
    <div className="page">
      <PageHead
        eyebrow="Execution"
        title="History"
        desc="All past and in-progress test runs. Click a row to view the log path and run details."
        actions={<Btn kind="ghost" icon="refresh" onClick={load} disabled={loading}>Refresh</Btn>}
      />

      <div className="grid cols-4 mb24">
        <Stat k="Total runs" icon="history" v={runs.length} />
        <Stat k="Passed" icon="check" v={counts.passed}
          delta={runs.length ? `${Math.round(counts.passed / runs.length * 100)}%` : '—'}
          deltaDir="up" />
        <Stat k="Failed" icon="alert" v={counts.failed}
          delta={runs.length ? `${Math.round(counts.failed / runs.length * 100)}%` : '—'}
          deltaDir={counts.failed > 0 ? 'down' : 'flat'} />
        <Stat k="Running" icon="activity" v={counts.running}
          deltaDir={counts.running > 0 ? 'up' : 'flat'} />
      </div>

      <Panel pad={false} title="Run history"
        right={<Btn kind="ghost" icon="refresh" sm onClick={load} disabled={loading}>Refresh</Btn>}
      >
        <div style={{ padding: '0 0 0 0', borderBottom: '1px solid var(--border)' }}>
          <Tabs tabs={tabsWithCount} active={tab} onChange={setTab} />
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-mute)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <Empty icon="history" title="No runs"
            desc={tab === 'all' ? 'No runs recorded yet.' : `No ${tab} runs.`}
          />
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Script</th>
                <th>Status</th>
                <th>Started</th>
                <th>Ended</th>
                <th>Duration</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(run => (
                <tr key={run.ID} onClick={() => setSelected(run)}>
                  <td className="mono strong" style={{ fontSize: 12 }}>{run.ID}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{run.ScriptName}</td>
                  <td><Status s={run.Status.toLowerCase()} /></td>
                  <td className="mono" style={{ fontSize: 12 }}>{run.StartTime ? new Date(run.StartTime).toLocaleString() : '—'}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{run.EndTime ? new Date(run.EndTime).toLocaleString() : '—'}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{duration(run.StartTime, run.EndTime)}</td>
                  <td><span className="muted" style={{ fontSize: 11 }}>View</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {selected && (
        <Modal title="Run details" onClose={() => setSelected(null)}
          foot={<Btn kind="ghost" onClick={() => setSelected(null)}>Close</Btn>}
        >
          <table className="tbl">
            <tbody>
              <tr><td className="muted">Run ID</td><td className="mono strong">{selected.ID}</td></tr>
              <tr><td className="muted">Script</td><td className="mono">{selected.ScriptName}</td></tr>
              <tr><td className="muted">Status</td><td><Status s={selected.Status.toLowerCase()} /></td></tr>
              <tr><td className="muted">Started</td><td className="mono">{selected.StartTime || '—'}</td></tr>
              <tr><td className="muted">Ended</td><td className="mono">{selected.EndTime || '—'}</td></tr>
              <tr><td className="muted">Duration</td><td className="mono">{duration(selected.StartTime, selected.EndTime)}</td></tr>
              <tr><td className="muted">Log path</td><td className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{selected.LogPath || '—'}</td></tr>
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}
