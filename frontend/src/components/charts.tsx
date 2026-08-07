'use client';

/**
 * Hand-rolled SVG charts.
 *
 * Built to the data-viz house rules rather than to a chart library's defaults:
 *   • one axis, never two
 *   • thin marks with 4px rounded data-ends anchored to the baseline
 *   • a 2px surface gap between adjacent fills
 *   • recessive grid and axes; text in ink tokens, never the series colour
 *   • single series carries no legend — the title names it
 *   • every chart ships a hover layer with a tooltip
 *   • a table view is available behind a toggle, so nothing is colour-only
 */

import { useId, useMemo, useState } from 'react';
import { cx, formatDuration, formatPoints, shortDate, weekdayOf } from '@/lib/format';

const SURFACE = '#15161C';
const GRID = '#24262F';
const BASELINE = '#383A44';
const MUTED = '#8B8F9E';
const SERIES = '#3987E5';

function Tooltip({ left, top, lines }: { left: string; top: number; lines: string[] }) {
  return (
    <div
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-rule bg-overlay px-2.5 py-1.5 text-[11px] leading-tight text-ink shadow-lift"
      style={{ left, top: top - 10, whiteSpace: 'nowrap' }}
      role="status"
    >
      {lines.map((l, i) => (
        <div key={i} className={i === 0 ? 'font-semibold' : 'text-ink-2 tnum'}>
          {l}
        </div>
      ))}
    </div>
  );
}

function TableToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="text-[11px] font-semibold text-ink-3 underline decoration-dotted underline-offset-2 hover:text-ink-2"
    >
      {open ? 'Hide table' : 'View as table'}
    </button>
  );
}

// ── Daily hours strip ────────────────────────────────────────────────────────

export function DayStrip({
  days,
  className,
}: {
  days: { date: string; seconds: number; hours: number; label: string }[];
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const max = Math.max(1, ...days.map((d) => d.seconds));

  if (days.length === 0) return null;

  return (
    <div className={className}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-bold text-ink">Hours tracked each day</h3>
          <p className="text-[11px] text-ink-3">Whole department combined</p>
        </div>
        <TableToggle open={showTable} onToggle={() => setShowTable((s) => !s)} />
      </div>

      <div className="relative flex h-[132px] items-end gap-[6px]">
        {days.map((d, i) => {
          const pct = d.seconds / max;
          const isZero = d.seconds === 0;
          return (
            <div
              key={d.date}
              className="group relative flex h-full flex-1 cursor-default flex-col items-center justify-end"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${weekdayOf(d.date)} ${shortDate(d.date)}: ${d.label}`}
            >
              {isZero ? (
                // A genuine zero gets a visible baseline tick, not an invisible bar.
                <div className="h-[3px] w-full max-w-[56px] rounded-full bg-white/15" />
              ) : (
                <div
                  className="w-full max-w-[56px] rounded-t-[4px] transition-all duration-500"
                  style={{
                    height: `${Math.max(4, pct * 100)}%`,
                    background: hover === i ? '#5598E7' : SERIES,
                  }}
                />
              )}
            </div>
          );
        })}

        {hover !== null && (
          <Tooltip
            left={`${((hover + 0.5) / days.length) * 100}%`}
            top={Math.max(24, 132 - (days[hover].seconds / max) * 132)}
            lines={[
              `${weekdayOf(days[hover].date)} ${shortDate(days[hover].date)}`,
              days[hover].seconds === 0 ? 'No time tracked' : days[hover].label,
            ]}
          />
        )}
      </div>

      <div className="mt-2 border-t pt-2" style={{ borderColor: BASELINE }}>
        <div className="flex gap-[6px]">
          {days.map((d) => (
            <div key={d.date} className="flex-1 text-center">
              <div className="text-[10px] font-semibold text-ink-3">{weekdayOf(d.date)}</div>
              <div className="text-[9px] text-ink-3/70 tnum">{shortDate(d.date)}</div>
            </div>
          ))}
        </div>
      </div>

      {showTable && (
        <table className="mt-3 w-full text-[12px]">
          <thead>
            <tr className="border-b border-hairline text-left text-ink-3">
              <th className="py-1.5 font-semibold">Day</th>
              <th className="py-1.5 text-right font-semibold">Hours</th>
            </tr>
          </thead>
          <tbody className="text-ink-2">
            {days.map((d) => (
              <tr key={d.date} className="border-b border-hairline/50">
                <td className="py-1.5">{`${weekdayOf(d.date)} ${shortDate(d.date)}`}</td>
                <td className="py-1.5 text-right tnum">{d.seconds === 0 ? '—' : d.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Points over time ─────────────────────────────────────────────────────────

export function PointsChart({
  points,
  height = 180,
  className,
  title = 'Points by week',
  subtitle,
}: {
  points: { label: string; value: number; rank?: number; sub?: string }[];
  height?: number;
  className?: string;
  title?: string;
  subtitle?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const gid = useId().replace(/:/g, '');

  const { path, area, coords, min, max } = useMemo(() => {
    const values = points.map((p) => p.value);
    const rawMax = Math.max(...values, 1);
    const rawMin = Math.min(...values, 0);
    const pad = (rawMax - rawMin) * 0.12 || 10;
    const max = rawMax + pad;
    const min = Math.max(0, rawMin - pad);

    const W = 100;
    const H = 100;
    const n = points.length;
    const coords = points.map((p, i) => ({
      x: n === 1 ? W / 2 : (i / (n - 1)) * W,
      y: H - ((p.value - min) / (max - min || 1)) * H,
      ...p,
    }));

    const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ');
    const area = `${path} L${coords[coords.length - 1]?.x ?? 0},100 L${coords[0]?.x ?? 0},100 Z`;
    return { path, area, coords, min, max };
  }, [points]);

  if (points.length === 0) return null;

  return (
    <div className={className}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-bold text-ink">{title}</h3>
          {subtitle && <p className="text-[11px] text-ink-3">{subtitle}</p>}
        </div>
        <TableToggle open={showTable} onToggle={() => setShowTable((s) => !s)} />
      </div>

      <div className="relative" style={{ height }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES} stopOpacity="0.28" />
              <stop offset="100%" stopColor={SERIES} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Recessive gridlines */}
          {[0, 25, 50, 75, 100].map((y) => (
            <line key={y} x1="0" y1={y} x2="100" y2={y} stroke={GRID} strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
          ))}

          {points.length > 1 && <path d={area} fill={`url(#g${gid})`} />}
          <path
            d={path}
            fill="none"
            stroke={SERIES}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Crosshair */}
          {hover !== null && (
            <line
              x1={coords[hover].x}
              y1="0"
              x2={coords[hover].x}
              y2="100"
              stroke={MUTED}
              strokeWidth="1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Markers get a 2px surface ring so they read against the line */}
          {coords.map((c, i) => (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={hover === i ? 5 : 3.5}
              fill={SERIES}
              stroke={SURFACE}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              style={{ transition: 'r 0.15s' }}
            />
          ))}

          {/* Generous invisible hit targets */}
          {coords.map((c, i) => (
            <rect
              key={`h${i}`}
              x={c.x - 100 / Math.max(points.length, 2) / 2}
              y="0"
              width={100 / Math.max(points.length, 2)}
              height="100"
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              style={{ cursor: 'pointer' }}
            />
          ))}
        </svg>

        {hover !== null && (
          <Tooltip
            left={`${coords[hover].x}%`}
            top={(coords[hover].y / 100) * height}
            lines={[
              points[hover].label,
              `${formatPoints(points[hover].value)} pts`,
              ...(points[hover].rank ? [`Position ${points[hover].rank}`] : []),
              ...(points[hover].sub ? [points[hover].sub!] : []),
            ]}
          />
        )}
      </div>

      <div className="mt-2 flex justify-between border-t pt-2 text-[10px] text-ink-3" style={{ borderColor: BASELINE }}>
        <span>{points[0]?.label}</span>
        {points.length > 2 && <span className="text-ink-3/60">{points.length} weeks</span>}
        <span>{points[points.length - 1]?.label}</span>
      </div>

      {showTable && (
        <table className="mt-3 w-full text-[12px]">
          <thead>
            <tr className="border-b border-hairline text-left text-ink-3">
              <th className="py-1.5 font-semibold">Week</th>
              <th className="py-1.5 text-right font-semibold">Points</th>
              {points.some((p) => p.rank) && <th className="py-1.5 text-right font-semibold">Position</th>}
            </tr>
          </thead>
          <tbody className="text-ink-2">
            {points.map((p, i) => (
              <tr key={i} className="border-b border-hairline/50">
                <td className="py-1.5">{p.label}</td>
                <td className="py-1.5 text-right tnum">{formatPoints(p.value)}</td>
                {points.some((x) => x.rank) && <td className="py-1.5 text-right tnum">{p.rank ?? '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Ranked horizontal bars ───────────────────────────────────────────────────

/**
 * Used for the department-versus-department table. The bars encode MAGNITUDE,
 * so they are one hue — the department's own colour appears as a small identity
 * dot beside the name instead. Ten different bar hues would be a cycled
 * categorical palette, which is exactly what the house rules forbid.
 */
export function RankedBars({
  rows,
  unit = '',
  className,
  title,
  subtitle,
}: {
  rows: { key: string; label: string; value: number; dotColour?: string; sub?: string; href?: string }[];
  unit?: string;
  className?: string;
  title?: string;
  subtitle?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className={className}>
      {title && (
        <div className="mb-3">
          <h3 className="text-[13px] font-bold text-ink">{title}</h3>
          {subtitle && <p className="text-[11px] text-ink-3">{subtitle}</p>}
        </div>
      )}
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div
            key={r.key}
            className="group"
            onMouseEnter={() => setHover(r.key)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-ink-2">
                {r.dotColour && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: r.dotColour }}
                    aria-hidden
                  />
                )}
                <span className="truncate">{r.label}</span>
              </span>
              <span className="shrink-0 text-[13px] font-bold text-ink tnum">
                {formatPoints(r.value)}
                {unit && <span className="ml-0.5 text-[11px] font-medium text-ink-3">{unit}</span>}
              </span>
            </div>
            <div className="h-[7px] w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(r.value / max) * 100}%`,
                  background: hover === r.key ? '#5598E7' : SERIES,
                }}
              />
            </div>
            {r.sub && <div className="mt-1 text-[11px] text-ink-3">{r.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
