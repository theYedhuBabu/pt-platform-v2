
export interface ChartSeries {
  name: string;
  color: string;
  data: number[];
}

export interface DonutSegment {
  value: number;
  color: string;
}

/* ---- Multi-series area/line chart ---- */
export function LineChart({
  series,
  height = 220,
  max,
  fill = true,
  grid = true,
}: {
  series: ChartSeries[];
  height?: number;
  max?: number;
  fill?: boolean;
  grid?: boolean;
}) {
  const w = 1000;
  const h = height;
  const pad = { l: 8, r: 8, t: 12, b: 18 };
  const len = Math.max(...series.map((s) => s.data.length), 2);
  const peak = max || Math.max(1, ...series.flatMap((s) => s.data)) * 1.18;
  const xAt = (i: number) => pad.l + (i / (len - 1)) * (w - pad.l - pad.r);
  const yAt = (v: number) => pad.t + (1 - v / peak) * (h - pad.t - pad.b);
  const path = (data: number[]) =>
    data.map((v, i) => (i ? 'L' : 'M') + xAt(i).toFixed(1) + ' ' + yAt(v).toFixed(1)).join(' ');
  const area = (data: number[]) =>
    path(data) + ` L${xAt(len - 1)} ${h - pad.b} L${xAt(0)} ${h - pad.b} Z`;
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      {grid &&
        gridLines.map((g, i) => (
          <g key={i}>
            <line
              x1={pad.l}
              x2={w - pad.r}
              y1={pad.t + g * (h - pad.t - pad.b)}
              y2={pad.t + g * (h - pad.t - pad.b)}
              stroke="var(--line)"
              strokeWidth="1"
              strokeDasharray={i === 0 || i === 4 ? '0' : '3 5'}
            />
            <text
              x={w - pad.r}
              y={pad.t + g * (h - pad.t - pad.b) - 3}
              textAnchor="end"
              fontSize="11"
              fill="var(--text-mute)"
              fontFamily="var(--mono)"
            >
              {Math.round(peak * (1 - g))}
            </text>
          </g>
        ))}
      {series.map((s, si) => (
        <g key={si}>
          {fill && (
            <>
              <defs>
                <linearGradient id={`g${si}-${si}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area(s.data)} fill={`url(#g${si}-${si})`} />
            </>
          )}
          <path
            d={path(s.data)}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {s.data.length > 0 && (
            <circle
              cx={xAt(s.data.length - 1)}
              cy={yAt(s.data[s.data.length - 1])}
              r="3.5"
              fill={s.color}
              stroke="var(--panel)"
              strokeWidth="2"
            />
          )}
        </g>
      ))}
    </svg>
  );
}

/* ---- Sparkline ---- */
export function Spark({
  data,
  color = 'var(--accent)',
  height = 34,
  width = 120,
}: {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
}) {
  if (data.length < 2) return <svg width={width} height={height} />;
  const peak = Math.max(1, ...data);
  const min = Math.min(...data);
  const range = Math.max(1, peak - min);
  const pts = data
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * width},${height - 2 - ((v - min) / range) * (height - 4)}`
    )
    .join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ---- Error bar chart ---- */
export function BarChart({
  data,
  height = 220,
  color = 'var(--red)',
}: {
  data: number[];
  height?: number;
  color?: string;
}) {
  const w = 1000;
  const h = height;
  const pad = { l: 8, r: 8, t: 12, b: 18 };
  const peak = Math.max(1, ...data) * 1.2;
  const bw = (w - pad.l - pad.r) / Math.max(1, data.length);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      <line x1={pad.l} x2={w - pad.r} y1={h - pad.b} y2={h - pad.b} stroke="var(--line)" />
      {data.map((v, i) => {
        const bh = (v / peak) * (h - pad.t - pad.b);
        return (
          <rect
            key={i}
            x={pad.l + i * bw + bw * 0.18}
            y={h - pad.b - bh}
            width={bw * 0.64}
            height={Math.max(0, bh)}
            rx="2"
            fill={color}
            opacity={0.55 + 0.45 * (v / peak)}
          />
        );
      })}
    </svg>
  );
}

/* ---- Donut chart ---- */
export function Donut({
  segments,
  size = 120,
  thickness = 14,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--bg-2)"
        strokeWidth={thickness}
      />
      {segments.map((s, i) => {
        const len = (s.value / total) * c;
        const el = (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={thickness}
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-off}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            strokeLinecap="butt"
          />
        );
        off += len;
        return el;
      })}
    </svg>
  );
}
