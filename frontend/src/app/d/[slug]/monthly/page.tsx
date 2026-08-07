'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Gift, Trophy } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card, EmptyState, Notice, Select, Skeleton } from '@/components/ui';
import { Avatar, RankBadge, StatTile } from '@/components/bits';
import { RankedBars } from '@/components/charts';
import { cx, formatPoints, medalFor } from '@/lib/format';

export default function MonthlyPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const month = search.get('month');

  const { data, loading } = useApi<any>(
    `/api/public/departments/${params.slug}/monthly${month ? `?month=${month}` : ''}`,
    { auth: false, deps: [params.slug, month] },
  );
  const months = useApi<any>(`/api/public/departments/${params.slug}/months`, {
    auth: false,
    deps: [params.slug],
  });

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-10">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  const standings = data?.standings ?? [];
  const leader = standings[0];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link
        href={`/d/${params.slug}`}
        className="mb-4 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ChevronLeft size={15} /> Weekly leaderboard
      </Link>

      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-pill border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-gold">
            <Trophy size={12} /> Monthly race
          </div>
          <h1 className="mt-3 text-[28px] font-black leading-tight tracking-tight text-ink">
            {data?.monthName ?? 'Monthly standings'}
          </h1>
          <p className="mt-1 text-[13px] text-ink-3">
            {data?.department?.name} · points from every published week in the month, added together
          </p>
        </div>

        {(months.data?.months?.length ?? 0) > 1 && (
          <Select
            value={data?.monthKey ?? ''}
            onChange={(e) => router.push(`/d/${params.slug}/monthly?month=${e.target.value}`)}
            className="w-[176px]"
            aria-label="Choose month"
          >
            {months.data.months.map((m: any) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </Select>
        )}
      </div>

      {data?.prize?.employee && (
        <Notice tone="good" title={`${data.prize.title} — ${data.prize.employee.name}`} className="mb-6">
          {data.prize.reward ? (
            <>
              Prize: <strong className="text-ink">{data.prize.reward}</strong>. Confirmed by the department manager.
            </>
          ) : (
            'Confirmed by the department manager.'
          )}
        </Notice>
      )}

      {standings.length === 0 ? (
        <EmptyState icon={<Trophy size={30} />} title="No published weeks in this month yet">
          Monthly standings appear once at least one week has been published.
        </EmptyState>
      ) : (
        <>
          {/* Current leader */}
          {leader && (
            <Card className="mb-6 overflow-hidden">
              <div
                className="flex flex-wrap items-center gap-4 p-5"
                style={{ background: 'linear-gradient(100deg, rgba(244,183,64,0.10), transparent 60%)' }}
              >
                <Avatar
                  name={leader.employee.name}
                  initials={leader.employee.initials}
                  colour={leader.employee.colour}
                  size={62}
                  ring="#F4B740"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-gold">
                    {data.prize?.employee ? 'Month champion' : 'Currently leading'}
                  </div>
                  <Link href={`/p/${leader.employee.slug}`} className="block text-[20px] font-black text-ink hover:text-s1">
                    {leader.employee.name}
                  </Link>
                  <p className="mt-0.5 text-[12.5px] text-ink-3 tnum">
                    {leader.weeksCounted} {leader.weeksCounted === 1 ? 'week' : 'weeks'} · {leader.wins}{' '}
                    weekly {leader.wins === 1 ? 'win' : 'wins'} · {leader.podiums} podium finishes
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[32px] font-black leading-none text-ink">{formatPoints(leader.points)}</div>
                  <div className="text-[11px] font-semibold text-ink-3">points this month</div>
                </div>
              </div>
            </Card>
          )}

          {/* Bars */}
          <Card className="mb-6 p-5">
            <RankedBars
              title="Points this month"
              subtitle={`${data.weeks.length} ${data.weeks.length === 1 ? 'week' : 'weeks'} counted`}
              rows={standings.slice(0, 12).map((s: any) => ({
                key: s.employee.id,
                label: s.employee.name,
                value: s.points,
                dotColour: s.employee.colour,
                sub: `${s.weeksCounted} wks · ${s.avgActivity}% avg activity · best position ${s.bestRank}`,
              }))}
              unit=" pts"
            />
          </Card>

          {/* Table */}
          <div className="overflow-x-auto rounded-card border border-hairline bg-surface">
            <table className="w-full min-w-[620px] text-[13px]">
              <thead>
                <tr className="border-b border-hairline text-left">
                  <th className="px-4 py-2.5 label">#</th>
                  <th className="px-2 py-2.5 label">Team member</th>
                  <th className="px-2 py-2.5 label text-right">Weeks</th>
                  <th className="px-2 py-2.5 label text-right">Wins</th>
                  <th className="px-2 py-2.5 label text-right">Avg activity</th>
                  <th className="px-2 py-2.5 label text-right">Hours</th>
                  <th className="px-4 py-2.5 label text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s: any) => (
                  <tr key={s.employee.id} className="border-b border-hairline/60 last:border-0 hover:bg-white/[0.025]">
                    <td className="px-4 py-2.5">
                      <RankBadge rank={s.rank} size={28} />
                    </td>
                    <td className="px-2 py-2.5">
                      <Link href={`/p/${s.employee.slug}`} className="flex items-center gap-2.5 font-semibold text-ink hover:text-s1">
                        <Avatar name={s.employee.name} initials={s.employee.initials} colour={s.employee.colour} size={28} />
                        <span className="truncate">{s.employee.name}</span>
                      </Link>
                    </td>
                    <td className="px-2 py-2.5 text-right text-ink-2 tnum">{s.weeksCounted}</td>
                    <td className="px-2 py-2.5 text-right tnum">
                      {s.wins > 0 ? <span className="font-bold text-gold">{s.wins}</span> : <span className="text-ink-3">0</span>}
                    </td>
                    <td className="px-2 py-2.5 text-right text-ink-2 tnum">{s.avgActivity}%</td>
                    <td className="px-2 py-2.5 text-right text-ink-2 tnum">{s.durationLabel}</td>
                    <td className="px-4 py-2.5 text-right text-[15px] font-bold text-ink tnum">{formatPoints(s.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 flex gap-2 text-[12px] leading-relaxed text-ink-3">
            <Gift size={13} className="mt-0.5 shrink-0" />
            Monthly totals are the sum of weekly points. A week belongs to the month containing its Thursday, so a week
            that straddles two months is only ever counted once.
          </p>
        </>
      )}
    </div>
  );
}
