'use client';

import { Sparkles } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Icon } from '@/lib/icons';
import { Card, Skeleton } from '@/components/ui';
import { formatNumber } from '@/lib/format';

const TIER_ORDER = ['PLATINUM', 'GOLD', 'SILVER', 'BRONZE'];
const TIER_LABEL: Record<string, string> = {
  PLATINUM: 'Platinum — the rarest',
  GOLD: 'Gold',
  SILVER: 'Silver',
  BRONZE: 'Bronze — the everyday wins',
};

export default function BadgesPage() {
  const { data, loading } = useApi<any>('/api/public/badges', { auth: false });

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-10">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-[420px]" />
      </div>
    );
  }

  const badges = data?.badges ?? [];
  const grouped = TIER_ORDER.map((tier) => ({
    tier,
    items: badges.filter((b: any) => b.tier === tier),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-pill border border-rule bg-white/[0.03] px-3 py-1 text-[11px] font-semibold text-ink-2">
          <Sparkles size={12} className="text-gold" /> Every badge you can earn
        </div>
        <h1 className="mt-3 text-[28px] font-black leading-tight tracking-tight text-ink">Badges</h1>
        <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">
          Badges are awarded automatically the moment a week is published. They carry status rather than points, so
          chasing a badge can never distort the leaderboard itself.
        </p>
      </div>

      <div className="space-y-8">
        {grouped.map((group) => (
          <section key={group.tier}>
            <h2 className="label mb-3">{TIER_LABEL[group.tier] ?? group.tier}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {group.items.map((b: any) => (
                <Card key={b.key} className="flex items-start gap-3.5 p-4">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `${b.colour}1C`, border: `1px solid ${b.colour}4D`, color: b.colour }}
                  >
                    <Icon name={b.icon} size={20} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-bold text-ink">{b.name}</h3>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{b.description}</p>
                    <p className="mt-1.5 text-[11px] font-semibold text-ink-3 tnum">
                      {b.timesAwarded === 0
                        ? 'Not yet earned by anyone'
                        : `Earned ${formatNumber(b.timesAwarded)} ${b.timesAwarded === 1 ? 'time' : 'times'}`}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
