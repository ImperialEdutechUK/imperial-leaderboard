'use client';

import { useState } from 'react';
import { KeyRound, Plus, UserCog } from 'lucide-react';
import { api, ApiError, useApi } from '@/lib/api';
import { Button, Card, Field, Input, Modal, Notice, Select, Skeleton } from '@/components/ui';
import { relativeTime } from '@/lib/format';

export default function UsersPage() {
  const users = useApi<any>('/api/users');
  const departments = useApi<any>('/api/departments');

  const [open, setOpen] = useState(false);
  const [reset, setReset] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'critical'; text: string } | null>(null);

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'MANAGER', departmentId: '' });

  async function create() {
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/users', { method: 'POST', body: { ...form, departmentId: form.departmentId || null } });
      setMsg({ tone: 'good', text: `${form.name} can now sign in. They will be asked to change the password.` });
      setOpen(false);
      setForm({ name: '', email: '', password: '', role: 'MANAGER', departmentId: '' });
      users.refresh();
    } catch (e) {
      setMsg({ tone: 'critical', text: e instanceof ApiError ? e.message : 'Could not create the account.' });
    } finally {
      setBusy(false);
    }
  }

  if (users.loading) return <Skeleton className="h-[420px]" />;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-black tracking-tight text-ink">Managers</h1>
          <p className="mt-1 text-[13.5px] text-ink-3">
            Only these people can sign in. Employees never need an account.
          </p>
        </div>
        <Button icon={<Plus size={15} />} onClick={() => setOpen(true)}>
          Add a manager
        </Button>
      </div>

      {msg && (
        <Notice tone={msg.tone} className="mb-5" onDismiss={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}

      <Card className="overflow-hidden">
        <ul>
          {(users.data?.users ?? []).map((u: any) => (
            <li key={u.id} className="border-b border-hairline-strong last:border-0">
              <div className={`flex flex-wrap items-center gap-3 px-4 py-3.5 ${!u.isActive ? 'opacity-50' : ''}`}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink/[0.05] text-ink-2">
                  <UserCog size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-ink">{u.name}</span>
                    <span
                      className={
                        u.role === 'ADMIN'
                          ? 'rounded-pill border border-s7/40 bg-s7/10 px-2 py-0.5 text-[10px] font-bold text-s7'
                          : 'rounded-pill border border-rule px-2 py-0.5 text-[10px] font-bold text-ink-3'
                      }
                    >
                      {u.role === 'ADMIN' ? 'Administrator' : 'Manager'}
                    </span>
                    {u.mustChangePassword && (
                      <span className="rounded-pill border border-warning/35 bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
                        Password not changed
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-ink-3">
                    {u.email} · {u.department?.name ?? 'All departments'} · last signed in {relativeTime(u.lastLoginAt)}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" icon={<KeyRound size={13} />} onClick={() => setReset(u)}>
                    Reset password
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await api(`/api/users/${u.id}`, { method: 'PATCH', body: { isActive: !u.isActive } });
                        users.refresh();
                      } catch (e) {
                        setMsg({ tone: 'critical', text: e instanceof ApiError ? e.message : 'Failed.' });
                      }
                    }}
                  >
                    {u.isActive ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* Create */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a manager"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create} loading={busy} disabled={!form.name || !form.email || form.password.length < 10}>
              Create account
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Full name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Email address">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field
            label="Temporary password"
            hint="At least 10 characters with an uppercase letter, a lowercase letter and a number. They will be asked to change it on first sign-in."
          >
            <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="MANAGER">Manager — one department only</option>
              <option value="ADMIN">Administrator — every department</option>
            </Select>
          </Field>
          <Field label="Department" hint={form.role === 'ADMIN' ? 'Optional for administrators.' : 'Required for managers.'}>
            <Select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
              <option value="">Choose…</option>
              {(departments.data?.departments ?? []).map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>

      {/* Reset password */}
      <Modal
        open={!!reset}
        onClose={() => setReset(null)}
        title={reset ? `Reset password for ${reset.name}` : ''}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReset(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={newPassword.length < 10}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/api/users/${reset.id}`, { method: 'PATCH', body: { password: newPassword } });
                  setMsg({ tone: 'good', text: `Password reset. Give it to ${reset.name} — they must change it on sign-in.` });
                  setReset(null);
                  setNewPassword('');
                  users.refresh();
                } catch (e) {
                  setMsg({ tone: 'critical', text: e instanceof ApiError ? e.message : 'Failed.' });
                } finally {
                  setBusy(false);
                }
              }}
            >
              Reset
            </Button>
          </div>
        }
      >
        <Field
          label="New temporary password"
          hint="At least 10 characters with an uppercase letter, a lowercase letter and a number. Send it to them by a channel other than email if you can."
        >
          <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoFocus />
        </Field>
      </Modal>
    </div>
  );
}
