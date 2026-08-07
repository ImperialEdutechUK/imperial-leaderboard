'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Field, Input, Notice } from '@/components/ui';

function AccountForm() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const first = useSearchParams().get('first') === '1';

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'critical'; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setMsg({ tone: 'critical', text: 'The two new passwords do not match.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword: current, newPassword: next },
      });
      await refresh();
      setMsg({ tone: 'good', text: 'Password updated.' });
      setCurrent('');
      setNext('');
      setConfirm('');
      if (first) setTimeout(() => router.push('/admin'), 900);
    } catch (e) {
      setMsg({ tone: 'critical', text: e instanceof ApiError ? e.message : 'Could not change the password.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <h1 className="text-[24px] font-black tracking-tight text-ink">Your account</h1>
        <p className="mt-1 text-[13.5px] text-ink-3">
          {user?.email} · {user?.role === 'ADMIN' ? 'Administrator' : user?.department?.name ?? 'Manager'}
        </p>
      </div>

      {first && (
        <Notice tone="warning" title="Set your own password" className="mb-5">
          You are signed in with the password someone else chose for you. Please replace it before doing anything else.
        </Notice>
      )}

      {msg && (
        <Notice tone={msg.tone} className="mb-5" onDismiss={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}

      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Current password">
            <Input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field
            label="New password"
            hint="At least 10 characters, with an uppercase letter, a lowercase letter and a number."
          >
            <Input type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Confirm new password">
            <Input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button type="submit" loading={busy} icon={<KeyRound size={15} />} className="w-full">
            Change password
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountForm />
    </Suspense>
  );
}
