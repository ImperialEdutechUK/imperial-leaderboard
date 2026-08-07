'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, ChevronLeft, ChevronRight, Info, Trophy } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Icon } from '@/lib/icons';
import { Card, EmptyState, Notice, Select, Skeleton } from '@/components/ui';
import { StatTile } from '@/components/bits';
import { DayStrip } from '@/components/charts';
import { LeaderboardTable, Podium, type StandingRow } from '@/components/leaderboard';
import { formatNumber } from '@/lib/format';

export default function DepartmentPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const week = search.get('week');

  const { data, loading, error } = useApi<any>(
    `/api/public/departments/${params.slug}/leaderboard${week ? `?week=${week}` : ''}`,
    { auth: false, deps: [params.slug, week] },
  );

  const [showAll, setShowAll] = useState(false);

  const standings: StandingRow[] = data?.standings ?? [];
  const podium: StandingRow[] = data?.podium ?? [];
  const dept = data?.department;
  const weeks: { startDate: string; label: string }[] = data?.availableWeeks ?? [];

  const weekIndex = useMemo(
    () => weeks.findIndex((w) => w.startDate === data?.week?.startDate),
    [weeks, data?.week?.startDate],
  );

  const go = (startDate: string) => router.push(`/d/${params.slug}?week=${startDate}`);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-10">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-[190px]" />
        <Skeleton className="h-[440px]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <Notice tone="critical" title="Could not load this leaderboard">
          {error.message}
        </Notice>
      </div>
    );
  }

  if (!data?.week) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <Link href="/" className="mb-6 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-ink">
          <ChevronLeft size={15} /> All departments
        </Link>
        <EmptyState icon={<Trophy size={30} />} title={`No published weeks for ${dept?.name ?? 'this department'} yet`}>
          Once a manager uploads and publishes the weekly Screenshot Monitor report, the leaderboard appears here.
        </EmptyState>
      </div>
    );
  }

  const rest = standings.slice(3);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-ink">
          <ChevronLeft size={15} /> All departments
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
              style={{ background: `${dept.colour}1F`, color: dept.colour, border: `1px solid ${dept.colour}44` }}
            >
              <Icon name={dept.icon} size={22} />
            </span>
            <div>
              <h1 className="text-[26px] font-black leading-tight tracking-tight text-ink">{dept.name}</h1>
              <p className="text-[13px] text-ink-3">
                Week of {data.week.label} · target {data.week.targetHours}h
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/d/${params.slug}/monthly`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rule px-3 py-2 text-[13px] font-semibold text-ink-2 hover:bg-white/5 hover:text-ink"
            >
              <Trophy size={14} /> Monthly race
            </Link>

            <div className="flex items-center gap-1">
              <button
                onClick={() => weekIndex < weeks.length - 1 && go(weeks[weekIndex + 1].startDate)}
                disabled={weekIndex >= weeks.length - 1}
                className="rounded-lg border border-rule p-2 text-ink-2 disabled:opacity-35 hover:bg-white/5"
                aria-label="Previous week"
              >
                <ChevronLeft size={15} />
              </button>
              <Select
                value={data.week.startDate}
                onChange={(e) => go(e.target.value)}
                className="w-[184px]"
                aria-label="Choose week"
              >
                {weeks.map((w) => (
                  <option key={w.startDate} value={w.startDate}>
                    {w.label}
                  </option>
                ))}
              </Select>
              <button
                onClick={() => weekIndex > 0 && go(weeks[weekIndex - 1].startDate)}
                disabled={weekIndex <= 0}
                className="rounded-lg border border-rule p-2 text-ink-2 disabled:opacity-35 hover:bg-white/5"
                aria-label="Next week"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>

        {data.week.note && (
          <Notice tone="info" className="mt-4">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={13} /> {data.week.note}
            </span>
          </Notice>
        )}
      </div>

      {/* Podium */}
      {podium.length > 0 && (
        <section className="mb-8">
          <h2 className="label mb-3">This week&rsquo;s podium</h2>
          <Podium rows={podium} celebrate />
        </section>
      )}

      {/* Stats */}
      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Team size" value={formatNumber(data.stats.headcount)} sub="people in this week" icon="Users" accent="#9085E9" />
        <StatTile
          label="Total hours"
          value={data.stats.totalHoursLabel}
          sub={`${data.stats.avgHours}h average each`}
          icon="Timer"
          accent="#3987E5"
        />
        <StatTile
          label="Average activity"
          value={`${data.stats.avgActivity}%`}
          sub="department mean"
          icon="Target"
          accent="#199E70"
        />
        <StatTile
          label="Hit the target"
          value={`${data.stats.hitTargetPct}%`}
          sub={`${data.stats.hitTarget} of ${data.stats.headcount} reached ${data.week.targetHours}h`}
          icon="CircleCheck"
          accent="#C98500"
        />
      </section>

      {/* Day strip */}
      {data.dayTotals?.length > 0 && (
        <Card className="mb-8 p-5">
          <DayStrip days={data.dayTotals} />
        </Card>
      )}

      {/* Full standings */}
      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-ink">Full standings</h2>
            <p className="mt-0.5 text-[13px] text-ink-3">
              Tap anyone&rsquo;s points to see exactly how the score was calculated.
            </p>
          </div>
        </div>

        {rest.length > 0 ? (
          <LeaderboardTable
            rows={standings}
            scoring={data.scoring ?? null}
            targetHours={data.week.targetHours}
            startAt={3}
          />
        ) : (
          <p className="text-[13px] text-ink-3">Everyone in this department is on the podium above.</p>
        )}

        <details className="mt-4">
          <summary className="cursor-pointer text-[13px] font-semibold text-ink-3 hover:text-ink-2">
            Show the podium in the table too
          </summary>
          <div className="mt-3">
            <LeaderboardTable rows={standings} scoring={data.scoring ?? null} targetHours={data.week.targetHours} />
          </div>
        </details>
      </section>

      <p className="mt-6 flex gap-2 text-[12px] leading-relaxed text-ink-3">
        <Info size={13} className="mt-0.5 shrink-0" />
        People marked &ldquo;–&rdquo; instead of a position worked fewer than the qualifying hours this week — usually
        annual leave, sickness or a part-time contract. They are shown but not ranked, rather than placed last.
      </p>
    </div>
  );
}
