'use client';

import Link from 'next/link';
import { Crown, Trophy } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card, EmptyState, Skeleton } from '@/components/ui';
import { Avatar, RankBadge } from '@/components/bits';
import { formatDate, formatPoints, medalFor } from '@/lib/format';

export default function HallOfFamePage() {
  const { data, loading } = useApi<any>('/api/public/hall-of-fame', { auth: false });

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-10">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  const champions = data?.champions ?? [];
  const allTime = data?.allTime ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-pill border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-gold">
          <Crown size={12} /> Hall of Fame
        </div>
        <h1 className="mt-3 text-[28px] font-black leading-tight tracking-tight text-ink">Champions and records</h1>
        <p className="mt-1.5 text-[13.5px] text-ink-2">Every monthly winner, and the all-time points table.</p>
      </div>

      {/* Champions */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-bold tracking-tight text-ink">Monthly champions</h2>
        {champions.length === 0 ? (
          <EmptyState icon={<Trophy size={28} />} title="No champions crowned yet">
            At the end of each month a manager confirms the winner, and they appear here permanently.
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {champions.map((c: any) => (
              <Card key={c.id} className="overflow-hidden">
                <div className="flex items-center gap-3.5 p-4" style={{ background: 'linear-gradient(100deg, rgba(244,183,64,0.09), transparent 65%)' }}>
                  {c.employee && (
                    <Avatar name={c.employee.name} initials={c.employee.initials} colour={c.employee.colour} size={46} ring="#F4B740" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-gold">{c.periodLabel}</div>
                    {c.employee ? (
                      <Link href={`/p/${c.employee.slug}`} className="block truncate text-[15px] font-bold text-ink hover:text-s1">
                        {c.employee.name}
                      </Link>
                    ) : (
                      <span className="text-[15px] font-bold text-ink-3">Not yet awarded</span>
                    )}
                    <p className="mt-0.5 truncate text-[11.5px] text-ink-3">
                      {c.department?.name}
                      {c.pointsTotal ? ` · ${formatPoints(c.pointsTotal)} pts` : ''}
                    </p>
                  </div>
                </div>
                {c.reward && (
                  <div className="border-t border-hairline px-4 py-2.5 text-[12px] text-ink-2">
                    Prize: <strong className="text-ink">{c.reward}</strong>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* All time */}
      <section>
        <h2 className="mb-1 text-lg font-bold tracking-tight text-ink">All-time points</h2>
        <p className="mb-4 text-[13px] text-ink-3">
          Total points across every published week. People who have been tracked longer will naturally sit higher.
        </p>

        {allTime.length === 0 ? (
          <EmptyState icon={<Trophy size={28} />} title="No published weeks yet" />
        ) : (
          <div className="overflow-x-auto rounded-card border border-hairline bg-surface">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="border-b border-hairline text-left">
                  <th className="px-4 py-2.5 label">#</th>
                  <th className="px-2 py-2.5 label">Team member</th>
                  <th className="px-2 py-2.5 label">Department</th>
                  <th className="px-2 py-2.5 label text-right">Level</th>
                  <th className="px-2 py-2.5 label text-right">Weeks</th>
                  <th className="px-4 py-2.5 label text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {allTime.map((r: any) => (
                  <tr key={r.employee.id} className="border-b border-hairline-strong last:border-0 hover:bg-ink/[0.025]">
                    <td className="px-4 py-2.5">
                      <RankBadge rank={r.rank} size={28} />
                    </td>
                    <td className="px-2 py-2.5">
                      <Link href={`/p/${r.employee.slug}`} className="flex items-center gap-2.5 font-semibold text-ink hover:text-s1">
                        <Avatar name={r.employee.name} initials={r.employee.initials} colour={r.employee.colour} size={28} />
                        <span className="truncate">{r.employee.name}</span>
                      </Link>
                    </td>
                    <td className="px-2 py-2.5">
                      <Link href={`/d/${r.employee.department.slug}`} className="flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink-2">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: r.employee.department.colour }} aria-hidden />
                        {r.employee.department.name}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5 text-right text-[12px] text-ink-2 tnum">
                      {r.level.level} · {r.level.title}
                    </td>
                    <td className="px-2 py-2.5 text-right text-ink-2 tnum">{r.weeks}</td>
                    <td className="px-4 py-2.5 text-right text-[15px] font-bold text-ink tnum">{formatPoints(r.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
