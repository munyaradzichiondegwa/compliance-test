import React from 'react';

const SEGMENTS = [
  { key: 'governance', label: 'Governance', weight: 0.2, color: '#0F2A4A' },
  { key: 'controls', label: 'Internal Controls', weight: 0.25, color: '#1E4270' },
  { key: 'procurement', label: 'Procurement', weight: 0.2, color: '#B8862E' },
  { key: 'finance', label: 'Financial Mgmt', weight: 0.2, color: '#8C6620' },
  { key: 'integrity', label: 'Integrity', weight: 0.15, color: '#2F7A4D' },
];

function ragColor(score: number | null): string {
  if (score === null) return '#88909A';
  if (score >= 75) return '#2F7A4D';
  if (score >= 50) return '#C2680B';
  return '#B3402F';
}

interface ComplianceRingProps {
  compositeScore: number | null;
  size?: number;
  showLegend?: boolean;
  sectionScores?: Record<string, number | null>;
}

/**
 * The portal's signature visual motif: a segmented seal-like ring where each
 * arc is sized to its real weight in the composite score formula (Governance
 * 20%, Controls 25%, Procurement 20%, Finance 20%, Integrity 15%), with the
 * composite score and RAG colour at the centre. The segmentation is real
 * data, not decoration — it's the actual weighting scheme from the PRD.
 */
export default function ComplianceRing({ compositeScore, size = 160, showLegend = false }: ComplianceRingProps) {
  const stroke = size * 0.11;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const color = ragColor(compositeScore);

  let cursor = 0;
  const arcs = SEGMENTS.map((seg) => {
    const len = circumference * seg.weight;
    const gap = circumference * 0.012;
    const dashArray = `${Math.max(len - gap, 0)} ${circumference - Math.max(len - gap, 0)}`;
    const dashOffset = -cursor;
    cursor += len;
    return { ...seg, dashArray, dashOffset };
  });

  return (
    <div className="inline-flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={center} cy={center} r={radius} fill="none" stroke="#E4E0D3" strokeWidth={stroke} />
          {arcs.map((arc) => (
            <circle
              key={arc.key}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={stroke}
              strokeDasharray={arc.dashArray}
              strokeDashoffset={arc.dashOffset}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display font-semibold" style={{ fontSize: size * 0.24, color }}>
            {compositeScore !== null ? Math.round(compositeScore) : '—'}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-slate">of 100</span>
        </div>
      </div>
      {showLegend && (
        <div className="grid grid-cols-1 gap-1.5 text-xs w-full max-w-[220px]">
          {SEGMENTS.map((seg) => (
            <div key={seg.key} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-slate">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: seg.color }} />
                {seg.label}
              </span>
              <span className="font-mono text-ink">{Math.round(seg.weight * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { ragColor };
