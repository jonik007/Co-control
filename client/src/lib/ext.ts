/**
 * Colour and badge per file extension. A curated palette covers what people
 * actually look at; everything else gets a deterministic hue so the diagram
 * stays stable between reloads.
 */

const CURATED: Record<string, { color: string; badge: string }> = {
  ts: { color: '#3178c6', badge: 'TS' },
  tsx: { color: '#4a9fe0', badge: 'TSX' },
  js: { color: '#c9a227', badge: 'JS' },
  jsx: { color: '#d4b23c', badge: 'JSX' },
  mjs: { color: '#c9a227', badge: 'JS' },
  cjs: { color: '#c9a227', badge: 'JS' },
  py: { color: '#3572a5', badge: 'PY' },
  pyi: { color: '#4b82b0', badge: 'PYI' },
  rs: { color: '#c56a3a', badge: 'RS' },
  go: { color: '#00add8', badge: 'GO' },
  java: { color: '#b07219', badge: 'JAVA' },
  kt: { color: '#a97bff', badge: 'KT' },
  cs: { color: '#68217a', badge: 'C#' },
  c: { color: '#8899a6', badge: 'C' },
  h: { color: '#6f8391', badge: 'H' },
  cpp: { color: '#f34b7d', badge: 'C++' },
  hpp: { color: '#c2557a', badge: 'HPP' },
  rb: { color: '#cc342d', badge: 'RB' },
  php: { color: '#7377ad', badge: 'PHP' },
  swift: { color: '#f05138', badge: 'SW' },
  sh: { color: '#89e051', badge: 'SH' },
  ps1: { color: '#3d6eb5', badge: 'PS1' },
  sql: { color: '#dd8f2c', badge: 'SQL' },
  json: { color: '#8a8a8a', badge: '{}' },
  yaml: { color: '#8f7fbf', badge: 'YML' },
  yml: { color: '#8f7fbf', badge: 'YML' },
  toml: { color: '#9c7f5f', badge: 'TML' },
  xml: { color: '#7a9c6f', badge: 'XML' },
  md: { color: '#6e93b8', badge: 'MD' },
  txt: { color: '#7f7f7f', badge: 'TXT' },
  css: { color: '#563d7c', badge: 'CSS' },
  scss: { color: '#c6538c', badge: 'SCSS' },
  html: { color: '#e34c26', badge: 'HTM' },
  svg: { color: '#ffb13b', badge: 'SVG' },
  png: { color: '#a06fbf', badge: 'IMG' },
  jpg: { color: '#a06fbf', badge: 'IMG' },
  gif: { color: '#a06fbf', badge: 'IMG' },
  ico: { color: '#a06fbf', badge: 'IMG' },
  lock: { color: '#6b6b6b', badge: 'LCK' },
  bin: { color: '#5f6b7a', badge: 'BIN' },
};

const NO_EXT = { color: '#7d8590', badge: '—' };

function hashHue(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 360;
}

export function extStyle(ext: string): { color: string; badge: string } {
  if (ext === '') return NO_EXT;
  const curated = CURATED[ext];
  if (curated) return curated;
  return {
    color: `hsl(${hashHue(ext)} 45% 52%)`,
    badge: ext.slice(0, 3).toUpperCase(),
  };
}

/** Statuses are also encoded by marker shape, so colour is never the only cue. */
export const STATUS_LABEL: Record<string, string> = {
  A: 'добавлен',
  M: 'изменён',
  D: 'удалён',
  R: 'переименован',
  C: 'скопирован',
  T: 'изменён тип',
};

export const STATUS_SHAPE: Record<string, string> = {
  A: 'квадрат',
  M: 'круг',
  D: 'крест',
  R: 'ромб',
  C: 'треугольник',
  T: 'квадрат',
};
