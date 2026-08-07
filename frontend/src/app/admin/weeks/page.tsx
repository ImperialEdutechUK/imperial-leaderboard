'use client';

import Link from 'next/link';
import { AlertTriangle, Upload } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Button, Card, EmptyState, Skeleton } from '@/components/ui';
import { formatDate, relativeTime } from '@/lib/format';

const STATUS_STYLE: Record<string, string> = {
  PUBLISHED: 'border-good/35 bg-good/10 text-good',
  DRAFT: 'border-warning/35 bg-warning/10 text-warning',
  ARCHIVED: 'border-rule text-ink-3',
};

export default function WeeksPage() {
  const { data, loading } = useApi<any>('/api/weeks?limit=200');
  const weeks = data?.weeks ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-black tracking-tight text-ink">Weeks</h1>
          <p className="mt-1 text-[13.5px] text-ink-3">Every week you have imported, newest first.</p>
        </div>
        <Link href="/admin/upload">
          <Button icon={<Upload size={15} />}>Upload a week</Button>
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : weeks.length === 0 ? (
        <EmptyState
          title="No weeks imported yet"
          action={
            <Link href="/admin/upload">
              <Button icon={<Upload size={15} />}>Upload your first week</Button>
            </Link>
          }
        >
          Drop in the Screenshot Monitor report and the leaderboard builds itself.
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <ul>
            {weeks.map((w: any) => (
              <li key={w.id} className="border-b border-hairline/60 last:border-0">
                <Link href={`/admin/weeks/${w.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3.5 hover:bg-white/[0.025]">
                  <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: w.department.colour }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-bold text-ink">{w.label}</span>
                      {w.hasWarnings && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning">
                          <AlertTriangle size={11} /> Parse warnings
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-ink-3 tnum">
                      {w.department.name} · {w.rowCount} people · from {w.sourceType}
                      {w.uploadedBy ? ` · ${w.uploadedBy.name}` : ''} · {relativeTime(w.createdAt)}
                    </div>
                    {w.note && <div className="mt-1 text-[11.5px] italic text-ink-3">{w.note}</div>}
                  </div>
                  <span className={`shrink-0 rounded-pill border px-2.5 py-0.5 text-[10.5px] font-bold ${STATUS_STYLE[w.status]}`}>
                    {w.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
