'use client';

import Link from 'next/link';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { Icon } from '@/lib/icons';
import { cx, formatPoints, medalFor } from '@/lib/format';
import type { ReactNode } from 'react';

// ── Avatar ───────────────────────────────────────────────────────────────────

export function Avatar({
  name,
  initials,
  colour,
  size = 40,
  ring,
}: {
  name: string;
  initials?: string;
  colour: string;
  size?: number;
  ring?: string;
}) {
  const text =
    initials ??
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('');
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.36),
        background: `linear-gradient(140deg, ${colour}, ${colour}99)`,
        boxShadow: ring ? `0 0 0 2px ${ring}, 0 0 0 4px rgba(0,0,0,0.35)` : `inset 0 0 0 1px var(--rule)`,
      }}
      aria-hidden
    >
      {text}
    </span>
  );
}

// ── Rank movement ────────────────────────────────────────────────────────────

/**
 * Movement is encoded three ways at once — arrow shape, colour and a number —
 * so it never depends on colour alone.
 */
export function RankDelta({ delta, isNew }: { delta: number | null | undefined; isNew?: boolean }) {
  if (isNew || delta === null || delta === undefined) {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill border border-rule px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-3">
        New
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-ink-3" title="No change from last week">
        <Minus size={11} /> 0
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={cx('inline-flex items-center gap-0.5 text-[11px] font-bold tnum', up ? 'text-good' : 'text-critical')}
      title={up ? `Up ${delta} place${delta > 1 ? 's' : ''} from last week` : `Down ${-delta} place${-delta > 1 ? 's' : ''} from last week`}
    >
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {Math.abs(delta)}
    </span>
  );
}

// ── Rank badge ───────────────────────────────────────────────────────────────

export function RankBadge({ rank, size = 34 }: { rank: number; size?: number }) {
  const medal = medalFor(rank);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl font-black tnum"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: medal ? `${medal.colour}1F` : 'rgb(var(--ink-rgb) / 0.04)',
        color: medal ? medal.colour : 'rgb(var(--ink-3-rgb))',
        border: `1px solid ${medal ? `${medal.colour}55` : 'rgb(var(--ink-rgb) / 0.1)'}`,
      }}
      title={medal ? `${medal.label} — position ${rank}` : `Position ${rank}`}
    >
      {rank}
    </span>
  );
}

// ── Badge chip ───────────────────────────────────────────────────────────────

export function BadgeChip({
  badge,
  count,
  size = 'md',
}: {
  badge: { key: string; name: string; icon: string; colour: string; description?: string };
  count?: number;
  size?: 'sm' | 'md';
}) {
  const px = size === 'sm' ? 22 : 28;
  return (
    <span
      className="group relative inline-flex items-center justify-center rounded-lg"
      style={{
        width: px,
        height: px,
        background: `${badge.colour}1C`,
        border: `1px solid ${badge.colour}4D`,
        color: badge.colour,
      }}
      title={`${badge.name}${count && count > 1 ? ` ×${count}` : ''}${badge.description ? ` — ${badge.description}` : ''}`}
    >
      <Icon name={badge.icon} size={size === 'sm' ? 12 : 15} />
      {count && count > 1 ? (
        <span className="absolute -bottom-1 -right-1 rounded-full bg-plane px-1 text-[9px] font-bold text-ink-2 ring-1 ring-rule tnum">
          {count}
        </span>
      ) : null}
      <span className="sr-only">{badge.name}</span>
    </span>
  );
}

// ── Stat tile ────────────────────────────────────────────────────────────────

/**
 * A stat tile is the right form when the data's job is a single headline number.
 * Value uses proportional figures (it stands alone, it does not align in a column).
 */
export function StatTile({
  label,
  value,
  sub,
  accent = '#3987E5',
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
  icon?: string;
  className?: string;
}) {
  return (
    <div className={cx('card relative overflow-hidden p-4', className)}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}88, transparent)` }}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-3">
        <span className="label">{label}</span>
        {icon && (
          <span style={{ color: accent }} className="opacity-80">
            <Icon name={icon} size={15} />
          </span>
        )}
      </div>
      <div className="mt-2 text-[26px] font-bold leading-none tracking-tight text-ink">{value}</div>
      {sub && <div className="mt-1.5 text-[12px] leading-snug text-ink-3">{sub}</div>}
    </div>
  );
}

// ── Meter ────────────────────────────────────────────────────────────────────

/** Horizontal progress meter. 4px rounded data-end, anchored to the baseline. */
export function Meter({
  value,
  max = 1,
  colour = '#3987E5',
  height = 6,
  label,
}: {
  value: number;
  max?: number;
  colour?: string;
  height?: number;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-ink/[0.07]"
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(pct * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${pct * 100}%`, background: colour }}
      />
    </div>
  );
}

// ── Link wrapper that degrades to a span ────────────────────────────────────

export function MaybeLink({ href, children, className }: { href?: string | null; children: ReactNode; className?: string }) {
  if (!href) return <span className={className}>{children}</span>;
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
