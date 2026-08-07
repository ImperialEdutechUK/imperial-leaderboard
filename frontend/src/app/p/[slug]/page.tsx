'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, Flame, Gift, Trophy } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card, EmptyState, Notice, Skeleton } from '@/components/ui';
import { Avatar, BadgeChip, Meter, RankBadge, RankDelta, StatTile } from '@/components/bits';
import { PointsChart } from '@/components/charts';
import { formatDate, formatPoints, medalFor } from '@/lib/format';

export default function ProfilePage() {
  const params = useParams<{ slug: string }>();
  const { data, loading, error } = useApi<any>(`/api/public/employees/${params.slug}`, {
    auth: false,
    deps: [params.slug],
  });

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-10">
        <Skeleton className="h-[140px]" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Notice tone="critical" title="Could not load this profile">
          {error.message}
        </Notice>
      </div>
    );
  }

  const e = data.employee;
  const t = data.totals;
  const level = data.level;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href={`/d/${e.department.slug}`}
        className="mb-4 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ChevronLeft size={15} /> {e.department.name}
      </Link>

      {/* Identity card */}
      <Card className="mb-6 overflow-hidden">
        <div
          className="flex flex-wrap items-center gap-5 p-6"
          style={{ background: `linear-gradient(105deg, ${e.colour}18, transparent 62%)` }}
        >
          <Avatar name={e.name} initials={e.initials} colour={e.colour} size={76} />
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] font-black leading-tight tracking-tight text-ink">{e.name}</h1>
            <p className="mt-0.5 text-[13px] text-ink-3">
              {e.jobTitle ? `${e.jobTitle} · ` : ''}
              {e.department.name}
              {e.isManager && ' · Manager'}
            </p>

            <div className="mt-3 max-w-sm">
              <div className="mb-1 flex items-baseline justify-between text-[12px]">
                <span className="font-bold text-ink">
                  Level {level.level} · {level.title}
                </span>
                <span className="text-ink-3 tnum">
                  {Math.round(t.points)} / {level.nextLevelAt} pts
                </span>
              </div>
              <Meter value={level.progress} colour={e.colour} height={7} label={`Level ${level.level} progress`} />
            </div>
          </div>

          {t.currentStreak > 1 && (
            <div className="rounded-xl border border-warning/35 bg-warning/10 px-3.5 py-2.5 text-center">
              <Flame size={16} className="mx-auto text-warning" aria-hidden />
              <div className="mt-1 text-[19px] font-black leading-none text-ink tnum">{t.currentStreak}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">week streak</div>
            </div>
          )}
        </div>
      </Card>

      {/* Totals */}
      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Lifetime points" value={formatPoints(t.points)} sub={`${t.avgPoints} average per week`} icon="Gem" accent="#22D3EE" />
        <StatTile label="Weekly wins" value={t.wins} sub={`${t.podiums} podium finishes`} icon="Crown" accent="#F4B740" />
        <StatTile label="Best position" value={t.bestRank ?? '—'} sub={`across ${t.weeksTracked} weeks`} icon="Medal" accent="#C0C7D1" />
        <StatTile label="Average activity" value={`${t.avgActivity}%`} sub={t.durationLabel + ' tracked'} icon="Target" accent="#199E70" />
      </section>

      {/* Prizes */}
      {data.prizes?.length > 0 && (
        <Card className="mb-6 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-ink">
            <Gift size={15} className="text-gold" /> Prizes won
          </h2>
          <ul className="space-y-2">
            {data.prizes.map((p: any, i: number) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-xl border border-gold/25 bg-gold/[0.07] px-3.5 py-2.5">
                <span className="text-[13px] font-semibold text-ink">{p.title}</span>
                {p.reward && <span className="text-[12px] text-ink-2">{p.reward}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Badges */}
      {data.badges?.length > 0 && (
        <Card className="mb-6 p-5">
          <h2 className="mb-3 text-[14px] font-bold text-ink">Badge cabinet</h2>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {data.badges.map((b: any) => (
              <div key={b.key} className="flex items-start gap-3 rounded-xl border border-hairline bg-plane p-3">
                <BadgeChip badge={b} count={b.count} />
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-ink">
                    {b.name}
                    {b.count > 1 && <span className="ml-1.5 text-[11px] font-semibold text-ink-3">×{b.count}</span>}
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{b.description}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* History */}
      {data.history?.length > 1 && (
        <Card className="mb-6 p-5">
          <PointsChart
            title="Form over time"
            subtitle="Points earned each week"
            points={data.history.map((h: any) => ({
              label: h.weekLabel,
              value: h.points,
              rank: h.rank,
              sub: `${h.durationLabel} · ${h.activityPct}% activity`,
            }))}
          />
        </Card>
      )}

      {/* Week by week */}
      {data.history?.length > 0 ? (
        <Card>
          <h2 className="border-b border-hairline px-5 py-3.5 text-[14px] font-bold text-ink">Week by week</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="border-b border-hairline text-left">
                  <th className="px-5 py-2.5 label">Week</th>
                  <th className="px-2 py-2.5 label">Position</th>
                  <th className="px-2 py-2.5 label text-right">Hours</th>
                  <th className="px-2 py-2.5 label text-right">Activity</th>
                  <th className="px-5 py-2.5 label text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {[...data.history].reverse().map((h: any) => (
                  <tr key={h.startDate} className="border-b border-hairline/60 last:border-0">
                    <td className="px-5 py-2.5 text-ink-2">{h.weekLabel}</td>
                    <td className="px-2 py-2.5">
                      <span className="flex items-center gap-2">
                        <RankBadge rank={h.rank} size={26} />
                        <RankDelta delta={h.rankDelta} />
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-right text-ink-2 tnum">{h.durationLabel}</td>
                    <td className="px-2 py-2.5 text-right text-ink-2 tnum">{h.activityPct}%</td>
                    <td className="px-5 py-2.5 text-right font-bold text-ink tnum">
                      {formatPoints(h.points)}
                      {h.isPersonalBest && <span className="ml-1.5 text-[11px] text-good" title="Personal best">★</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState icon={<Trophy size={28} />} title="No published weeks yet for this person" />
      )}
    </div>
  );
}
