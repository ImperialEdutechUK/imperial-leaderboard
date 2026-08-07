'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronDown, Crown, Info, Sparkles } from 'lucide-react';
import { Avatar, BadgeChip, Meter, RankBadge, RankDelta } from './bits';
import { Modal, Pill } from './ui';
import { cx, formatPoints, medalFor } from '@/lib/format';

export interface StandingRow {
  rank: number;
  previousRank: number | null;
  rankDelta: number | null;
  qualified: boolean;
  employee: {
    id: string;
    name: string;
    shortName: string;
    slug: string;
    colour: string;
    initials: string;
    jobTitle: string | null;
    isManager: boolean;
  };
  seconds: number;
  hours: number;
  durationLabel: string;
  activityPct: number;
  points: number;
  basePoints: number;
  bonusPoints: number;
  hoursScore: number;
  activityScore: number;
  isPersonalBest: boolean;
  bonusBreakdown: { key: string; label: string; points: number }[] | null;
  badges: { key: string; name: string; icon: string; colour: string; tier: string }[];
  targetProgress: number;
}

// ── Podium ───────────────────────────────────────────────────────────────────

export function Podium({ rows, celebrate }: { rows: StandingRow[]; celebrate?: boolean }) {
  const [fired, setFired] = useState(false);

  useEffect(() => {
    if (!celebrate || fired || rows.length === 0) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    setFired(true);
    import('canvas-confetti')
      .then((m) => {
        const confetti = m.default;
        confetti({
          particleCount: 90,
          spread: 78,
          origin: { y: 0.35 },
          colors: ['#F4B740', '#C0C7D1', '#CD7F45', '#3987E5'],
          disableForReducedMotion: true,
        });
      })
      .catch(() => {});
  }, [celebrate, fired, rows.length]);

  if (rows.length === 0) return null;

  // Visual order puts the winner in the middle on wide screens.
  const order = rows.length >= 3 ? [rows[1], rows[0], rows[2]] : rows;
  // min-height, not height: the winner's card carries a bigger avatar and more
  // badges, and a fixed height clips it.
  const heights: Record<number, string> = {
    1: 'sm:min-h-[226px]',
    2: 'sm:min-h-[196px]',
    3: 'sm:min-h-[182px]',
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
      {order.map((row) => {
        const medal = medalFor(row.rank)!;
        return (
          <Link
            key={row.employee.id}
            href={`/p/${row.employee.slug}`}
            className={cx(
              'group relative flex flex-col items-center justify-end rounded-card border p-4 pt-5 transition-all hover:-translate-y-0.5',
              heights[row.rank] ?? 'sm:min-h-[182px]',
            )}
            style={{
              borderColor: `${medal.colour}44`,
              background: `linear-gradient(180deg, ${medal.colour}14, ${medal.colour}05 55%, transparent)`,
            }}
          >
            {row.rank === 1 && (
              <Crown
                size={18}
                className="absolute right-3 top-3 opacity-90"
                style={{ color: medal.colour }}
                aria-hidden
              />
            )}

            <Avatar
              name={row.employee.name}
              initials={row.employee.initials}
              colour={row.employee.colour}
              size={row.rank === 1 ? 58 : 46}
              ring={medal.colour}
            />

            <div className="mt-2.5 text-center">
              <div
                className="text-[10px] font-black uppercase tracking-[0.14em]"
                style={{ color: medal.colour }}
              >
                {medal.label}
              </div>
              <div className="mt-0.5 truncate text-[14px] font-bold text-ink">{row.employee.name}</div>
              <div className="mt-1 text-[21px] font-black leading-none text-ink">
                {formatPoints(row.points)}
                <span className="ml-1 text-[11px] font-semibold text-ink-3">pts</span>
              </div>
              <div className="mt-1.5 text-[11px] text-ink-3 tnum">
                {row.durationLabel} · {row.activityPct}% activity
              </div>
            </div>

            {row.badges.length > 0 && (
              <div className="mt-2.5 flex flex-wrap justify-center gap-1">
                {row.badges.slice(0, 4).map((b) => (
                  <BadgeChip key={b.key} badge={b} size="sm" />
                ))}
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}

// ── Score explainer ──────────────────────────────────────────────────────────

export function ScoreExplainer({
  row,
  scoring,
  open,
  onClose,
}: {
  row: StandingRow | null;
  scoring: { hoursWeight: number; activityWeight: number; targetHours: number; hoursCap: number; maxPoints: number } | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!row || !scoring) return null;

  const hoursPart = scoring.maxPoints * scoring.hoursWeight * row.hoursScore;
  const activityPart = scoring.maxPoints * scoring.activityWeight * row.activityScore;

  return (
    <Modal open={open} onClose={onClose} title={`How ${row.employee.name} scored ${formatPoints(row.points)}`}>
      <div className="space-y-4 text-[13px]">
        <div className="rounded-xl border border-hairline bg-plane p-3.5">
          <div className="label mb-2">The formula</div>
          <code className="block text-[11.5px] leading-relaxed text-ink-2">
            points = {scoring.maxPoints} × ({scoring.hoursWeight} × hoursScore + {scoring.activityWeight} × activityScore) + bonuses
          </code>
        </div>

        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="font-semibold text-ink">Hours</span>
              <span className="font-bold text-ink tnum">{hoursPart.toFixed(1)} pts</span>
            </div>
            <Meter value={row.hoursScore} colour="#3987E5" />
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">
              Worked <strong className="text-ink-2">{row.durationLabel}</strong> against a{' '}
              <strong className="text-ink-2">{scoring.targetHours}h</strong> target ={' '}
              {(row.hours / scoring.targetHours).toFixed(2)}× target.
              {row.hoursScore >= 0.999 && (
                <> Capped at {scoring.hoursCap}× target, so this is the maximum available from hours.</>
              )}{' '}
              Score {row.hoursScore.toFixed(2)} × {scoring.hoursWeight} × {scoring.maxPoints}.
            </p>
          </div>

          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="font-semibold text-ink">Activity</span>
              <span className="font-bold text-ink tnum">{activityPart.toFixed(1)} pts</span>
            </div>
            <Meter value={row.activityScore} colour="#199E70" />
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">
              Screenshot Monitor recorded <strong className="text-ink-2">{row.activityPct}%</strong> activity. Score{' '}
              {row.activityScore.toFixed(2)} × {scoring.activityWeight} × {scoring.maxPoints}.
            </p>
          </div>
        </div>

        {row.bonusBreakdown && row.bonusBreakdown.length > 0 && (
          <div className="rounded-xl border border-hairline bg-plane p-3.5">
            <div className="label mb-2">Bonuses</div>
            <ul className="space-y-1.5">
              {row.bonusBreakdown.map((b) => (
                <li key={b.key} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span className="text-ink-2">{b.label}</span>
                  <span className="shrink-0 font-bold text-good tnum">+{b.points}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-baseline justify-between border-t border-rule pt-3">
          <span className="font-bold text-ink">Total</span>
          <span className="text-[19px] font-black text-ink tnum">{formatPoints(row.points)} pts</span>
        </div>

        <p className="flex gap-2 text-[11.5px] leading-relaxed text-ink-3">
          <Info size={13} className="mt-0.5 shrink-0" />
          Hours are capped at {scoring.hoursCap}× the target on purpose. Without a cap the leaderboard would simply reward
          the longest hours, which pushes people towards burnout rather than towards good work.
        </p>
      </div>
    </Modal>
  );
}

// ── Full standings table ─────────────────────────────────────────────────────

export function LeaderboardTable({
  rows,
  scoring,
  targetHours,
  startAt = 0,
}: {
  rows: StandingRow[];
  scoring: any;
  targetHours: number;
  startAt?: number;
}) {
  const [explain, setExplain] = useState<StandingRow | null>(null);
  const visible = rows.slice(startAt);

  if (visible.length === 0) return null;

  return (
    <>
      <div className="overflow-hidden rounded-card border border-hairline bg-surface">
        {/* Header — hidden on mobile where the layout stacks */}
        <div className="hidden items-center gap-3 border-b border-hairline px-4 py-2.5 md:flex">
          <span className="w-[34px] shrink-0 label">#</span>
          <span className="w-[38px] shrink-0" />
          <span className="min-w-0 flex-1 label">Team member</span>
          <span className="w-[92px] shrink-0 label text-right">Hours</span>
          <span className="w-[120px] shrink-0 label">Activity</span>
          <span className="w-[100px] shrink-0 label text-right">Points</span>
          <span className="w-[110px] shrink-0 label">Badges</span>
        </div>

        <ul>
          {visible.map((row, i) => {
            const medal = medalFor(row.rank);
            return (
              <li
                key={row.employee.id}
                className={cx(
                  'group border-b border-hairline/60 transition-colors last:border-0 hover:bg-white/[0.025]',
                  !row.qualified && 'opacity-60',
                )}
              >
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 md:flex-nowrap">
                  {/* Rank */}
                  <div className="flex w-[34px] shrink-0 flex-col items-center gap-0.5">
                    {row.qualified ? (
                      <RankBadge rank={row.rank} />
                    ) : (
                      <span
                        className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-xl border border-rule text-[15px] text-ink-3"
                        title="Not ranked — below the qualifying hours threshold"
                      >
                        –
                      </span>
                    )}
                    <RankDelta delta={row.rankDelta} isNew={row.previousRank === null} />
                  </div>

                  <Link href={`/p/${row.employee.slug}`} className="shrink-0">
                    <Avatar
                      name={row.employee.name}
                      initials={row.employee.initials}
                      colour={row.employee.colour}
                      size={38}
                      ring={medal?.colour}
                    />
                  </Link>

                  {/* Name */}
                  <div className="min-w-0 flex-1 basis-[40%] md:basis-auto">
                    <Link
                      href={`/p/${row.employee.slug}`}
                      className="block truncate text-[14px] font-semibold text-ink hover:text-s1"
                    >
                      {row.employee.name}
                    </Link>
                    <div className="flex items-center gap-1.5 text-[11px] text-ink-3">
                      {row.employee.isManager && <span className="text-ink-3">Manager</span>}
                      {row.employee.jobTitle && !row.employee.isManager && <span>{row.employee.jobTitle}</span>}
                      {row.isPersonalBest && (
                        <span className="font-semibold text-good" title="New personal best">
                          ★ Personal best
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Hours */}
                  <div className="w-[92px] shrink-0 text-right">
                    <div className="text-[13px] font-semibold text-ink tnum">{row.durationLabel}</div>
                    <div className="text-[10px] text-ink-3 tnum">
                      {Math.round(row.targetProgress * 100)}% of {targetHours}h
                    </div>
                  </div>

                  {/* Activity — number plus meter, so it is never colour-only */}
                  <div className="w-[120px] shrink-0">
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-[13px] font-semibold text-ink tnum">{row.activityPct}%</span>
                    </div>
                    <Meter value={row.activityPct} max={100} colour="#199E70" height={5} label={`${row.activityPct}% activity`} />
                  </div>

                  {/* Points */}
                  <button
                    onClick={() => setExplain(row)}
                    className="w-[100px] shrink-0 text-right"
                    title="See how this score was calculated"
                  >
                    <div className="text-[16px] font-bold text-ink tnum group-hover:text-s1">
                      {formatPoints(row.points)}
                    </div>
                    <div className="text-[10px] text-ink-3">
                      {row.bonusPoints > 0 ? `incl. +${formatPoints(row.bonusPoints)} bonus` : 'how?'}
                    </div>
                  </button>

                  {/* Badges */}
                  <div className="flex w-[110px] shrink-0 flex-wrap gap-1">
                    {row.badges.slice(0, 4).map((b) => (
                      <BadgeChip key={b.key} badge={b} size="sm" />
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <ScoreExplainer row={explain} scoring={scoring} open={!!explain} onClose={() => setExplain(null)} />
    </>
  );
}
