import React, { useEffect, useState } from 'react';
import { XIcon } from './Icons';

const PRESETS = ['nginx:latest', 'redis:7-alpine', 'postgres:16-alpine', 'node:20-alpine', 'alpine:latest'];

export default function CreateContainerModal({ open, onClose, onSubmit, submitting, initialImage }) {
  const [image, setImage] = useState(initialImage || 'nginx:latest');
  const [name, setName] = useState('');
  const [hostPort, setHostPort] = useState('');
  const [containerPort, setContainerPort] = useState('');
  const [env, setEnv] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setImage(initialImage || 'nginx:latest');
    }
    // Only re-sync the image field at the moment the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const reset = () => {
    setImage('nginx:latest');
    setName('');
    setHostPort('');
    setContainerPort('');
    setEnv('');
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!image.trim()) {
      setError('Image is required');
      return;
    }
    const ports = [];
    if (hostPort && containerPort) {
      ports.push({ host: Number(hostPort), container: Number(containerPort) });
    }
    const envVars = env
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    try {
      await onSubmit({ image: image.trim(), name: name.trim(), ports, env: envVars });
      reset();
    } catch (err) {
      setError(err.message || 'Failed to create container');
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={handleClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Run a new container</h3>
          <button className="btn btn-icon" onClick={handleClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <label className="field">
            <span className="field-label">Image</span>
            <input
              className="field-input"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="e.g. nginx:latest"
              list="image-presets"
              autoFocus
            />
            <datalist id="image-presets">
              {PRESETS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>

          <label className="field">
            <span className="field-label">Container name (optional)</span>
            <input
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. my-nginx"
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span className="field-label">Host port</span>
              <input
                className="field-input"
                value={hostPort}
                onChange={(e) => setHostPort(e.target.value.replace(/\D/g, ''))}
                placeholder="8080"
              />
            </label>
            <label className="field">
              <span className="field-label">Container port</span>
              <input
                className="field-input"
                value={containerPort}
                onChange={(e) => setContainerPort(e.target.value.replace(/\D/g, ''))}
                placeholder="80"
              />
            </label>
          </div>

          <label className="field">
            <span className="field-label">Environment variables (one per line)</span>
            <textarea
              className="field-input field-textarea"
              value={env}
              onChange={(e) => setEnv(e.target.value)}
              placeholder={'KEY=value\nANOTHER_KEY=value'}
              rows={3}
            />
          </label>

          {error ? <div className="form-error">{error}</div> : null}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={handleClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Run container'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
