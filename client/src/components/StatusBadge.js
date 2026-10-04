import React from 'react';

const CONFIG = {
  running: { label: 'Running', className: 'status-running' },
  paused: { label: 'Paused', className: 'status-paused' },
  exited: { label: 'Exited', className: 'status-exited' },
  created: { label: 'Created', className: 'status-created' },
  restarting: { label: 'Restarting', className: 'status-paused' },
  dead: { label: 'Dead', className: 'status-exited' },
};

export default function StatusBadge({ state }) {
  const cfg = CONFIG[state] || { label: state, className: 'status-created' };
  return (
    <span className={`status-badge ${cfg.className}`}>
      <span className="status-dot" />
      {cfg.label}
    </span>
  );
}
