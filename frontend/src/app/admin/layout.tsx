'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  CalendarRange, Gift, LayoutDashboard, LogOut, Menu, Settings, Sliders, Trophy,
  Upload, UserCog, Users, X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { SITE_NAME } from '@/lib/api';
import { Spinner } from '@/components/ui';
import { cx } from '@/lib/format';
import { ThemeToggle } from '@/lib/theme';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
}

const NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/upload', label: 'Upload a week', icon: Upload },
  { href: '/admin/weeks', label: 'Weeks', icon: CalendarRange },
  { href: '/admin/roster', label: 'Roster', icon: Users },
  { href: '/admin/prizes', label: 'Prizes', icon: Gift },
  { href: '/admin/scoring', label: 'Scoring', icon: Sliders },
];

const ADMIN_ONLY: NavItem[] = [
  { href: '/admin/departments', label: 'Departments', icon: Settings },
  { href: '/admin/users', label: 'Managers', icon: UserCog },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const isAdminOnlyPath = ADMIN_ONLY.some((n) => pathname?.startsWith(n.href));

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname ?? '/admin')}`);
  }, [loading, user, router, pathname]);

  useEffect(() => {
    // A stale ?next= from before a role change (e.g. a manager deactivated/reactivated
    // while a login redirect was pending) must not land a non-admin on an admin-only page.
    if (!loading && user && user.role !== 'ADMIN' && isAdminOnlyPath) router.replace('/admin');
  }, [loading, user, isAdminOnlyPath, router]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-ink-3">
        <Spinner /> Checking your session…
      </div>
    );
  }
  if (!user) return null;
  if (user.role !== 'ADMIN' && isAdminOnlyPath) return null;

  const items = user.role === 'ADMIN' ? [...NAV, ...ADMIN_ONLY] : NAV;

  const Sidebar = (
    <nav className="flex h-full flex-col">
      <Link href="/" className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-s1 to-s7">
          <Trophy size={17} className="text-white" aria-hidden />
        </span>
        <span>
          <span className="block text-[13px] font-bold leading-tight text-ink">{SITE_NAME}</span>
          <span className="block text-[10.5px] leading-tight text-ink-3">Manager console</span>
        </span>
      </Link>

      <div className="flex-1 space-y-0.5 px-2 py-2">
        {items.map((n) => {
          const active = n.exact ? pathname === n.href : pathname?.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cx(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-semibold transition-colors',
                active ? 'bg-s1/15 text-ink' : 'text-ink-3 hover:bg-ink/[0.04] hover:text-ink-2',
              )}
            >
              <n.icon size={16} />
              {n.label}
            </Link>
          );
        })}
      </div>

      <div className="border-t border-hairline p-3">
        <Link href="/admin/account" className="block rounded-lg px-2 py-1.5 hover:bg-ink/[0.04]">
          <div className="truncate text-[13px] font-semibold text-ink">{user.name}</div>
          <div className="truncate text-[11px] text-ink-3">
            {user.role === 'ADMIN' ? 'Administrator' : user.department?.name ?? 'Manager'}
          </div>
        </Link>
        <button
          onClick={signOut}
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold text-ink-3 hover:bg-ink/[0.04] hover:text-ink-2"
        >
          <LogOut size={14} /> Sign out
        </button>
        <div className="mt-1 flex items-center justify-between rounded-lg px-2 py-1.5">
          <span className="text-[12.5px] font-semibold text-ink-3">Appearance</span>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[228px] shrink-0 border-r border-hairline bg-surface lg:block">
        {Sidebar}
      </aside>

      {/* Mobile */}
      <div className="lg:hidden">
        {open && (
          <>
            <div className="fixed inset-0 z-40 bg-black/70" onClick={() => setOpen(false)} aria-hidden />
            <aside className="fixed inset-y-0 left-0 z-50 w-[248px] border-r border-hairline bg-surface">{Sidebar}</aside>
          </>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-hairline bg-plane/90 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-ink-2" aria-label="Open menu">
            <Menu size={20} />
          </button>
          <span className="text-[14px] font-bold text-ink">Manager console</span>
        </header>
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
