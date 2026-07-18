import React from 'react';

// Schematic cartogram, not a literal traced border map — each province is a
// uniform tile positioned in roughly correct relative geography (Mashonaland
// provinces across the north, Manicaland along the east, Matabeleland astride
// the west, Midlands/Masvingo south-central). This is a standard, well
// understood convention for administrative-region dashboards (the same
// approach US state "cartogram" maps use) and avoids asserting precise
// boundary accuracy this environment cannot verify.
const GRID: { province: string; col: number; row: number }[] = [
  { province: 'Mashonaland West', col: 1, row: 0 },
  { province: 'Mashonaland Central', col: 2, row: 0 },
  { province: 'Mashonaland East', col: 3, row: 0 },
  { province: 'Matabeleland North', col: 0, row: 1 },
  { province: 'Harare', col: 2, row: 1 },
  { province: 'Manicaland', col: 4, row: 1 },
  { province: 'Bulawayo', col: 1, row: 2 },
  { province: 'Midlands', col: 2, row: 2 },
  { province: 'Matabeleland South', col: 1, row: 3 },
  { province: 'Masvingo', col: 3, row: 3 },
];

export interface ProvinceDatum {
  province: string;
  color?: string;
  value?: number | string | null;
  sublabel?: string;
}

interface ZimbabweMapProps {
  data: ProvinceDatum[];
  onSelect?: (province: string) => void;
  selected?: string | null;
  size?: number;
}

export default function ZimbabweMap({ data, onSelect, selected, size = 480 }: ZimbabweMapProps) {
  const cols = 5;
  const rows = 4;
  const gap = 6;
  const tile = (size - gap * (cols - 1)) / cols;
  const height = tile * rows + gap * (rows - 1);
  const byProvince = new Map(data.map((d) => [d.province, d]));

  return (
    <div>
      <svg viewBox={`0 0 ${size} ${height}`} width="100%" style={{ maxWidth: size }} role="img" aria-label="Map of Zimbabwe by province">
        {GRID.map((cell) => {
          const d = byProvince.get(cell.province);
          const x = cell.col * (tile + gap);
          const y = cell.row * (tile + gap);
          const isSelected = selected === cell.province;
          const fill = d?.color || '#E4E0D3';
          return (
            <g
              key={cell.province}
              onClick={() => onSelect?.(cell.province)}
              className={onSelect ? 'cursor-pointer' : ''}
              tabIndex={onSelect ? 0 : undefined}
              role={onSelect ? 'button' : undefined}
              aria-label={cell.province}
            >
              <rect
                x={x}
                y={y}
                width={tile}
                height={tile}
                rx={8}
                fill={fill}
                stroke={isSelected ? '#0F2A4A' : '#FFFFFF'}
                strokeWidth={isSelected ? 3 : 2}
                className="transition-all duration-150"
              />
              <text
                x={x + tile / 2}
                y={y + tile / 2 - (d?.sublabel ? 6 : 0)}
                textAnchor="middle"
                fontSize={tile * 0.115}
                fontFamily="IBM Plex Sans"
                fontWeight={600}
                fill={contrastColor(fill)}
              >
                {shortName(cell.province)}
              </text>
              {d?.sublabel && (
                <text x={x + tile / 2} y={y + tile / 2 + tile * 0.18} textAnchor="middle" fontSize={tile * 0.15} fontFamily="IBM Plex Mono" fontWeight={600} fill={contrastColor(fill)}>
                  {d.sublabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function shortName(name: string): string {
  const map: Record<string, string> = {
    'Mashonaland West': 'Mash. West',
    'Mashonaland Central': 'Mash. Central',
    'Mashonaland East': 'Mash. East',
    'Matabeleland North': 'Mat. North',
    'Matabeleland South': 'Mat. South',
  };
  return map[name] || name;
}

function contrastColor(hex: string): string {
  if (!hex.startsWith('#') || hex.length < 7) return '#0A1424';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#0A1424' : '#FFFFFF';
}
