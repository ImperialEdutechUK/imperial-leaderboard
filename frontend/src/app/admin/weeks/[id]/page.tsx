'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle, ChevronLeft, ExternalLink, Eye, EyeOff, Info, RefreshCw, Trash2,
} from 'lucide-react';
import { api, ApiError, useApi } from '@/lib/api';
import { Button, Card, Field, Input, Modal, Notice, Skeleton } from '@/components/ui';
import { Avatar, Meter, RankBadge, RankDelta, StatTile } from '@/components/bits';
import { DayStrip } from '@/components/charts';
import { cx, formatPoints } from '@/lib/format';

export default function WeekDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, loading, refresh } = useApi<any>(`/api/weeks/${params.id}`, { deps: [params.id] });

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editRow, setEditRow] = useState<any>(null);
  const [editHours, setEditHours] = useState('');
  const [editActivity, setEditActivity] = useState('');

  async function act(label: string, fn: () => Promise<any>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-[420px]" />
      </div>
    );
  }

  if (!data?.week) {
    return (
      <div className="mx-auto max-w-5xl">
        <Notice tone="critical" title="Week not found" />
      </div>
    );
  }

  const w = data.week;
  const dept = data.department;
  const warnings = (w.parseWarnings ?? []).filter((x: any) => x.level !== 'info');
  const published = w.status === 'PUBLISHED';

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/weeks" className="mb-4 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-ink">
        <ChevronLeft size={15} /> All weeks
      </Link>

      {error && (
        <Notice tone="critical" className="mb-4" onDismiss={() => setError(null)}>
          {error}
        </Notice>
      )}

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-black tracking-tight text-ink">{w.label}</h1>
            <span
              className={cx(
                'rounded-pill border px-2.5 py-0.5 text-[10.5px] font-bold',
                published ? 'border-good/35 bg-good/10 text-good' : 'border-warning/35 bg-warning/10 text-warning',
              )}
            >
              {w.status}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-ink-3">
            {dept.name} · target {w.targetHours}h · {data.stats.headcount} people
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {published && (
            <Link href={`/d/${dept.slug}?week=${w.startDate}`} target="_blank">
              <Button variant="secondary" size="sm" icon={<ExternalLink size={14} />}>
                View public page
              </Button>
            </Link>
          )}
          <Button
            variant={published ? 'secondary' : 'gold'}
            size="sm"
            loading={busy === 'publish'}
            icon={published ? <EyeOff size={14} /> : <Eye size={14} />}
            onClick={() =>
              act('publish', () =>
                api(`/api/weeks/${w.id}`, {
                  method: 'PATCH',
                  body: { status: published ? 'DRAFT' : 'PUBLISHED' },
                }),
              )
            }
          >
            {published ? 'Unpublish' : 'Publish'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={busy === 'recalc'}
            icon={<RefreshCw size={14} />}
            onClick={() => act('recalc', () => api(`/api/weeks/${w.id}/recalculate`, { method: 'POST' }))}
          >
            Recalculate
          </Button>
          <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        </div>
      </div>

      {!published && (
        <Notice tone="warning" title="This week is a draft" className="mb-5">
          Nobody outside the manager console can see it. Press Publish when you are happy with the numbers.
        </Notice>
      )}

      {warnings.map((x: any, i: number) => (
        <Notice key={i} tone="warning" title="Parse warning" className="mb-4">
          {x.message}
        </Notice>
      ))}

      {data.stats.hoursNotice && (
        <Notice tone="info" title="Your target may be set too low" className="mb-5">
          {data.stats.hoursNotice}{' '}
          <Link href="/admin/scoring" className="font-semibold text-ink underline">
            Adjust scoring
          </Link>
        </Notice>
      )}

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total hours" value={data.stats.totalHoursLabel} sub={`${data.stats.avgHours}h each`} icon="Timer" accent="#3987E5" />
        <StatTile label="Avg activity" value={`${data.stats.avgActivity}%`} sub="department mean" icon="Target" accent="#199E70" />
        <StatTile
          label="Hit target"
          value={`${data.stats.hitTargetPct}%`}
          sub={`${data.stats.hitTarget} of ${data.stats.headcount}`}
          icon="CircleCheck"
          accent="#C98500"
        />
        <StatTile label="Top score" value={formatPoints(data.stats.topPoints)} sub="best of the week" icon="Crown" accent="#F4B740" />
      </section>

      {data.dayTotals?.length > 0 && (
        <Card className="mb-6 p-5">
          <DayStrip days={data.dayTotals} />
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-hairline px-5 py-3.5">
          <h2 className="text-[15px] font-bold text-ink">Standings</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-3">Click a row to correct a bad reading. The week re-scores automatically.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="px-4 py-2.5 label">#</th>
                <th className="px-2 py-2.5 label">Person</th>
                <th className="px-2 py-2.5 label text-right">Hours</th>
                <th className="px-2 py-2.5 label">Activity</th>
                <th className="px-2 py-2.5 label text-right">Points</th>
                <th className="px-4 py-2.5 label">Flags</th>
              </tr>
            </thead>
            <tbody>
              {data.standings.map((s: any) => (
                <tr
                  key={s.employee.id}
                  className="cursor-pointer border-b border-hairline/60 last:border-0 hover:bg-white/[0.025]"
                  onClick={() => {
                    setEditRow(s);
                    setEditHours(String(s.hours));
                    setEditActivity(String(s.activityPct));
                  }}
                >
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <RankBadge rank={s.rank} size={26} />
                      <RankDelta delta={s.rankDelta} isNew={s.previousRank === null} />
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <Avatar name={s.employee.name} initials={s.employee.initials} colour={s.employee.colour} size={26} />
                      <span className="font-semibold text-ink">{s.employee.name}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right text-ink-2 tnum">{s.durationLabel}</td>
                  <td className="px-2 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="w-9 text-right text-ink-2 tnum">{s.activityPct}%</span>
                      <span className="w-16">
                        <Meter value={s.activityPct} max={100} colour="#199E70" height={5} />
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right font-bold text-ink tnum">{formatPoints(s.points)}</td>
                  <td className="px-4 py-2.5">
                    {(s.flags ?? []).length === 0 ? (
                      <span className="text-ink-3">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {(s.flags ?? []).map((f: any, i: number) => (
                          <span
                            key={i}
                            title={f.message}
                            className={cx(
                              'inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[10px] font-bold',
                              f.severity === 'warning'
                                ? 'border-warning/35 bg-warning/10 text-warning'
                                : 'border-rule text-ink-3',
                            )}
                          >
                            {f.severity === 'warning' ? <AlertTriangle size={9} /> : <Info size={9} />}
                            {f.type.replace(/_/g, ' ').toLowerCase()}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit a row */}
      <Modal
        open={!!editRow}
        onClose={() => setEditRow(null)}
        title={editRow ? `Correct ${editRow.employee.name}'s week` : ''}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditRow(null)}>
              Cancel
            </Button>
            <Button
              loading={busy === 'edit'}
              onClick={() =>
                act('edit', async () => {
                  await api(`/api/weeks/${w.id}/stats/${editRow.statId ?? ''}`, {
                    method: 'PATCH',
                    body: {
                      seconds: Math.round(Number(editHours) * 3600),
                      activityPct: Number(editActivity),
                    },
                  });
                  setEditRow(null);
                })
              }
            >
              Save and re-score
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Notice tone="info">
            Only change these if the source report itself was wrong or the parse misread it. Every edit re-scores the
            whole week, which can change other people&rsquo;s positions.
          </Notice>
          <Field label="Hours worked" hint="Decimal hours, e.g. 33.5">
            <Input type="number" step="0.01" min="0" value={editHours} onChange={(e) => setEditHours(e.target.value)} />
          </Field>
          <Field label="Activity %" hint="0 to 100">
            <Input type="number" step="1" min="0" max="100" value={editActivity} onChange={(e) => setEditActivity(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this week?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={busy === 'delete'}
              onClick={() =>
                act('delete', async () => {
                  await api(`/api/weeks/${w.id}`, { method: 'DELETE' });
                  router.push('/admin/weeks');
                })
              }
            >
              Delete permanently
            </Button>
          </div>
        }
      >
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          This removes {w.label} for {dept.name} along with all {data.stats.headcount} results and the badges awarded
          that week. People&rsquo;s lifetime totals will drop accordingly. This cannot be undone — you would need to
          re-upload the report.
        </p>
      </Modal>
    </div>
  );
}
