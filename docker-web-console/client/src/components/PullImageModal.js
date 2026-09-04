import React, { useState } from 'react';
import { XIcon } from './Icons';

export default function PullImageModal({ open, onClose, onSubmit, submitting }) {
  const [repoTag, setRepoTag] = useState('');
  const [error, setError] = useState('');

  if (!open) return null;

  const handleClose = () => {
    setRepoTag('');
    setError('');
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!repoTag.trim()) {
      setError('Enter an image name, e.g. "redis:7-alpine"');
      return;
    }
    try {
      await onSubmit(repoTag.trim());
      setRepoTag('');
    } catch (err) {
      setError(err.message || 'Failed to pull image');
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={handleClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Pull an image</h3>
          <button className="btn btn-icon" onClick={handleClose} aria-label="Close">
            <XIcon />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <label className="field">
            <span className="field-label">Image name</span>
            <input
              className="field-input"
              value={repoTag}
              onChange={(e) => setRepoTag(e.target.value)}
              placeholder="e.g. mongo:7"
              autoFocus
            />
          </label>
          {error ? <div className="form-error">{error}</div> : null}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={handleClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Pulling…' : 'Pull'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
