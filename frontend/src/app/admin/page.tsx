'use client';

import Link from 'next/link';
import { ArrowRight, CalendarRange, Gift, Sparkles, Trophy, Upload, Users } from 'lucide-react';
import { useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Notice, Skeleton } from '@/components/ui';
import { StatTile } from '@/components/bits';
import { formatDate, mondayOf, relativeTime } from '@/lib/format';

export default function AdminDashboard() {
  const { user } = useAuth();
  const weeks = useApi<any>('/api/weeks?limit=8');
  const departments = useApi<any>('/api/departments');

  const list = weeks.data?.weeks ?? [];
  const drafts = list.filter((w: any) => w.status === 'DRAFT');
  const latest = list[0];

  // Which Monday should have been uploaded by now?
  const lastMonday = mondayOf(new Date(Date.now() - 7 * 86400000));
  const hasLastWeek = list.some((w: any) => w.startDate === lastMonday);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-black tracking-tight text-ink">
            Hello, {user?.name?.split(' ')[0]}
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-3">
            {user?.role === 'ADMIN'
              ? 'You can manage every department.'
              : `You manage ${user?.department?.name ?? 'your department'}.`}
          </p>
        </div>
        <Link href="/admin/upload">
          <Button size="lg" icon={<Upload size={16} />}>
            Upload this week
          </Button>
        </Link>
      </div>

      {user?.mustChangePassword && (
        <Notice tone="warning" title="Change your password" className="mb-5">
          You are still using the password you were given.{' '}
          <Link href="/admin/account" className="font-semibold text-ink underline">
            Set a new one now
          </Link>
          .
        </Notice>
      )}

      {!weeks.loading && !hasLastWeek && list.length > 0 && (
        <Notice tone="info" title="Last week has not been uploaded" className="mb-5">
          There is no week starting {formatDate(lastMonday)} yet.{' '}
          <Link href="/admin/upload" className="font-semibold text-ink underline">
            Upload it
          </Link>
          .
        </Notice>
      )}

      {drafts.length > 0 && (
        <Notice tone="warning" title={`${drafts.length} week${drafts.length > 1 ? 's are' : ' is'} still a draft`} className="mb-5">
          Drafts are invisible to employees until you publish them.
          <div className="mt-2 flex flex-wrap gap-2">
            {drafts.map((d: any) => (
              <Link
                key={d.id}
                href={`/admin/weeks/${d.id}`}
                className="rounded-lg border border-rule px-2.5 py-1 text-[12px] font-semibold text-ink hover:bg-white/5"
              >
                {d.department.name} · {d.label}
              </Link>
            ))}
          </div>
        </Notice>
      )}

      <section className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Weeks stored"
          value={weeks.loading ? '—' : list.length}
          sub={`${drafts.length} draft${drafts.length === 1 ? '' : 's'}`}
          icon="CalendarCheck"
          accent="#3987E5"
        />
        <StatTile
          label="Departments"
          value={departments.loading ? '—' : departments.data?.departments?.length ?? 0}
          sub="you can manage"
          icon="Building2"
          accent="#9085E9"
        />
        <StatTile
          label="Latest week"
          value={latest ? latest.label.split(' ').slice(0, 3).join(' ') : '—'}
          sub={latest ? `${latest.rowCount} people` : 'nothing uploaded yet'}
          icon="Timer"
          accent="#199E70"
        />
        <StatTile
          label="Last upload"
          value={latest ? relativeTime(latest.createdAt) : '—'}
          sub={latest?.uploadedBy?.name ?? ''}
          icon="Sparkles"
          accent="#C98500"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
            <h2 className="text-[15px] font-bold text-ink">Recent weeks</h2>
            <Link href="/admin/weeks" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-s1 hover:underline">
              See all <ArrowRight size={13} />
            </Link>
          </div>

          {weeks.loading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-11" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Trophy size={26} className="mx-auto mb-3 text-ink-3" />
              <p className="text-[14px] font-semibold text-ink">No weeks yet</p>
              <p className="mt-1 text-[12.5px] text-ink-3">Upload your first Screenshot Monitor report to get started.</p>
              <Link href="/admin/upload">
                <Button className="mt-4" icon={<Upload size={15} />}>
                  Upload a week
                </Button>
              </Link>
            </div>
          ) : (
            <ul>
              {list.map((w: any) => (
                <li key={w.id} className="border-b border-hairline/60 last:border-0">
                  <Link href={`/admin/weeks/${w.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.025]">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: w.department.colour }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-ink">{w.label}</div>
                      <div className="text-[11.5px] text-ink-3 tnum">
                        {w.department.name} · {w.rowCount} people · {w.sourceType}
                      </div>
                    </div>
                    <span
                      className={
                        w.status === 'PUBLISHED'
                          ? 'rounded-pill border border-good/35 bg-good/10 px-2.5 py-0.5 text-[10.5px] font-bold text-good'
                          : w.status === 'DRAFT'
                            ? 'rounded-pill border border-warning/35 bg-warning/10 px-2.5 py-0.5 text-[10.5px] font-bold text-warning'
                            : 'rounded-pill border border-rule px-2.5 py-0.5 text-[10.5px] font-bold text-ink-3'
                      }
                    >
                      {w.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-[15px] font-bold text-ink">Quick actions</h2>
          <div className="space-y-2">
            {[
              { href: '/admin/upload', icon: Upload, label: 'Upload a week', desc: 'PDF, CSV or Excel' },
              { href: '/admin/prizes', icon: Gift, label: 'Award a monthly prize', desc: 'Crown a champion' },
              { href: '/admin/roster', icon: Users, label: 'Manage the roster', desc: 'Names, aliases, merges' },
              { href: '/admin/scoring', icon: Sparkles, label: 'Tune the scoring', desc: 'Weights and targets' },
            ].map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex items-center gap-3 rounded-xl border border-hairline p-3 transition-colors hover:border-rule hover:bg-white/[0.03]"
              >
                <a.icon size={16} className="shrink-0 text-s1" />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-ink">{a.label}</div>
                  <div className="text-[11.5px] text-ink-3">{a.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
