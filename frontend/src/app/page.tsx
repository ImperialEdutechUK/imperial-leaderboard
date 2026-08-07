'use client';

import Link from 'next/link';
import { ArrowRight, Clock, Sparkles, TrendingUp, Trophy, Users } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Icon } from '@/lib/icons';
import { Card, EmptyState, Notice, Skeleton } from '@/components/ui';
import { StatTile } from '@/components/bits';
import { formatDate, formatDuration, formatNumber } from '@/lib/format';

interface Dept {
  id: string;
  name: string;
  slug: string;
  code: string | null;
  colour: string;
  accent: string;
  icon: string;
  targetHours: number;
  headcount: number;
  weeksPublished: number;
  latestWeek: string | null;
}

export default function HomePage() {
  const { data, loading, error } = useApi<{ departments: Dept[] }>('/api/public/departments', { auth: false });
  const summary = useApi<any>('/api/public/summary', { auth: false });

  const departments = data?.departments ?? [];
  const live = departments.filter((d) => d.weeksPublished > 0);
  const waiting = departments.filter((d) => d.weeksPublished === 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Hero */}
      <section className="mb-10">
        <div className="inline-flex items-center gap-2 rounded-pill border border-rule bg-white/[0.03] px-3 py-1 text-[11px] font-semibold text-ink-2">
          <Sparkles size={12} className="text-gold" />
          {summary.data?.latestWeek ? `Latest week: ${summary.data.latestWeek.label}` : 'Weekly productivity rankings'}
        </div>
        <h1 className="mt-4 text-[34px] font-black leading-[1.1] tracking-tight text-ink sm:text-[46px]">
          Who&rsquo;s on top
          <span className="bg-gradient-to-r from-s1 to-s7 bg-clip-text text-transparent"> this week?</span>
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">
          Every department&rsquo;s weekly leaderboard, built from the Screenshot Monitor report. Climb the table, collect
          badges, and take the monthly crown. No sign-in needed — pick your department below.
        </p>
      </section>

      {error && (
        <Notice tone="critical" title="Could not load the leaderboard" className="mb-8">
          {error.message}
        </Notice>
      )}

      {/* Company stats */}
      {summary.data && (
        <section className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Departments live"
            value={formatNumber(live.length)}
            sub={`of ${summary.data.departments} set up`}
            icon="Building2"
            accent="#3987E5"
          />
          <StatTile
            label="People tracked"
            value={formatNumber(summary.data.employees)}
            sub="across all departments"
            icon="Users"
            accent="#9085E9"
          />
          <StatTile
            label="Hours logged"
            value={`${formatNumber(Math.round(summary.data.totalSeconds / 3600))}h`}
            sub="all published weeks"
            icon="Timer"
            accent="#199E70"
          />
          <StatTile
            label="Average activity"
            value={`${summary.data.avgActivity}%`}
            sub="company-wide mean"
            icon="Target"
            accent="#C98500"
          />
        </section>
      )}

      {/* Departments */}
      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-ink">Choose your department</h2>
            <p className="mt-0.5 text-[13px] text-ink-3">Leaderboards are public — no password required.</p>
          </div>
          <Link href="/company" className="inline-flex items-center gap-1 text-[13px] font-semibold text-s1 hover:underline">
            Company table <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[126px]" />
            ))}
          </div>
        ) : departments.length === 0 ? (
          <EmptyState icon={<Trophy size={30} />} title="No departments set up yet">
            A manager needs to sign in and upload the first weekly report.
          </EmptyState>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {live.map((d) => (
                <Link
                  key={d.id}
                  href={`/d/${d.slug}`}
                  className="group relative overflow-hidden rounded-card border border-hairline bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-rule hover:shadow-lift"
                >
                  <div
                    className="absolute inset-x-0 top-0 h-[2px] opacity-70"
                    style={{ background: `linear-gradient(90deg, ${d.colour}, ${d.accent})` }}
                    aria-hidden
                  />
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `${d.colour}1F`, color: d.colour, border: `1px solid ${d.colour}44` }}
                    >
                      <Icon name={d.icon} size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[15px] font-bold text-ink group-hover:text-s1">{d.name}</h3>
                      <p className="mt-0.5 text-[12px] text-ink-3 tnum">
                        {d.headcount} {d.headcount === 1 ? 'person' : 'people'} · {d.weeksPublished}{' '}
                        {d.weeksPublished === 1 ? 'week' : 'weeks'} published
                      </p>
                    </div>
                    <ArrowRight size={16} className="mt-1 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                  </div>
                  {d.latestWeek && (
                    <p className="mt-3 border-t border-hairline pt-2.5 text-[11px] text-ink-3">
                      Latest: week of {formatDate(d.latestWeek)}
                    </p>
                  )}
                </Link>
              ))}
            </div>

            {waiting.length > 0 && (
              <div className="mt-6">
                <h3 className="label mb-2.5">Set up, waiting for their first report</h3>
                <div className="flex flex-wrap gap-2">
                  {waiting.map((d) => (
                    <span
                      key={d.id}
                      className="inline-flex items-center gap-2 rounded-pill border border-hairline bg-white/[0.02] px-3 py-1.5 text-[12.5px] text-ink-3"
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: d.colour }} aria-hidden />
                      {d.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* How it works */}
      <section className="mt-12">
        <h2 className="mb-4 text-lg font-bold tracking-tight text-ink">How the score works</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              icon: Clock,
              title: 'Half your score is hours',
              body: 'Measured against your department’s weekly target. Credit is capped just above target, so nobody can win by working themselves into the ground.',
            },
            {
              icon: TrendingUp,
              title: 'Half is activity',
              body: 'Screenshot Monitor’s activity percentage for your tracked time. It measures keyboard and mouse input, so focused hands-on work scores highest.',
            },
            {
              icon: Trophy,
              title: 'Bonuses and badges on top',
              body: 'Hitting target, beating your own record and high-activity weeks all earn bonus points. Badges recognise streaks, comebacks and podium finishes.',
            },
          ].map((c) => (
            <Card key={c.title} className="p-4">
              <c.icon size={18} className="text-s1" aria-hidden />
              <h3 className="mt-2.5 text-[14px] font-bold text-ink">{c.title}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">{c.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
