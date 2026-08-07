'use client';

import Link from 'next/link';
import { Building2, Info } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Icon } from '@/lib/icons';
import { Card, EmptyState, Notice, Skeleton } from '@/components/ui';
import { Avatar, RankBadge, StatTile } from '@/components/bits';
import { RankedBars } from '@/components/charts';
import { formatNumber, formatPoints } from '@/lib/format';

export default function CompanyPage() {
  const { data, loading, error } = useApi<any>('/api/public/company', { auth: false });

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-10">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-[420px]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Notice tone="critical" title="Could not load the company table">
          {error.message}
        </Notice>
      </div>
    );
  }

  const withData = (data?.departments ?? []).filter((d: any) => d.hasData);
  const without = (data?.departments ?? []).filter((d: any) => !d.hasData);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-7">
        <div className="inline-flex items-center gap-2 rounded-pill border border-rule bg-white/[0.03] px-3 py-1 text-[11px] font-semibold text-ink-2">
          <Building2 size={12} /> Department vs department
        </div>
        <h1 className="mt-3 text-[28px] font-black leading-tight tracking-tight text-ink">The company table</h1>
        <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">
          Departments are ranked by <strong className="text-ink">average points per person</strong>, not by total, so a
          large department cannot out-score a small one just by having more people in it.
        </p>
        {data?.week && <p className="mt-1 text-[12.5px] text-ink-3">Week of {data.week.label}</p>}
      </div>

      {withData.length === 0 ? (
        <EmptyState icon={<Building2 size={30} />} title="No departments have published this week yet">
          The company table fills in as each department publishes its weekly report.
        </EmptyState>
      ) : (
        <>
          <section className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Reporting"
              value={`${data.company.departmentsReporting}/${data.company.departmentsTotal}`}
              sub="departments this week"
              icon="Building2"
              accent="#3987E5"
            />
            <StatTile label="People" value={formatNumber(data.company.headcount)} sub="tracked this week" icon="Users" accent="#9085E9" />
            <StatTile label="Hours" value={data.company.totalHoursLabel} sub="company total" icon="Timer" accent="#199E70" />
            <StatTile label="Activity" value={`${data.company.avgActivity}%`} sub="weighted mean" icon="Target" accent="#C98500" />
          </section>

          <Card className="mb-6 p-5">
            <RankedBars
              title="Average points per person"
              subtitle="Higher is better — the fair way to compare departments of different sizes"
              rows={withData.map((d: any) => ({
                key: d.department.id,
                label: d.department.name,
                value: d.avgPoints,
                dotColour: d.department.colour,
                sub: `${d.headcount} people · ${d.avgActivity}% avg activity · ${d.hitTargetPct}% hit target`,
              }))}
              unit=" pts"
            />
          </Card>

          <div className="overflow-x-auto rounded-card border border-hairline bg-surface">
            <table className="w-full min-w-[680px] text-[13px]">
              <thead>
                <tr className="border-b border-hairline text-left">
                  <th className="px-4 py-2.5 label">#</th>
                  <th className="px-2 py-2.5 label">Department</th>
                  <th className="px-2 py-2.5 label text-right">People</th>
                  <th className="px-2 py-2.5 label text-right">Avg points</th>
                  <th className="px-2 py-2.5 label text-right">Avg activity</th>
                  <th className="px-2 py-2.5 label text-right">Hit target</th>
                  <th className="px-4 py-2.5 label">Top performer</th>
                </tr>
              </thead>
              <tbody>
                {withData.map((d: any) => (
                  <tr key={d.department.id} className="border-b border-hairline/60 last:border-0 hover:bg-white/[0.025]">
                    <td className="px-4 py-3">
                      <RankBadge rank={d.rank} size={28} />
                    </td>
                    <td className="px-2 py-3">
                      <Link href={`/d/${d.department.slug}`} className="flex items-center gap-2.5 font-semibold text-ink hover:text-s1">
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                          style={{ background: `${d.department.colour}1F`, color: d.department.colour }}
                        >
                          <Icon name={d.department.icon} size={14} />
                        </span>
                        {d.department.name}
                      </Link>
                    </td>
                    <td className="px-2 py-3 text-right text-ink-2 tnum">{d.headcount}</td>
                    <td className="px-2 py-3 text-right text-[15px] font-bold text-ink tnum">{formatPoints(d.avgPoints)}</td>
                    <td className="px-2 py-3 text-right text-ink-2 tnum">{d.avgActivity}%</td>
                    <td className="px-2 py-3 text-right text-ink-2 tnum">{d.hitTargetPct}%</td>
                    <td className="px-4 py-3">
                      {d.champion ? (
                        <Link href={`/p/${d.champion.slug}`} className="flex items-center gap-2 text-ink-2 hover:text-ink">
                          <Avatar name={d.champion.name} initials={d.champion.initials} colour={d.champion.colour} size={24} />
                          <span className="truncate text-[12.5px]">{d.champion.name}</span>
                        </Link>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {without.length > 0 && (
            <div className="mt-5">
              <h3 className="label mb-2.5">No report published for this week</h3>
              <div className="flex flex-wrap gap-2">
                {without.map((d: any) => (
                  <Link
                    key={d.department.id}
                    href={`/d/${d.department.slug}`}
                    className="inline-flex items-center gap-2 rounded-pill border border-hairline bg-white/[0.02] px-3 py-1.5 text-[12.5px] text-ink-3 hover:text-ink-2"
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: d.department.colour }} aria-hidden />
                    {d.department.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <p className="mt-6 flex gap-2 text-[12px] leading-relaxed text-ink-3">
            <Info size={13} className="mt-0.5 shrink-0" />
            Departments do different kinds of work, and activity % is sensitive to that — a role built around meetings or
            phone calls will read lower than one built around editing, whatever the quality of the work. Treat this table
            as a conversation starter between managers, not as a ranking of who works hardest.
          </p>
        </>
      )}
    </div>
  );
}
