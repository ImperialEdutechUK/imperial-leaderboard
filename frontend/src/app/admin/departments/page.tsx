'use client';

import { useState } from 'react';
import { Info, Save } from 'lucide-react';
import { api, ApiError, useApi } from '@/lib/api';
import { Icon } from '@/lib/icons';
import { Button, Card, Field, Input, Notice, Skeleton } from '@/components/ui';

export default function DepartmentsPage() {
  const { data, loading, refresh } = useApi<any>('/api/departments');
  const [msg, setMsg] = useState<{ tone: 'good' | 'critical'; text: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  async function save(id: string, body: any) {
    setSaving(id);
    setMsg(null);
    try {
      await api(`/api/departments/${id}`, { method: 'PATCH', body });
      setMsg({ tone: 'good', text: 'Saved.' });
      refresh();
    } catch (e) {
      setMsg({ tone: 'critical', text: e instanceof ApiError ? e.message : 'Could not save.' });
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <Skeleton className="h-[500px]" />;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-[24px] font-black tracking-tight text-ink">Departments</h1>
        <p className="mt-1 text-[13.5px] text-ink-3">
          The code is what routes an uploaded report to the right department automatically.
        </p>
      </div>

      {msg && (
        <Notice tone={msg.tone} className="mb-5" onDismiss={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}

      <Notice tone="info" title="About the department codes" className="mb-5">
        Screenshot Monitor names carry a suffix in brackets, e.g. <strong className="text-ink">Aaisha (CDD)</strong>. We
        read that suffix to work out which department a report belongs to. <strong className="text-ink">CDD</strong> is
        confirmed from your sample report. The other nine codes below were seeded as sensible guesses and{' '}
        <strong className="text-ink">need checking</strong> against how each department&rsquo;s people are actually named
        in Screenshot Monitor. A wrong code is not fatal — it just means the manager picks the department by hand on the
        upload screen.
      </Notice>

      <div className="space-y-3">
        {(data?.departments ?? []).map((d: any) => (
          <Card key={d.id} className="p-5">
            <div className="mb-4 flex items-center gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: `${d.colour}1F`, color: d.colour, border: `1px solid ${d.colour}44` }}
              >
                <Icon name={d.icon} size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-bold text-ink">{d.name}</h2>
                <p className="text-[11.5px] text-ink-3 tnum">
                  {d._count.employees} people · {d._count.weeks} weeks · {d._count.users} manager
                  {d._count.users === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            <form
              className="grid gap-4 sm:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                save(d.id, {
                  code: String(f.get('code') || '') || null,
                  weeklyTargetHours: Number(f.get('target')),
                  colour: String(f.get('colour')),
                  icon: String(f.get('icon')),
                });
              }}
            >
              <Field label="Code" hint="As it appears in brackets">
                <Input name="code" defaultValue={d.code ?? ''} maxLength={12} placeholder="CDD" />
              </Field>
              <Field label="Target hours/week">
                <Input name="target" type="number" step="0.5" min="1" defaultValue={d.weeklyTargetHours} />
              </Field>
              <Field label="Colour">
                <Input name="colour" type="text" defaultValue={d.colour} pattern="^#[0-9a-fA-F]{6}$" />
              </Field>
              <Field label="Icon" hint="Lucide icon name">
                <Input name="icon" defaultValue={d.icon} />
              </Field>
              <div className="sm:col-span-4">
                <Button type="submit" size="sm" variant="secondary" loading={saving === d.id} icon={<Save size={14} />}>
                  Save {d.name}
                </Button>
              </div>
            </form>
          </Card>
        ))}
      </div>
    </div>
  );
}
