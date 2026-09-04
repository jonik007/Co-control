import React from 'react';
import { PlusIcon, RefreshIcon, SearchIcon } from './Icons';

export default function Header({ title, search, onSearchChange, onRefresh, refreshing, actionLabel, onAction }) {
  return (
    <header className="content-header">
      <h1 className="content-title">{title}</h1>
      <div className="content-header-actions">
        <div className="search-box">
          <SearchIcon className="search-icon" />
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <button className={`btn btn-icon ${refreshing ? 'spinning' : ''}`} title="Refresh" onClick={onRefresh}>
          <RefreshIcon />
        </button>
        {actionLabel ? (
          <button className="btn btn-primary" onClick={onAction}>
            <PlusIcon />
            {actionLabel}
          </button>
        ) : null}
      </div>
    </header>
  );
}
