import { STATUS_LABEL, STATUS_SHAPE } from '../lib/ext';

const GLYPH: Record<string, string> = { A: '■', M: '●', D: '✕', R: '◆', C: '▲', T: '■' };

export function Legend() {
  return (
    <div className="legend">
      {Object.keys(STATUS_LABEL).map((status) => (
        <span key={status} className="legend-item" title={STATUS_SHAPE[status]}>
          <span className="legend-glyph">{GLYPH[status]}</span>
          {STATUS_LABEL[status]}
        </span>
      ))}
      <span className="legend-item">
        <span className="legend-bar" /> время жизни файла
      </span>
      <span className="legend-item">
        <span className="legend-merge" /> мерж-коммит
      </span>
    </div>
  );
}
