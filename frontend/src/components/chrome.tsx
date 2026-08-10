'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Building2, LogIn, Menu, Trophy, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { SITE_NAME } from '@/lib/api';
import { cx } from '@/lib/format';
import { ThemeToggle } from '@/lib/theme';

const NAV = [
  { href: '/', label: 'Departments' },
  { href: '/company', label: 'Company table' },
  { href: '/hall-of-fame', label: 'Hall of Fame' },
  { href: '/badges', label: 'Badges' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (pathname?.startsWith('/admin')) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-plane/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-s1 to-s7 shadow-glow">
            <Trophy size={17} className="text-white" aria-hidden />
          </span>
          <span className="hidden sm:block">
            <span className="block text-[14px] font-bold leading-tight text-ink">{SITE_NAME}</span>
            <span className="block text-[10.5px] font-medium leading-tight text-ink-3">Productivity Leaderboard</span>
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {NAV.map((n) => {
            const active = n.href === '/' ? pathname === '/' : pathname?.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cx(
                  'rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors',
                  active ? 'bg-[#5C5CFF] text-ink' : 'text-ink-3 hover:text-ink',
                )}
              >
                {n.label}
              </Link>
            );
          })}
          <Link
            href={user ? '/admin' : '/login'}
            className="ml-2 inline-flex items-center gap-1.5 rounded-lg border border-rule px-3 py-1.5 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            {user ? <Building2 size={14} /> : <LogIn size={14} />}
            {user ? 'Manager console' : 'Manager sign-in'}
          </Link>
          <ThemeToggle className="ml-1 inline-flex items-center justify-center rounded-lg border border-rule p-2 text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink" />
        </nav>

        <ThemeToggle className="ml-auto rounded-lg p-2 text-ink-2 md:hidden" />
        <button
          className="rounded-lg p-2 text-ink-2 md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <nav className="border-t border-hairline bg-plane px-4 py-3 md:hidden">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-[14px] font-semibold text-ink-2 hover:bg-[#5C5CFF] hover:text-ink"
            >
              {n.label}
            </Link>
          ))}
          <Link
            href={user ? '/admin' : '/login'}
            onClick={() => setOpen(false)}
            className="mt-1 block rounded-lg border border-rule px-3 py-2.5 text-[14px] font-semibold text-ink"
          >
            {user ? 'Manager console' : 'Manager sign-in'}
          </Link>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname?.startsWith('/admin')) return null;

  return (
    <footer className="mt-16 border-t border-hairline">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-[12px] leading-relaxed text-ink-3">
          Scores are calculated from the weekly Screenshot Monitor export. Activity % is Screenshot Monitor&rsquo;s own
          measure of keyboard and mouse input during tracked time — it is a proxy for engagement, not a measure of the
          value of someone&rsquo;s work. Thinking, reading, meetings and phone calls all register as low activity.
        </p>
        <p className="mt-3 text-[12px] text-ink-3">
          Something look wrong? Speak to your department manager — they can correct a week and republish it.
        </p>
      </div>
    </footer>
  );
}
