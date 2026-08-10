'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Merge, Plus, Tag, Trash2, UserCog, X } from 'lucide-react';
import { api, ApiError, useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, EmptyState, Field, Input, Modal, Notice, Select, Skeleton } from '@/components/ui';
import { Avatar } from '@/components/bits';
import { cx } from '@/lib/format';

export default function RosterPage() {
  const { user } = useAuth();
  const departments = useApi<any>('/api/departments');
  const [departmentId, setDepartmentId] = useState('');
  const [q, setQ] = useState('');

  const employees = useApi<any>(
    departmentId ? `/api/employees?departmentId=${departmentId}` : '/api/employees',
    { deps: [departmentId] },
  );

  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTitle, setNewTitle] = useState('');

  const [editing, setEditing] = useState<any>(null);
  const [aliasText, setAliasText] = useState('');
  const [mergeInto, setMergeInto] = useState('');
  const [deleting, setDeleting] = useState<any>(null);

  useEffect(() => {
    if (!departmentId && user?.department?.id && user.role !== 'ADMIN') setDepartmentId(user.department.id);
  }, [user, departmentId]);

  const list = (employees.data?.employees ?? []).filter((e: any) =>
    q ? e.fullName.toLowerCase().includes(q.toLowerCase()) : true,
  );

  async function run(fn: () => Promise<any>, success: string) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fn();
      setOk(res?.message ?? success);
      await employees.refresh();
      return res;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-black tracking-tight text-ink">Roster</h1>
          <p className="mt-1 text-[13.5px] text-ink-3">
            People are added automatically when they first appear in a report. Manage names, spellings and duplicates here.
          </p>
        </div>
        <Button icon={<Plus size={15} />} onClick={() => setAddOpen(true)} disabled={!departmentId}>
          Add a person
        </Button>
      </div>

      {error && (
        <Notice tone="critical" className="mb-4" onDismiss={() => setError(null)}>
          {error}
        </Notice>
      )}
      {ok && (
        <Notice tone="good" className="mb-4" onDismiss={() => setOk(null)}>
          {ok}
        </Notice>
      )}

      <div className="mb-5 flex flex-wrap gap-3">
        {user?.role === 'ADMIN' && (
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="w-[230px]">
            <option value="">All departments</option>
            {(departments.data?.departments ?? []).map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
        <Input placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
      </div>

      {employees.loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={<UserCog size={28} />} title="Nobody on the roster yet">
          Upload a weekly report and everyone in it is added automatically.
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <ul>
            {list.map((e: any) => (
              <li key={e.id} className="border-b border-hairline-strong last:border-0">
                <div className={cx('flex flex-wrap items-center gap-3 px-4 py-3', !e.isActive && 'opacity-50')}>
                  <Avatar name={e.fullName} colour={e.colour} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/p/${e.slug}`} className="text-[14px] font-semibold text-ink hover:text-s1">
                        {e.fullName}
                      </Link>
                      {e.isManager && (
                        <span className="rounded-pill border border-rule px-2 py-0.5 text-[10px] font-bold text-ink-3">Manager</span>
                      )}
                      {e.excludeFromLeaderboard && (
                        <span className="rounded-pill border border-warning/35 bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
                          Hidden
                        </span>
                      )}
                      {!e.isActive && (
                        <span className="rounded-pill border border-rule px-2 py-0.5 text-[10px] font-bold text-ink-3">Inactive</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-ink-3 tnum">
                      {e.department.name} · {e.weeksTracked} weeks · {e.badgeCount} badges · {e.aliases.length} name
                      {e.aliases.length === 1 ? '' : 's'} on file
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(e)}>
                    Manage
                  </Button>
                  <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => setDeleting(e)}>
                    {/* Delete */}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Add */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a person"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!newName.trim()}
              onClick={async () => {
                await run(
                  () =>
                    api('/api/employees', {
                      method: 'POST',
                      body: { fullName: newName.trim(), departmentId, jobTitle: newTitle || null },
                    }),
                  `${newName} added.`,
                );
                setAddOpen(false);
                setNewName('');
                setNewTitle('');
              }}
            >
              Add
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Notice tone="info">
            You rarely need this — people are created automatically the first time they appear in a report. Use it to add
            someone ahead of their first week.
          </Notice>
          <Field label="Full name" hint="Exactly as you want it shown on the leaderboard.">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Fathima Rukaiya" autoFocus />
          </Field>
          <Field label="Job title" hint="Optional.">
            <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Course Developer" />
          </Field>
        </div>
      </Modal>

      {/* Manage */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Manage ${editing.fullName}` : ''} wide>
        {editing && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name">
                <Input
                  defaultValue={editing.fullName}
                  onBlur={(e) =>
                    e.target.value !== editing.fullName &&
                    run(
                      () => api(`/api/employees/${editing.id}`, { method: 'PATCH', body: { fullName: e.target.value } }),
                      'Name updated. The old spelling was kept as an alias.',
                    )
                  }
                />
              </Field>
              <Field label="Job title">
                <Input
                  defaultValue={editing.jobTitle ?? ''}
                  onBlur={(e) =>
                    run(
                      () => api(`/api/employees/${editing.id}`, { method: 'PATCH', body: { jobTitle: e.target.value || null } }),
                      'Job title updated.',
                    )
                  }
                />
              </Field>
            </div>

            <div className="space-y-2.5">
              {[
                { key: 'isManager', label: 'This person is a manager', hint: 'Shows a manager tag on the leaderboard.' },
                {
                  key: 'excludeFromLeaderboard',
                  label: 'Hide from the leaderboard',
                  hint: 'Still imported and tracked, but never ranked or shown publicly. Useful if you would rather not compete against your own team.',
                },
                { key: 'isActive', label: 'Active', hint: 'Turn off for leavers. History is kept either way.' },
              ].map((t) => (
                <label key={t.key} className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    defaultChecked={editing[t.key]}
                    className="mt-0.5 accent-s1"
                    onChange={(e) =>
                      run(
                        () => api(`/api/employees/${editing.id}`, { method: 'PATCH', body: { [t.key]: e.target.checked } }),
                        'Updated.',
                      )
                    }
                  />
                  <span>
                    <span className="block text-[13.5px] font-semibold text-ink">{t.label}</span>
                    <span className="block text-[12px] leading-relaxed text-ink-3">{t.hint}</span>
                  </span>
                </label>
              ))}
            </div>

            {/* Aliases */}
            <div>
              <h3 className="mb-1 flex items-center gap-2 text-[14px] font-bold text-ink">
                <Tag size={14} /> Names on file
              </h3>
              <p className="mb-3 text-[12px] leading-relaxed text-ink-3">
                Every spelling that has appeared in a report. Adding one here means next week&rsquo;s upload matches it
                automatically instead of creating a duplicate.
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                {editing.aliases.map((a: any) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-rule bg-ink/[0.03] px-2.5 py-1 text-[12px] text-ink-2"
                  >
                    {a.raw}
                    <button
                      onClick={async () => {
                        await run(
                          () => api(`/api/employees/${editing.id}/aliases/${a.id}`, { method: 'DELETE' }),
                          'Alias removed.',
                        );
                        setEditing({ ...editing, aliases: editing.aliases.filter((x: any) => x.id !== a.id) });
                      }}
                      className="text-ink-3 hover:text-critical"
                      aria-label={`Remove ${a.raw}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Another spelling, e.g. Sadeev"
                  value={aliasText}
                  onChange={(e) => setAliasText(e.target.value)}
                  className="max-w-xs"
                />
                <Button
                  variant="secondary"
                  disabled={!aliasText.trim()}
                  loading={busy}
                  onClick={async () => {
                    const res = await run(
                      () => api(`/api/employees/${editing.id}/aliases`, { method: 'POST', body: { alias: aliasText.trim() } }),
                      'Alias added.',
                    );
                    if (res?.alias) setEditing({ ...editing, aliases: [...editing.aliases, res.alias] });
                    setAliasText('');
                  }}
                >
                  Add
                </Button>
              </div>
            </div>

            {/* Merge */}
            <div className="border-t border-hairline pt-5">
              <h3 className="mb-1 flex items-center gap-2 text-[14px] font-bold text-ink">
                <Merge size={14} /> Merge into someone else
              </h3>
              <p className="mb-3 text-[12px] leading-relaxed text-ink-3">
                If this is a duplicate, merge it into the real person. All weeks, badges and name spellings move across
                and this record is deleted. Where both have a row in the same week, the target&rsquo;s row is kept.
              </p>
              <div className="flex gap-2">
                <Select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} className="max-w-xs">
                  <option value="">Choose the person to keep…</option>
                  {list
                    .filter((x: any) => x.id !== editing.id && x.department.id === editing.department.id)
                    .map((x: any) => (
                      <option key={x.id} value={x.id}>
                        {x.fullName}
                      </option>
                    ))}
                </Select>
                <Button
                  variant="danger"
                  disabled={!mergeInto}
                  loading={busy}
                  onClick={async () => {
                    await run(
                      () => api(`/api/employees/${editing.id}/merge`, { method: 'POST', body: { intoEmployeeId: mergeInto } }),
                      'Merged.',
                    );
                    setEditing(null);
                    setMergeInto('');
                  }}
                >
                  Merge
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete */}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={deleting ? `Delete ${deleting.fullName}?` : ''}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                await run(() => api(`/api/employees/${deleting.id}`, { method: 'DELETE' }), 'Deleted.');
                setDeleting(null);
              }}
            >
              Yes, delete
            </Button>
          </div>
        }
      >
        {deleting && (
          <p className="text-[13.5px] leading-relaxed text-ink-2">
            This permanently deletes {deleting.fullName} from the roster, along with all of their weekly results,
            badges and name spellings on file. Their lifetime totals and leaderboard history will be gone. This cannot
            be undone.
          </p>
        )}
      </Modal>
    </div>
  );
}
