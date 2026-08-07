'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Lock, Trophy } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ApiError, SITE_NAME } from '@/lib/api';
import { Button, Card, Field, Input, Notice } from '@/components/ui';

function LoginForm() {
  const { signIn } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') ?? '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await signIn(email, password);
      router.push(user.mustChangePassword ? '/admin/account?first=1' : next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[78vh] max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-ink">
        <ChevronLeft size={15} /> Back to the leaderboard
      </Link>

      <Card className="p-7">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-s1 to-s7 shadow-glow">
            <Trophy size={22} className="text-white" aria-hidden />
          </span>
          <h1 className="text-[20px] font-bold text-ink">Manager sign-in</h1>
          <p className="mt-1 text-[13px] text-ink-3">
            Only managers need an account. Leaderboards are public to everyone.
          </p>
        </div>

        {error && (
          <Notice tone="critical" className="mb-4">
            {error}
          </Notice>
        )}

        <form onSubmit={submit} className="space-y-4">
          <Field label="Email address">
            <Input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@imperiallearning.co.uk"
              autoFocus
            />
          </Field>

          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••"
            />
          </Field>

          <Button type="submit" loading={loading} size="lg" className="w-full" icon={<Lock size={15} />}>
            Sign in
          </Button>
        </form>

        <p className="mt-5 border-t border-hairline pt-4 text-[12px] leading-relaxed text-ink-3">
          Forgotten your password? A company administrator can reset it for you from Admin → Managers. There is no
          self-service reset by design — it keeps the number of ways into the system small.
        </p>
      </Card>

      <p className="mt-6 text-center text-[11.5px] text-ink-3">{SITE_NAME} · Productivity Leaderboard</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
