interface Datum { label: string; value: number; }

const PALETTE = ["#2563eb", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export function BarChart({ data, height = 240 }: { data: Datum[]; height?: number }) {
  if (data.length === 0) return <div className="text-gray-500">No data.</div>;
  const max = Math.max(...data.map((d) => d.value), 1);
  const w = 560;
  const barW = Math.max(8, Math.floor((w - 40) / data.length) - 6);
  return (
    <svg viewBox={`0 0 ${w} ${height + 40}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {data.map((d, i) => {
        const h = Math.max(0, (d.value / max) * height);
        const x = 40 + i * (barW + 6);
        const y = height - h;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={h} fill={PALETTE[i % PALETTE.length]} />
            <text x={x + barW / 2} y={height + 12} fontSize={9} textAnchor="middle">{d.label.slice(0, 8)}</text>
            <text x={x + barW / 2} y={y - 4} fontSize={9} textAnchor="middle">{d.value.toFixed(2)}</text>
          </g>
        );
      })}
      <line x1={40} y1={height} x2={w} y2={height} stroke="#000" strokeWidth={1} />
    </svg>
  );
}

export function HBarChart({ data, height = 240 }: { data: Datum[]; height?: number }) {
  if (data.length === 0) return <div className="text-gray-500">No data.</div>;
  const max = Math.max(...data.map((d) => d.value), 1);
  const w = 560;
  const rowH = Math.max(14, Math.floor(height / data.length) - 4);
  const labelW = 120;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {data.map((d, i) => {
        const bw = Math.max(0, (d.value / max) * (w - labelW - 60));
        const y = i * (rowH + 4);
        return (
          <g key={i}>
            <text x={0} y={y + rowH - 3} fontSize={9}>{d.label.slice(0, 16)}</text>
            <rect x={labelW} y={y} width={bw} height={rowH} fill={PALETTE[i % PALETTE.length]} />
            <text x={labelW + bw + 4} y={y + rowH - 3} fontSize={9}>{d.value.toFixed(2)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function LineChart({ data, height = 240 }: { data: Datum[]; height?: number }) {
  if (data.length === 0) return <div className="text-gray-500">No data.</div>;
  const max = Math.max(...data.map((d) => d.value), 1);
  const w = 560;
  const step = data.length > 1 ? (w - 40) / (data.length - 1) : 0;
  const pts = data.map((d, i) => `${40 + i * step},${height - (d.value / max) * height}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height + 40}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      <polyline points={pts} fill="none" stroke="#2563eb" strokeWidth={2} />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={40 + i * step} cy={height - (d.value / max) * height} r={3} fill="#2563eb" />
          <text x={40 + i * step} y={height + 12} fontSize={9} textAnchor="middle">{d.label.slice(0, 8)}</text>
        </g>
      ))}
      <line x1={40} y1={height} x2={w} y2={height} stroke="#000" strokeWidth={1} />
    </svg>
  );
}

export function PieChart({ data, size = 240 }: { data: Datum[]; size?: number }) {
  if (data.length === 0) return <div className="text-gray-500">No data.</div>;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = size / 2;
  const cx = r, cy = r;
  const slices = data
    .reduce<{ slices: { d: string; fill: string; label: string; value: number }[]; angle: number }>(
      (acc, d, i) => {
        const slice = (d.value / total) * 2 * Math.PI;
        const x1 = cx + r * Math.cos(acc.angle);
        const y1 = cy + r * Math.sin(acc.angle);
        const end = acc.angle + slice;
        const x2 = cx + r * Math.cos(end);
        const y2 = cy + r * Math.sin(end);
        const large = slice > Math.PI ? 1 : 0;
        return {
          angle: end,
          slices: [
            ...acc.slices,
            {
              d: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`,
              fill: PALETTE[i % PALETTE.length],
              label: d.label,
              value: d.value,
            },
          ],
        };
      },
      { slices: [], angle: -Math.PI / 2 },
    )
    .slices;
  return (
    <div className="flex gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {slices.map((s, i) => <path key={i} d={s.d} fill={s.fill} stroke="#fff" strokeWidth={1} />)}
      </svg>
      <ul className="text-xs space-y-1">
        {slices.map((s, i) => (
          <li key={i}><span style={{ color: s.fill }}>●</span> {s.label}: {s.value.toFixed(2)}</li>
        ))}
      </ul>
    </div>
  );
}