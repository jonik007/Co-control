const API_BASE = '/api';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  let body = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const message = (body && body.error) || res.statusText || 'Request failed';
    throw new ApiError(message, res.status);
  }
  return body;
}

export const api = {
  health: () => request('/health'),
  systemInfo: () => request('/system/info'),

  listContainers: () => request('/containers'),
  inspectContainer: (id) => request(`/containers/${encodeURIComponent(id)}`),
  getLogs: (id, tail = 300) => request(`/containers/${encodeURIComponent(id)}/logs?tail=${tail}`),
  getStats: (id) => request(`/containers/${encodeURIComponent(id)}/stats`),
  startContainer: (id) => request(`/containers/${encodeURIComponent(id)}/start`, { method: 'POST' }),
  stopContainer: (id) => request(`/containers/${encodeURIComponent(id)}/stop`, { method: 'POST' }),
  restartContainer: (id) => request(`/containers/${encodeURIComponent(id)}/restart`, { method: 'POST' }),
  pauseContainer: (id) => request(`/containers/${encodeURIComponent(id)}/pause`, { method: 'POST' }),
  unpauseContainer: (id) => request(`/containers/${encodeURIComponent(id)}/unpause`, { method: 'POST' }),
  removeContainer: (id, force = false) =>
    request(`/containers/${encodeURIComponent(id)}?force=${force}`, { method: 'DELETE' }),
  createContainer: (payload) => request('/containers', { method: 'POST', body: JSON.stringify(payload) }),

  listImages: () => request('/images'),
  pullImage: (repoTag) => request('/images/pull', { method: 'POST', body: JSON.stringify({ repoTag }) }),
  removeImage: (id) => request(`/images/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export { ApiError };
