import React from 'react';
import { BoxIcon, LayersIcon, ServerIcon } from './Icons';

const NAV_ITEMS = [
  { key: 'containers', label: 'Containers', icon: BoxIcon },
  { key: 'images', label: 'Images', icon: LayersIcon },
];

export default function Sidebar({ activePage, onNavigate, systemInfo, containerCounts }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-logo" aria-hidden>
          🐳
        </span>
        <div className="brand-text">
          <div className="brand-title">Docker Web Console</div>
          <div className="brand-subtitle">Container manager</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`nav-item ${activePage === key ? 'nav-item-active' : ''}`}
            onClick={() => onNavigate(key)}
          >
            <Icon className="nav-icon" />
            <span>{label}</span>
            {key === 'containers' && containerCounts ? (
              <span className="nav-count">{containerCounts.total}</span>
            ) : null}
          </button>
        ))}
      </nav>

      {containerCounts ? (
        <div className="sidebar-summary">
          <div className="summary-row">
            <span className="dot dot-green" /> Running <strong>{containerCounts.running}</strong>
          </div>
          <div className="summary-row">
            <span className="dot dot-yellow" /> Paused <strong>{containerCounts.paused}</strong>
          </div>
          <div className="summary-row">
            <span className="dot dot-gray" /> Stopped <strong>{containerCounts.stopped}</strong>
          </div>
        </div>
      ) : null}

      <div className="sidebar-footer">
        <ServerIcon className="sidebar-footer-icon" />
        <div className="sidebar-footer-text">
          {systemInfo ? (
            <>
              <div className={`engine-status ${systemInfo.mode === 'real' ? 'engine-live' : 'engine-mock'}`}>
                {systemInfo.mode === 'real' ? 'Engine connected' : 'Demo / mock engine'}
              </div>
              <div className="engine-version">Docker {systemInfo.version?.Version || 'n/a'}</div>
            </>
          ) : (
            <div className="engine-status">Connecting…</div>
          )}
        </div>
      </div>
    </aside>
  );
}
