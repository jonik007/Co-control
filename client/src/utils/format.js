export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatDateTime(seconds) {
  if (!seconds) return '—';
  const date = typeof seconds === 'number' ? new Date(seconds * 1000) : new Date(seconds);
  return date.toLocaleString();
}

export function shortId(id) {
  return id ? id.slice(0, 12) : '';
}

export function containerName(names) {
  if (!names || !names.length) return '(unnamed)';
  return names[0].replace(/^\//, '');
}

export function formatPorts(ports) {
  if (!ports || !ports.length) return '—';
  return ports
    .filter((p) => p.PublicPort)
    .map((p) => `${p.PublicPort}→${p.PrivatePort}/${p.Type}`)
    .join(', ') || '—';
}
