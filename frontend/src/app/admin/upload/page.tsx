'use client';

/**
 * The screen that has to work every Monday morning.
 *
 * Flow: choose a file → we parse it and show EXACTLY what we read → the manager
 * fixes any name that did not match → publish. Nothing is written to the
 * database until "Import" is pressed, and even then the week lands as a draft
 * unless "publish immediately" is ticked.
 */

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, Info, Sparkles, Upload, UserPlus, X,
} from 'lucide-react';
import { api, ApiError, API_URL, getToken, useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Field, Input, Notice, Select, Spinner } from '@/components/ui';
import { Avatar } from '@/components/bits';
import { cx, formatDuration, formatPoints, mondayOf } from '@/lib/format';

interface PreviewRow {
  rawName: string;
  cleanName: string;
  employeeId: string | null;
  matchedName: string | null;
  matchMethod: 'ALIAS' | 'EXACT' | 'FUZZY' | 'NONE';
  confidence: number;
  suggestions: { employeeId: string; fullName: string; confidence: number }[];
  isNew: boolean;
  seconds: number;
  hours: number;
  activityPct: number;
  projectedPoints: number;
  projectedRank: number;
  qualified: boolean;
  flags: any[];
}

const METHOD_LABEL: Record<string, { text: string; tone: string }> = {
  ALIAS: { text: 'Matched', tone: 'text-good' },
  EXACT: { text: 'Matched', tone: 'text-good' },
  FUZZY: { text: 'Close match — check', tone: 'text-warning' },
  NONE: { text: 'New person', tone: 'text-s1' },
};

export default function UploadPage() {
  const router = useRouter();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const departments = useApi<any>('/api/departments');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Manager-editable fields
  const [departmentId, setDepartmentId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [targetOverride, setTargetOverride] = useState('');
  const [note, setNote] = useState('');
  const [publishNow, setPublishNow] = useState(false);
  const [replace, setReplace] = useState(false);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [committing, setCommitting] = useState(false);

  const roster = useApi<any>(departmentId ? `/api/employees?departmentId=${departmentId}` : null, {
    deps: [departmentId],
  });

  const doPreview = useCallback(
    async (f: File, overrides: { departmentId?: string; startDate?: string } = {}) => {
      setParsing(true);
      setError(null);
      try {
        const fd = new FormData();
        fd.append('file', f);
        if (overrides.departmentId) fd.append('departmentId', overrides.departmentId);
        if (overrides.startDate) fd.append('startDate', overrides.startDate);

        const res = await fetch(`${API_URL}/api/imports/preview`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken()}` },
          body: fd,
        });
        const payload = await res.json();
        if (!res.ok) throw new ApiError(res.status, payload?.error?.code ?? 'ERROR', payload?.error?.message ?? 'Upload failed');

        setPreview(payload);
        setRows(payload.rows);
        setDepartmentId(payload.department?.id ?? overrides.departmentId ?? user?.department?.id ?? '');
        setStartDate(payload.parse.startDate ?? '');
        setReplace(false);
        setNote('');
        setTargetOverride('');
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not read that file.');
        setPreview(null);
      } finally {
        setParsing(false);
      }
    },
    [user?.department?.id],
  );

  function onFile(f: File | null) {
    if (!f) return;
    setFile(f);
    doPreview(f);
  }

  async function commit() {
    if (!departmentId || !startDate) {
      setError('Choose a department and the week start date before importing.');
      return;
    }
    setCommitting(true);
    setError(null);
    try {
      const result = await api<any>('/api/imports/commit', {
        method: 'POST',
        body: {
          departmentId,
          startDate: mondayOf(new Date(`${startDate}T00:00:00Z`)),
          sourceType: preview?.parse?.source ?? 'MANUAL',
          sourceFile: file?.name ?? null,
          targetHoursOverride: targetOverride ? Number(targetOverride) : null,
          note: note || null,
          replace,
          publishImmediately: publishNow,
          printedTotalSeconds: preview?.parse?.printedTotalSeconds ?? null,
          printedAvgActivity: preview?.parse?.printedAvgActivity ?? null,
          parseWarnings: preview?.parse?.warnings ?? null,
          dayTotals: preview?.dayTotals ?? [],
          rows: rows.map((r) => ({
            rawName: r.rawName,
            seconds: r.seconds,
            activityPct: r.activityPct,
            employeeId: r.employeeId,
            createAs: r.employeeId ? null : r.cleanName,
            skip: (r as any).skip ?? false,
          })),
        },
      });
      router.push(`/admin/weeks/${result.weekId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Import failed.');
      if (e instanceof ApiError && e.code === 'CONFLICT') setReplace(true);
    } finally {
      setCommitting(false);
    }
  }

  const unmatched = rows.filter((r) => r.matchMethod === 'NONE').length;
  const fuzzy = rows.filter((r) => r.matchMethod === 'FUZZY').length;
  const warnings = (preview?.parse?.warnings ?? []).filter((w: any) => w.level !== 'info');
  const infos = (preview?.parse?.warnings ?? []).filter((w: any) => w.level === 'info');

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-[24px] font-black tracking-tight text-ink">Upload a week</h1>
        <p className="mt-1 text-[13.5px] text-ink-3">
          Drop in the Screenshot Monitor report. Nothing is saved until you press Import.
        </p>
      </div>

      {error && (
        <Notice tone="critical" title="Problem" className="mb-5" onDismiss={() => setError(null)}>
          {error}
        </Notice>
      )}

      {/* ── Dropzone ─────────────────────────────────────────────────────── */}
      {!preview && (
        <Card
          className={cx(
            'flex flex-col items-center justify-center border-2 border-dashed px-6 py-16 text-center transition-colors',
            dragging ? 'border-s1 bg-s1/5' : 'border-rule',
          )}
          onDragOver={(e: any) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e: any) => {
            e.preventDefault();
            setDragging(false);
            onFile(e.dataTransfer?.files?.[0] ?? null);
          }}
        >
          {parsing ? (
            <>
              <Spinner className="mb-3 h-6 w-6" />
              <p className="text-[14px] font-semibold text-ink">Reading your report…</p>
              <p className="mt-1 text-[12.5px] text-ink-3">Extracting names, hours and activity.</p>
            </>
          ) : (
            <>
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-s1/12 text-s1">
                <Upload size={24} />
              </span>
              <h2 className="text-[16px] font-bold text-ink">Drop your weekly report here</h2>
              <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-ink-3">
                PDF, CSV, or Excel. We read the &ldquo;Employee / Duration / Activity&rdquo; table and check our totals
                against the ones printed on the report.
              </p>
              <div className="mt-5 flex gap-2">
                <Button onClick={() => fileRef.current?.click()} icon={<FileText size={15} />}>
                  Choose a file
                </Button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.csv,.tsv,.xlsx,.xls,.xlsm"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
              <p className="mt-4 text-[11.5px] text-ink-3">
                Or{' '}
                <button onClick={() => router.push('/admin/weeks')} className="underline hover:text-ink-2">
                  type a week in by hand
                </button>
              </p>
            </>
          )}
        </Card>
      )}

      {/* ── Preview ──────────────────────────────────────────────────────── */}
      {preview && (
        <div className="space-y-5">
          {/* File header */}
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-s1/12 text-s1">
              {preview.parse.source === 'PDF' ? <FileText size={18} /> : <FileSpreadsheet size={18} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-bold text-ink">{file?.name}</div>
              <div className="text-[12px] text-ink-3 tnum">
                {preview.summary.rowCount} people · {formatDuration(preview.summary.totalSeconds)} total ·{' '}
                {preview.summary.avgActivity}% average activity
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPreview(null);
                setFile(null);
                setRows([]);
              }}
              icon={<X size={14} />}
            >
              Start again
            </Button>
          </Card>

          {/* Parse feedback */}
          {infos.map((w: any, i: number) => (
            <Notice key={`i${i}`} tone="good" className="!py-2.5">
              {w.message}
            </Notice>
          ))}
          {warnings.map((w: any, i: number) => (
            <Notice key={`w${i}`} tone="warning" title="Check this before importing">
              {w.message}
            </Notice>
          ))}

          {/* Week settings */}
          <Card className="p-5">
            <h2 className="mb-4 text-[15px] font-bold text-ink">Week details</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Department" hint={preview.parse.inferredDepartmentCode ? `Detected code: ${preview.parse.inferredDepartmentCode}` : 'Not detected — choose one'}>
                <Select
                  value={departmentId}
                  onChange={(e) => {
                    setDepartmentId(e.target.value);
                    if (file) doPreview(file, { departmentId: e.target.value, startDate });
                  }}
                >
                  <option value="">Choose…</option>
                  {(departments.data?.departments ?? []).map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Week starting (Monday)" hint="Snapped to the Monday of that week">
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>

              <Field
                label="Target hours override"
                hint="Leave blank for the department default. Reduce it for bank-holiday weeks."
              >
                <Input
                  type="number"
                  min={1}
                  max={100}
                  step={0.5}
                  placeholder={String(preview.scoring?.targetHours ?? 35)}
                  value={targetOverride}
                  onChange={(e) => setTargetOverride(e.target.value)}
                />
              </Field>

              <Field label="Note shown on the leaderboard" hint="Optional — e.g. why the target is different">
                <Input
                  placeholder="Easter Monday — 4-day week"
                  maxLength={280}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
            </div>

            {preview.weekExists && (
              <Notice tone="warning" title="This week already exists" className="mt-4">
                A week starting {startDate} is already saved for this department (currently{' '}
                {String(preview.existingWeekStatus).toLowerCase()}).
                <label className="mt-2 flex cursor-pointer items-center gap-2 font-semibold text-ink">
                  <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="accent-s1" />
                  Replace it with this upload
                </label>
              </Notice>
            )}
          </Card>

          {/* Name matching */}
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
              <div>
                <h2 className="text-[15px] font-bold text-ink">Check the people</h2>
                <p className="mt-0.5 text-[12.5px] text-ink-3">
                  {preview.summary.matched} matched automatically
                  {fuzzy > 0 && ` · ${fuzzy} close match${fuzzy > 1 ? 'es' : ''} to confirm`}
                  {unmatched > 0 && ` · ${unmatched} new`}
                </p>
              </div>
              {unmatched === 0 && fuzzy === 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-pill border border-good/35 bg-good/10 px-3 py-1 text-[11.5px] font-bold text-good">
                  <CheckCircle2 size={13} /> Everyone recognised
                </span>
              )}
            </div>

            <div className="max-h-[520px] overflow-y-auto">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-hairline text-left">
                    <th className="px-4 py-2.5 label">Name in the report</th>
                    <th className="px-2 py-2.5 label">Links to</th>
                    <th className="px-2 py-2.5 label text-right">Hours</th>
                    <th className="px-2 py-2.5 label text-right">Activity</th>
                    <th className="px-4 py-2.5 label text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const m = METHOD_LABEL[r.matchMethod];
                    return (
                      <tr
                        key={i}
                        className={cx(
                          'border-b border-hairline/60 last:border-0',
                          r.matchMethod === 'FUZZY' && 'bg-warning/[0.04]',
                          r.matchMethod === 'NONE' && 'bg-s1/[0.04]',
                        )}
                      >
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-ink">{r.cleanName}</div>
                          <div className={cx('text-[11px] font-semibold', m.tone)}>
                            {m.text}
                            {r.matchMethod === 'FUZZY' && ` (${Math.round(r.confidence * 100)}%)`}
                          </div>
                        </td>

                        <td className="px-2 py-2.5">
                          <Select
                            value={r.employeeId ?? '__new__'}
                            onChange={(e) => {
                              const v = e.target.value;
                              setRows((prev) =>
                                prev.map((row, idx) =>
                                  idx === i
                                    ? {
                                        ...row,
                                        employeeId: v === '__new__' ? null : v,
                                        matchMethod: v === '__new__' ? 'NONE' : 'EXACT',
                                        matchedName:
                                          v === '__new__'
                                            ? null
                                            : (roster.data?.employees ?? []).find((x: any) => x.id === v)?.fullName ?? null,
                                      }
                                    : row,
                                ),
                              );
                            }}
                            className="h-8 min-w-[180px] text-[12.5px]"
                          >
                            <option value="__new__">➕ Create &ldquo;{r.cleanName}&rdquo;</option>
                            {(roster.data?.employees ?? []).map((emp: any) => (
                              <option key={emp.id} value={emp.id}>
                                {emp.fullName}
                              </option>
                            ))}
                          </Select>
                        </td>

                        <td className="px-2 py-2.5 text-right text-ink-2 tnum">{formatDuration(r.seconds)}</td>
                        <td className="px-2 py-2.5 text-right text-ink-2 tnum">{r.activityPct}%</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="font-bold text-ink tnum">{formatPoints(r.projectedPoints)}</span>
                          <span className="ml-1.5 text-[11px] text-ink-3 tnum">#{r.projectedRank}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {unmatched > 0 && (
              <div className="border-t border-hairline px-5 py-3">
                <p className="flex gap-2 text-[12px] leading-relaxed text-ink-3">
                  <UserPlus size={13} className="mt-0.5 shrink-0 text-s1" />
                  {unmatched} {unmatched === 1 ? 'person is' : 'people are'} not on the roster yet. Importing will add
                  them. If someone is actually an existing person under a different spelling, pick their name from the
                  dropdown instead — we&rsquo;ll remember that spelling for next week.
                </p>
              </div>
            )}
          </Card>

          {/* Commit */}
          <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={publishNow}
                onChange={(e) => setPublishNow(e.target.checked)}
                className="mt-0.5 accent-s1"
              />
              <span>
                <span className="block text-[13.5px] font-semibold text-ink">Publish straight away</span>
                <span className="block text-[12px] text-ink-3">
                  Leave unticked to save as a draft and review it first — nobody outside the console will see it.
                </span>
              </span>
            </label>

            <Button
              onClick={commit}
              loading={committing}
              size="lg"
              variant={publishNow ? 'gold' : 'primary'}
              icon={<Sparkles size={16} />}
              disabled={!departmentId || !startDate || (preview.weekExists && !replace)}
            >
              {publishNow ? 'Import and publish' : 'Import as draft'}
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
