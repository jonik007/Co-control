import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import ConfirmDialog from '../components/ConfirmDialog';
import ContainerDetailsDrawer from '../components/ContainerDetailsDrawer';
import CreateContainerModal from '../components/CreateContainerModal';
import { BoxIcon, PauseIcon, PlayIcon, RestartIcon, StopIcon, TerminalIcon, TrashIcon } from '../components/Icons';
import { containerName, formatDateTime, formatPorts, shortId } from '../utils/format';
import { useToast } from '../context/ToastContext';

const POLL_MS = 4000;

export default function ContainersPage({ onCountsChange, runImageRequest }) {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (runImageRequest) {
      setCreateOpen(true);
    }
  }, [runImageRequest]);

  const load = useCallback(async (showSpinner) => {
    if (showSpinner) setRefreshing(true);
    try {
      const data = await api.listContainers();
      setContainers(data);
    } catch (err) {
      toast.error(`Failed to load containers: ${err.message}`);
    } finally {
      setLoading(false);
      if (showSpinner) setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    load(false);
    const interval = setInterval(() => load(false), POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (!onCountsChange) return;
    onCountsChange({
      total: containers.length,
      running: containers.filter((c) => c.State === 'running').length,
      paused: containers.filter((c) => c.State === 'paused').length,
      stopped: containers.filter((c) => c.State === 'exited' || c.State === 'created').length,
    });
  }, [containers, onCountsChange]);

  useEffect(() => {
    if (!selected) return;
    const fresh = containers.find((c) => c.Id === selected.Id);
    if (fresh) setSelected(fresh);
  }, [containers, selected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return containers;
    return containers.filter(
      (c) => containerName(c.Names).toLowerCase().includes(q) || c.Image.toLowerCase().includes(q)
    );
  }, [containers, search]);

  const runAction = async (id, action, fn, successMsg) => {
    setPendingAction(`${id}:${action}`);
    try {
      await fn(id);
      toast.success(successMsg);
      await load(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPendingAction(null);
    }
  };

  const handleRemove = async (force) => {
    const c = confirmRemove;
    setConfirmRemove(null);
    if (!c) return;
    try {
      await api.removeContainer(c.Id, force);
      toast.success(`Removed "${containerName(c.Names)}"`);
      if (selected?.Id === c.Id) setSelected(null);
      await load(false);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCreate = async (payload) => {
    setCreating(true);
    try {
      await api.createContainer(payload);
      toast.success(`Container "${payload.name || payload.image}" created`);
      setCreateOpen(false);
      await load(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Header
        title="Containers"
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => load(true)}
        refreshing={refreshing}
        actionLabel="Run container"
        onAction={() => setCreateOpen(true)}
      />

      <div className="page-content">
        {loading ? (
          <div className="empty-state">Loading containers…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <BoxIcon className="empty-icon" />
            <p>No containers found</p>
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              Run your first container
            </button>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Image</th>
                <th>Status</th>
                <th>Ports</th>
                <th>Created</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const name = containerName(c.Names);
                const busyPrefix = `${c.Id}:`;
                const isBusy = pendingAction && pendingAction.startsWith(busyPrefix);
                return (
                  <tr key={c.Id} className="data-row">
                    <td>
                      <button className="link-button" onClick={() => setSelected(c)}>
                        {name}
                      </button>
                      <div className="muted small">{shortId(c.Id)}</div>
                    </td>
                    <td className="mono small">{c.Image}</td>
                    <td>
                      <StatusBadge state={c.State} />
                      <div className="muted small">{c.Status}</div>
                    </td>
                    <td className="small">{formatPorts(c.Ports)}</td>
                    <td className="small">{formatDateTime(c.Created)}</td>
                    <td>
                      <div className="row-actions">
                        {c.State === 'running' && (
                          <>
                            <ActionButton
                              icon={PauseIcon}
                              title="Pause"
                              disabled={isBusy}
                              onClick={() => runAction(c.Id, 'pause', api.pauseContainer, `Paused "${name}"`)}
                            />
                            <ActionButton
                              icon={StopIcon}
                              title="Stop"
                              disabled={isBusy}
                              onClick={() => runAction(c.Id, 'stop', api.stopContainer, `Stopped "${name}"`)}
                            />
                            <ActionButton
                              icon={RestartIcon}
                              title="Restart"
                              disabled={isBusy}
                              onClick={() => runAction(c.Id, 'restart', api.restartContainer, `Restarted "${name}"`)}
                            />
                          </>
                        )}
                        {c.State === 'paused' && (
                          <ActionButton
                            icon={PlayIcon}
                            title="Unpause"
                            disabled={isBusy}
                            onClick={() => runAction(c.Id, 'unpause', api.unpauseContainer, `Unpaused "${name}"`)}
                          />
                        )}
                        {(c.State === 'exited' || c.State === 'created') && (
                          <ActionButton
                            icon={PlayIcon}
                            title="Start"
                            disabled={isBusy}
                            onClick={() => runAction(c.Id, 'start', api.startContainer, `Started "${name}"`)}
                          />
                        )}
                        <ActionButton icon={TerminalIcon} title="Logs" onClick={() => setSelected(c)} />
                        <ActionButton
                          icon={TrashIcon}
                          title="Remove"
                          danger
                          disabled={isBusy}
                          onClick={() => setConfirmRemove(c)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ContainerDetailsDrawer container={selected} onClose={() => setSelected(null)} />

      <ConfirmDialog
        open={!!confirmRemove}
        title="Remove container"
        message={
          confirmRemove
            ? `Are you sure you want to remove "${containerName(confirmRemove.Names)}"? ${
                confirmRemove.State === 'running' ? 'It is currently running and will be force-removed.' : ''
              }`
            : ''
        }
        confirmLabel="Remove"
        danger
        onConfirm={() => handleRemove(confirmRemove?.State === 'running')}
        onCancel={() => setConfirmRemove(null)}
      />

      <CreateContainerModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        submitting={creating}
        initialImage={runImageRequest?.image}
      />
    </>
  );
}

function ActionButton({ icon: Icon, title, onClick, disabled, danger }) {
  return (
    <button
      className={`icon-btn ${danger ? 'icon-btn-danger' : ''}`}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon />
    </button>
  );
}
