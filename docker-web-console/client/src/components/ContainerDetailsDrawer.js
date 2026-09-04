import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { containerName, formatBytes, formatDateTime, formatPorts, shortId } from '../utils/format';
import StatusBadge from './StatusBadge';
import { XIcon } from './Icons';

const TABS = ['Overview', 'Logs', 'Stats'];
const POLL_MS = 2500;

export default function ContainerDetailsDrawer({ container, onClose }) {
  const [tab, setTab] = useState('Overview');
  const [logs, setLogs] = useState('');
  const [logsError, setLogsError] = useState('');
  const [stats, setStats] = useState(null);
  const [statsHistory, setStatsHistory] = useState([]);
  const logsRef = useRef(null);

  const id = container?.Id;
  const running = container?.State === 'running';

  useEffect(() => {
    setTab('Overview');
    setLogs('');
    setStats(null);
    setStatsHistory([]);
  }, [id]);

  useEffect(() => {
    if (!id || tab !== 'Logs') return undefined;
    let cancelled = false;

    const fetchLogs = async () => {
      try {
        const res = await api.getLogs(id, 400);
        if (!cancelled) {
          setLogs(res.logs || '(no logs yet)');
          setLogsError('');
        }
      } catch (err) {
        if (!cancelled) setLogsError(err.message);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, tab]);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    if (!id || tab !== 'Stats') return undefined;
    let cancelled = false;

    const fetchStats = async () => {
      try {
        const res = await api.getStats(id);
        if (!cancelled) {
          setStats(res);
          setStatsHistory((prev) => [...prev.slice(-29), res]);
        }
      } catch {
        // container may have been removed/stopped mid-poll; ignore
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, tab]);

  if (!container) return null;

  return (
    <div className="drawer-overlay" onMouseDown={onClose}>
      <div className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <div className="drawer-title">{containerName(container.Names)}</div>
            <div className="drawer-subtitle">
              {container.Image} · <StatusBadge state={container.State} />
            </div>
          </div>
          <button className="btn btn-icon" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        <div className="drawer-tabs">
          {TABS.map((t) => (
            <button key={t} className={`drawer-tab ${tab === t ? 'drawer-tab-active' : ''}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        <div className="drawer-body">
          {tab === 'Overview' && (
            <dl className="detail-list">
              <div className="detail-row">
                <dt>Container ID</dt>
                <dd>{shortId(container.Id)}</dd>
              </div>
              <div className="detail-row">
                <dt>Image</dt>
                <dd>{container.Image}</dd>
              </div>
              <div className="detail-row">
                <dt>Command</dt>
                <dd className="mono">{container.Command}</dd>
              </div>
              <div className="detail-row">
                <dt>Status</dt>
                <dd>{container.Status}</dd>
              </div>
              <div className="detail-row">
                <dt>Created</dt>
                <dd>{formatDateTime(container.Created)}</dd>
              </div>
              <div className="detail-row">
                <dt>Ports</dt>
                <dd>{formatPorts(container.Ports)}</dd>
              </div>
              <div className="detail-row">
                <dt>Network mode</dt>
                <dd>{container.HostConfig?.NetworkMode || '—'}</dd>
              </div>
            </dl>
          )}

          {tab === 'Logs' && (
            <div className="logs-panel">
              {logsError ? (
                <div className="form-error">{logsError}</div>
              ) : (
                <pre className="logs-output" ref={logsRef}>
                  {logs}
                </pre>
              )}
            </div>
          )}

          {tab === 'Stats' && (
            <div className="stats-panel">
              {!running ? (
                <p className="muted">Statistics are only available for running containers.</p>
              ) : stats ? (
                <>
                  <StatGauge label="CPU usage" value={stats.cpuPercent} suffix="%" />
                  <StatGauge
                    label="Memory usage"
                    value={stats.memPercent}
                    suffix="%"
                    detail={`${formatBytes(stats.memUsage)} / ${formatBytes(stats.memLimit)}`}
                  />
                  <div className="net-stats">
                    <div>
                      <span className="muted">Network In</span>
                      <div>{formatBytes(stats.netRx)}</div>
                    </div>
                    <div>
                      <span className="muted">Network Out</span>
                      <div>{formatBytes(stats.netTx)}</div>
                    </div>
                  </div>
                  <Sparkline data={statsHistory.map((s) => s.cpuPercent)} />
                </>
              ) : (
                <p className="muted">Loading stats…</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatGauge({ label, value, suffix, detail }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  const color = pct > 80 ? 'var(--color-red)' : pct > 50 ? 'var(--color-yellow)' : 'var(--color-green)';
  return (
    <div className="stat-gauge">
      <div className="stat-gauge-label">
        <span>{label}</span>
        <span>
          {pct.toFixed(1)}
          {suffix}
        </span>
      </div>
      <div className="stat-gauge-track">
        <div className="stat-gauge-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      {detail ? <div className="stat-gauge-detail">{detail}</div> : null}
    </div>
  );
}

function Sparkline({ data }) {
  if (!data.length) return null;
  const max = Math.max(...data, 10);
  const points = data
    .map((v, i) => `${(i / Math.max(data.length - 1, 1)) * 100},${100 - (v / max) * 100}`)
    .join(' ');
  return (
    <div className="sparkline">
      <div className="muted sparkline-label">CPU history</div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="sparkline-svg">
        <polyline points={points} fill="none" stroke="var(--color-blue)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
