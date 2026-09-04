import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import Header from '../components/Header';
import ConfirmDialog from '../components/ConfirmDialog';
import PullImageModal from '../components/PullImageModal';
import { LayersIcon, PlayIcon, TrashIcon } from '../components/Icons';
import { formatBytes, formatDateTime, shortId } from '../utils/format';
import { useToast } from '../context/ToastContext';

const POLL_MS = 6000;

export default function ImagesPage({ onRunFromImage }) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [pullOpen, setPullOpen] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const toast = useToast();

  const load = useCallback(async (showSpinner) => {
    if (showSpinner) setRefreshing(true);
    try {
      const data = await api.listImages();
      setImages(data);
    } catch (err) {
      toast.error(`Failed to load images: ${err.message}`);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return images;
    return images.filter((img) => (img.RepoTags || []).some((t) => t.toLowerCase().includes(q)));
  }, [images, search]);

  const handlePull = async (repoTag) => {
    setPulling(true);
    try {
      await api.pullImage(repoTag);
      toast.success(`Pulled "${repoTag}"`);
      setPullOpen(false);
      await load(false);
    } finally {
      setPulling(false);
    }
  };

  const handleRemove = async () => {
    const img = confirmRemove;
    setConfirmRemove(null);
    if (!img) return;
    try {
      await api.removeImage(img.Id);
      toast.success(`Removed "${(img.RepoTags && img.RepoTags[0]) || shortId(img.Id)}"`);
      await load(false);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <Header
        title="Images"
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => load(true)}
        refreshing={refreshing}
        actionLabel="Pull image"
        onAction={() => setPullOpen(true)}
      />

      <div className="page-content">
        {loading ? (
          <div className="empty-state">Loading images…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <LayersIcon className="empty-icon" />
            <p>No images found</p>
            <button className="btn btn-primary" onClick={() => setPullOpen(true)}>
              Pull an image
            </button>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Repository : Tag</th>
                <th>Image ID</th>
                <th>Created</th>
                <th>Size</th>
                <th>In use</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((img) => {
                const tag = (img.RepoTags && img.RepoTags[0]) || '<none>';
                return (
                  <tr key={img.Id} className="data-row">
                    <td className="mono">{tag}</td>
                    <td className="mono small">{shortId(img.Id.replace('sha256:', ''))}</td>
                    <td className="small">{formatDateTime(img.Created)}</td>
                    <td className="small">{formatBytes(img.Size)}</td>
                    <td className="small">
                      {img.Containers > 0 ? (
                        <span className="pill pill-blue">{img.Containers} container{img.Containers > 1 ? 's' : ''}</span>
                      ) : (
                        <span className="muted">unused</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-btn"
                          title="Run container from this image"
                          onClick={() => onRunFromImage && onRunFromImage(tag)}
                        >
                          <PlayIcon />
                        </button>
                        <button className="icon-btn icon-btn-danger" title="Remove image" onClick={() => setConfirmRemove(img)}>
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <PullImageModal open={pullOpen} onClose={() => setPullOpen(false)} onSubmit={handlePull} submitting={pulling} />

      <ConfirmDialog
        open={!!confirmRemove}
        title="Remove image"
        message={
          confirmRemove
            ? `Remove "${(confirmRemove.RepoTags && confirmRemove.RepoTags[0]) || shortId(confirmRemove.Id)}"? This cannot be undone.`
            : ''
        }
        confirmLabel="Remove"
        danger
        onConfirm={handleRemove}
        onCancel={() => setConfirmRemove(null)}
      />
    </>
  );
}
