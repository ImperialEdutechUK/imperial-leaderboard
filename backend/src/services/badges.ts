/**
 * Badge engine.
 *
 * Badges carry status, never points — see the note at the bottom of
 * services/scoring.ts for why that separation matters.
 *
 * Two families:
 *   • WEEK badges  — decided entirely by the week being published.
 *   • STREAK badges — need the employee's recent history.
 *
 * Adding a badge means adding one entry to BADGE_CATALOGUE and one case in
 * evaluateBadges. Nothing else in the system needs to change.
 */

import type { ScoredRow } from './scoring';

export interface BadgeSpec {
  key: string;
  name: string;
  description: string;
  /** Lucide icon name — must exist in the frontend's icon map. */
  icon: string;
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  colour: string;
  sortOrder: number;
}

export const BADGE_CATALOGUE: BadgeSpec[] = [
  // ── Weekly performance ────────────────────────────────────────────────────
  {
    key: 'WEEKLY_CHAMPION',
    name: 'Weekly Champion',
    description: 'Finished first on the department leaderboard for the week.',
    icon: 'Crown',
    tier: 'GOLD',
    colour: '#F4B740',
    sortOrder: 10,
  },
  {
    key: 'PODIUM',
    name: 'Podium Finish',
    description: 'Finished in the top three for the week.',
    icon: 'Medal',
    tier: 'SILVER',
    colour: '#C0C7D1',
    sortOrder: 20,
  },
  {
    key: 'CENTURION',
    name: 'Centurion',
    description: 'Recorded 100% activity for the week.',
    icon: 'Flame',
    tier: 'PLATINUM',
    colour: '#F97066',
    sortOrder: 30,
  },
  {
    key: 'SHARPSHOOTER',
    name: 'Sharpshooter',
    description: 'Activity of 90% or higher for the week.',
    icon: 'Target',
    tier: 'GOLD',
    colour: '#7C5CFC',
    sortOrder: 40,
  },
  {
    key: 'MARATHON',
    name: 'Marathon',
    description: 'Logged the most hours in the department this week.',
    icon: 'Timer',
    tier: 'SILVER',
    colour: '#38BDF8',
    sortOrder: 50,
  },
  {
    key: 'ON_TARGET',
    name: 'On Target',
    description: 'Met or exceeded the weekly hours target.',
    icon: 'CircleCheck',
    tier: 'BRONZE',
    colour: '#34D399',
    sortOrder: 60,
  },
  {
    key: 'PERSONAL_BEST',
    name: 'Personal Best',
    description: 'Beat your own highest weekly score.',
    icon: 'TrendingUp',
    tier: 'SILVER',
    colour: '#F472B6',
    sortOrder: 70,
  },
  {
    key: 'BIGGEST_CLIMBER',
    name: 'Biggest Climber',
    description: 'Moved up more places than anyone else this week.',
    icon: 'Rocket',
    tier: 'SILVER',
    colour: '#FB923C',
    sortOrder: 80,
  },
  {
    key: 'COMEBACK',
    name: 'Comeback',
    description: 'Climbed five or more places from last week.',
    icon: 'Undo2',
    tier: 'BRONZE',
    colour: '#A78BFA',
    sortOrder: 90,
  },
  {
    key: 'FULL_WEEK',
    name: 'Full Week',
    description: 'Recorded time on every working day of the week.',
    icon: 'CalendarCheck',
    tier: 'BRONZE',
    colour: '#22D3EE',
    sortOrder: 100,
  },

  // ── Streaks and milestones ────────────────────────────────────────────────
  {
    key: 'HOT_STREAK',
    name: 'Hot Streak',
    description: 'Finished in the top three three weeks running.',
    icon: 'Zap',
    tier: 'GOLD',
    colour: '#FACC15',
    sortOrder: 110,
  },
  {
    key: 'RELIABLE',
    name: 'Reliable',
    description: 'Hit the weekly hours target four weeks in a row.',
    icon: 'ShieldCheck',
    tier: 'GOLD',
    colour: '#4ADE80',
    sortOrder: 120,
  },
  {
    key: 'UNTOUCHABLE',
    name: 'Untouchable',
    description: 'Won the department leaderboard three weeks in a row.',
    icon: 'Swords',
    tier: 'PLATINUM',
    colour: '#F4B740',
    sortOrder: 130,
  },
  {
    key: 'VETERAN',
    name: 'Veteran',
    description: 'Appeared on ten or more weekly leaderboards.',
    icon: 'Award',
    tier: 'SILVER',
    colour: '#94A3B8',
    sortOrder: 140,
  },
  {
    key: 'TEN_THOUSAND',
    name: '10k Club',
    description: 'Passed 10,000 lifetime points.',
    icon: 'Gem',
    tier: 'PLATINUM',
    colour: '#22D3EE',
    sortOrder: 150,
  },
  {
    key: 'MONTHLY_CHAMPION',
    name: 'Monthly Champion',
    description: 'Top of the department for a whole calendar month.',
    icon: 'Trophy',
    tier: 'PLATINUM',
    colour: '#F4B740',
    sortOrder: 5,
  },
];

export interface HistoryEntry {
  weekStart: string; // yyyy-mm-dd
  rank: number;
  points: number;
  qualified: boolean;
  targetMet: boolean;
}

export interface BadgeContext {
  rows: ScoredRow[];
  /** Previous PUBLISHED weeks for these employees, newest first. */
  history: Map<string, HistoryEntry[]>;
  /** Lifetime points per employee, BEFORE this week. */
  lifetimePoints: Map<string, number>;
  targetHours: number;
  /** Number of working days in this week, used for the Full Week badge. */
  workingDays: number;
}

export interface BadgeAwardDraft {
  employeeId: string;
  badgeKey: string;
  context: Record<string, unknown>;
}

export function evaluateBadges(ctx: BadgeContext): BadgeAwardDraft[] {
  const awards: BadgeAwardDraft[] = [];
  const push = (employeeId: string, badgeKey: string, context: Record<string, unknown> = {}) =>
    awards.push({ employeeId, badgeKey, context });

  const qualified = ctx.rows.filter((r) => r.qualified);
  if (qualified.length === 0) return awards;

  // ── Week-scoped, single-winner badges ─────────────────────────────────────
  const maxSeconds = Math.max(...qualified.map((r) => r.seconds));
  const climbers = qualified.filter((r) => (r.rankDelta ?? 0) >= 2);
  const bestClimb = climbers.length ? Math.max(...climbers.map((r) => r.rankDelta ?? 0)) : 0;

  for (const row of ctx.rows) {
    if (!row.qualified) continue;
    const hours = row.seconds / 3600;

    if (row.rank === 1) push(row.employeeId, 'WEEKLY_CHAMPION', { points: row.points });
    if (row.rank <= 3) push(row.employeeId, 'PODIUM', { rank: row.rank });

    if (row.activityPct >= 100) push(row.employeeId, 'CENTURION', { activityPct: row.activityPct });
    else if (row.activityPct >= 90) push(row.employeeId, 'SHARPSHOOTER', { activityPct: row.activityPct });

    if (row.seconds === maxSeconds && qualified.length > 1)
      push(row.employeeId, 'MARATHON', { seconds: row.seconds });

    if (hours >= ctx.targetHours) push(row.employeeId, 'ON_TARGET', { hours: Math.round(hours * 10) / 10 });

    if (row.isPersonalBest) push(row.employeeId, 'PERSONAL_BEST', { points: row.points });

    if (bestClimb > 0 && (row.rankDelta ?? 0) === bestClimb)
      push(row.employeeId, 'BIGGEST_CLIMBER', { places: row.rankDelta });

    if ((row.rankDelta ?? 0) >= 5) push(row.employeeId, 'COMEBACK', { places: row.rankDelta });

    if (row.daysWorked != null && ctx.workingDays > 0 && row.daysWorked >= ctx.workingDays)
      push(row.employeeId, 'FULL_WEEK', { daysWorked: row.daysWorked });

    // ── History-dependent badges ────────────────────────────────────────────
    const hist = ctx.history.get(row.employeeId) ?? [];

    // Top-three three weeks running (this week + two previous).
    if (row.rank <= 3 && hist.length >= 2 && hist[0]?.rank <= 3 && hist[1]?.rank <= 3)
      push(row.employeeId, 'HOT_STREAK', { weeks: 3 });

    // First place three weeks running.
    if (row.rank === 1 && hist.length >= 2 && hist[0]?.rank === 1 && hist[1]?.rank === 1)
      push(row.employeeId, 'UNTOUCHABLE', { weeks: 3 });

    // Target met four weeks running.
    if (
      hours >= ctx.targetHours &&
      hist.length >= 3 &&
      hist[0]?.targetMet &&
      hist[1]?.targetMet &&
      hist[2]?.targetMet
    )
      push(row.employeeId, 'RELIABLE', { weeks: 4 });

    // Milestones.
    const appearances = hist.length + 1;
    if (appearances === 10 || (appearances > 10 && hist.length === 9))
      push(row.employeeId, 'VETERAN', { weeks: appearances });

    const before = ctx.lifetimePoints.get(row.employeeId) ?? 0;
    if (before < 10_000 && before + row.points >= 10_000)
      push(row.employeeId, 'TEN_THOUSAND', { lifetimePoints: Math.round(before + row.points) });
  }

  return awards;
}
