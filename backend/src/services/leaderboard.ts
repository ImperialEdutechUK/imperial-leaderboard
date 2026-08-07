/**
 * Read models for the public site.
 *
 * Everything here reads only PUBLISHED weeks unless explicitly told otherwise,
 * so a draft import is never visible to employees.
 */

import type { PrismaClient } from '@prisma/client';
import { notFound } from '../lib/errors';
import { formatDuration } from '../lib/text';
import {
  addDays,
  monthKeyForWeek,
  monthLabel,
  quarterKeyForWeek,
  toIso,
  utcDate,
} from '../lib/period';
import { levelFromPoints } from './scoring';

const PUBLISHED = { status: 'PUBLISHED' as const };

function employeeCard(e: {
  id: string;
  fullName: string;
  displayName: string;
  slug: string;
  avatarColour: string;
  jobTitle: string | null;
  isManager: boolean;
}) {
  return {
    id: e.id,
    name: e.fullName,
    shortName: e.displayName,
    slug: e.slug,
    colour: e.avatarColour,
    jobTitle: e.jobTitle,
    isManager: e.isManager,
    initials: e.fullName
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join(''),
  };
}

// ── Weekly department leaderboard ────────────────────────────────────────────

export async function getDepartmentWeek(
  prisma: PrismaClient,
  departmentSlug: string,
  weekStartIso?: string,
  opts: { includeDrafts?: boolean } = {},
) {
  const department = await prisma.department.findUnique({ where: { slug: departmentSlug } });
  if (!department) throw notFound('That department does not exist.');

  const statusFilter = opts.includeDrafts ? {} : PUBLISHED;

  const week = weekStartIso
    ? await prisma.week.findFirst({
        where: { departmentId: department.id, startDate: utcDate(weekStartIso), ...statusFilter },
      })
    : await prisma.week.findFirst({
        where: { departmentId: department.id, ...statusFilter },
        orderBy: { startDate: 'desc' },
      });

  const allWeeks = await prisma.week.findMany({
    where: { departmentId: department.id, ...statusFilter },
    orderBy: { startDate: 'desc' },
    select: { startDate: true, endDate: true, label: true, status: true },
    take: 104,
  });

  if (!week) {
    return {
      department: {
        id: department.id,
        name: department.name,
        slug: department.slug,
        code: department.code,
        colour: department.colour,
        accent: department.accent,
        icon: department.icon,
        targetHours: department.weeklyTargetHours,
      },
      week: null,
      podium: [],
      standings: [],
      stats: null,
      dayTotals: [],
      availableWeeks: allWeeks.map((w) => ({
        startDate: toIso(w.startDate),
        endDate: toIso(w.endDate),
        label: w.label,
      })),
    };
  }

  const [stats, dayTotals, badgeAwards] = await Promise.all([
    prisma.weekStat.findMany({
      where: { weekId: week.id, employee: { excludeFromLeaderboard: false } },
      include: { employee: true },
      orderBy: [{ rank: 'asc' }, { points: 'desc' }],
    }),
    prisma.dayTotal.findMany({ where: { weekId: week.id }, orderBy: { date: 'asc' } }),
    prisma.badgeAward.findMany({
      where: { weekId: week.id },
      include: { badge: true },
    }),
  ]);

  const badgesByEmployee = new Map<string, { key: string; name: string; icon: string; colour: string; tier: string }[]>();
  for (const a of badgeAwards) {
    const list = badgesByEmployee.get(a.employeeId) ?? [];
    list.push({
      key: a.badge.key,
      name: a.badge.name,
      icon: a.badge.icon,
      colour: a.badge.colour,
      tier: a.badge.tier,
    });
    badgesByEmployee.set(a.employeeId, list);
  }

  const targetHours = week.targetHoursOverride ?? department.weeklyTargetHours;

  /** A row is "not ranked" when the scoring engine flagged it below the qualifying threshold. */
  const isUnqualified = (flags: unknown) =>
    Array.isArray(flags) &&
    flags.some((f: any) => f?.type === 'NOT_QUALIFIED' || f?.type === 'ZERO_TIME');

  const standings = stats.map((s) => ({
    /** Row id — needed by the manager console to correct a single reading. Stripped from public responses. */
    statId: s.id,
    rank: s.rank,
    previousRank: s.previousRank,
    rankDelta: s.rankDelta,
    qualified: !isUnqualified(s.flags),
    employee: employeeCard(s.employee),
    seconds: s.seconds,
    hours: Math.round((s.seconds / 3600) * 100) / 100,
    durationLabel: formatDuration(s.seconds),
    activityPct: s.activityPct,
    points: s.points,
    basePoints: s.basePoints,
    bonusPoints: s.bonusPoints,
    hoursScore: s.hoursScore,
    activityScore: s.activityScore,
    isPersonalBest: s.isPersonalBest,
    bonusBreakdown: s.bonusBreakdown,
    badges: badgesByEmployee.get(s.employeeId) ?? [],
    targetProgress: Math.min(1.5, Math.round((s.seconds / 3600 / targetHours) * 100) / 100),
  }));

  const totalSeconds = stats.reduce((sum, s) => sum + s.seconds, 0);
  const avgActivity =
    stats.length > 0 ? stats.reduce((sum, s) => sum + s.activityPct, 0) / stats.length : 0;
  const hitTarget = stats.filter((s) => s.seconds / 3600 >= targetHours).length;

  /**
   * Diagnostic for the manager: when everybody exceeds the hours cap, the hours
   * half of the score becomes a constant and the table is effectively ranked on
   * activity alone. That is not a bug — it means the whole team beat the target —
   * but the manager should know, because it usually means the target is set too
   * low for this department.
   */
  const atHoursCap = stats.filter((s) => s.hoursScore >= 0.999).length;
  // "Differentiating" means the hours component is actually separating people.
  // Once four in five are pinned at the cap it has effectively stopped doing so.
  const hoursIsDifferentiating = stats.length > 1 && atHoursCap < stats.length * 0.8;

  return {
    department: {
      id: department.id,
      name: department.name,
      slug: department.slug,
      code: department.code,
      colour: department.colour,
      accent: department.accent,
      icon: department.icon,
      targetHours,
    },
    week: {
      id: week.id,
      label: week.label,
      startDate: toIso(week.startDate),
      endDate: toIso(week.endDate),
      isoWeek: week.isoWeek,
      isoYear: week.isoYear,
      status: week.status,
      note: week.note,
      targetHours,
      publishedAt: week.publishedAt,
      monthKey: monthKeyForWeek(week.startDate),
    },
    /**
     * The exact scoring configuration this week was calculated with, so the
     * public "how was this worked out?" panel can show its working. Publishing
     * the formula is deliberate — a leaderboard people cannot audit is a
     * leaderboard people do not trust.
     */
    scoring: (week.scoringSnapshot as Record<string, unknown> | null) ?? null,
    podium: standings.slice(0, 3),
    standings,
    stats: {
      headcount: stats.length,
      totalSeconds,
      totalHoursLabel: formatDuration(totalSeconds),
      avgActivity: Math.round(avgActivity * 10) / 10,
      avgHours: stats.length ? Math.round((totalSeconds / 3600 / stats.length) * 10) / 10 : 0,
      hitTarget,
      hitTargetPct: stats.length ? Math.round((hitTarget / stats.length) * 100) : 0,
      topPoints: standings[0]?.points ?? 0,
      atHoursCap,
      hoursIsDifferentiating,
      hoursNotice:
        hoursIsDifferentiating || stats.length < 2
          ? null
          : `${atHoursCap} of ${stats.length} people are at the hours cap for this week's ${targetHours}h target, so the hours half of the score is close to identical across the team and the ranking is driven almost entirely by activity. That is fine if the whole team beat the target — but if you want hours to separate people, raise the target in Settings.`,
    },
    dayTotals: dayTotals.map((d) => ({
      date: toIso(d.date),
      seconds: d.seconds,
      hours: Math.round((d.seconds / 3600) * 10) / 10,
      label: formatDuration(d.seconds),
    })),
    availableWeeks: allWeeks.map((w) => ({
      startDate: toIso(w.startDate),
      endDate: toIso(w.endDate),
      label: w.label,
    })),
  };
}

// ── Monthly standings (drives the monthly prize) ─────────────────────────────

export async function getMonthlyStandings(
  prisma: PrismaClient,
  departmentId: string,
  monthKeyValue: string,
) {
  const weeks = await prisma.week.findMany({
    where: { departmentId, ...PUBLISHED },
    orderBy: { startDate: 'asc' },
    select: { id: true, startDate: true, label: true, targetHoursOverride: true },
  });

  const inMonth = weeks.filter((w) => monthKeyForWeek(w.startDate) === monthKeyValue);
  if (inMonth.length === 0) {
    return { monthKey: monthKeyValue, monthName: monthLabel(monthKeyValue), weeks: [], standings: [] };
  }

  const stats = await prisma.weekStat.findMany({
    where: { weekId: { in: inMonth.map((w) => w.id) }, employee: { excludeFromLeaderboard: false } },
    include: { employee: true },
  });

  const byEmployee = new Map<
    string,
    {
      employee: ReturnType<typeof employeeCard>;
      points: number;
      seconds: number;
      activitySum: number;
      weeks: number;
      wins: number;
      podiums: number;
      bestRank: number;
    }
  >();

  for (const s of stats) {
    const cur = byEmployee.get(s.employeeId) ?? {
      employee: employeeCard(s.employee),
      points: 0,
      seconds: 0,
      activitySum: 0,
      weeks: 0,
      wins: 0,
      podiums: 0,
      bestRank: Number.MAX_SAFE_INTEGER,
    };
    cur.points += s.points;
    cur.seconds += s.seconds;
    cur.activitySum += s.activityPct;
    cur.weeks += 1;
    if (s.rank === 1) cur.wins += 1;
    if (s.rank <= 3) cur.podiums += 1;
    cur.bestRank = Math.min(cur.bestRank, s.rank);
    byEmployee.set(s.employeeId, cur);
  }

  const standings = [...byEmployee.values()]
    .map((v) => ({
      employee: v.employee,
      points: Math.round(v.points * 100) / 100,
      /** Average per week — the fair comparison when someone joined mid-month. */
      avgPoints: Math.round((v.points / v.weeks) * 100) / 100,
      seconds: v.seconds,
      durationLabel: formatDuration(v.seconds),
      avgActivity: Math.round((v.activitySum / v.weeks) * 10) / 10,
      weeksCounted: v.weeks,
      wins: v.wins,
      podiums: v.podiums,
      bestRank: v.bestRank,
    }))
    .sort((a, b) => b.points - a.points || b.avgActivity - a.avgActivity)
    .map((row, i) => ({ ...row, rank: i + 1 }));

  return {
    monthKey: monthKeyValue,
    monthName: monthLabel(monthKeyValue),
    weeks: inMonth.map((w) => ({ id: w.id, startDate: toIso(w.startDate), label: w.label })),
    standings,
  };
}

/** Every month that has at least one published week, newest first. */
export async function listMonths(prisma: PrismaClient, departmentId?: string) {
  const weeks = await prisma.week.findMany({
    where: { ...PUBLISHED, ...(departmentId ? { departmentId } : {}) },
    select: { startDate: true },
    orderBy: { startDate: 'desc' },
  });
  const keys = [...new Set(weeks.map((w) => monthKeyForWeek(w.startDate)))];
  return keys.map((k) => ({ key: k, label: monthLabel(k) }));
}

// ── Company-wide: department vs department ───────────────────────────────────

export async function getCompanyOverview(prisma: PrismaClient, weekStartIso?: string) {
  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  // Use the most recent published week across the whole company as the default.
  const latest = await prisma.week.findFirst({
    where: PUBLISHED,
    orderBy: { startDate: 'desc' },
    select: { startDate: true, label: true, endDate: true },
  });

  const targetStart = weekStartIso ? utcDate(weekStartIso) : latest?.startDate;

  const rows: any[] = [];
  let companySeconds = 0;
  let companyHeadcount = 0;
  let activityWeightedSum = 0;

  for (const dept of departments) {
    const week = targetStart
      ? await prisma.week.findFirst({
          where: { departmentId: dept.id, startDate: targetStart, ...PUBLISHED },
        })
      : null;

    if (!week) {
      rows.push({
        department: {
          id: dept.id,
          name: dept.name,
          slug: dept.slug,
          colour: dept.colour,
          accent: dept.accent,
          icon: dept.icon,
        },
        hasData: false,
        headcount: 0,
        avgPoints: 0,
        avgActivity: 0,
        totalSeconds: 0,
        totalHoursLabel: '—',
        hitTargetPct: 0,
        champion: null,
      });
      continue;
    }

    const stats = await prisma.weekStat.findMany({
      where: { weekId: week.id, employee: { excludeFromLeaderboard: false } },
      include: { employee: true },
      orderBy: { rank: 'asc' },
    });
    if (stats.length === 0) continue;

    const targetHours = week.targetHoursOverride ?? dept.weeklyTargetHours;
    const totalSeconds = stats.reduce((s, x) => s + x.seconds, 0);
    const avgPoints = stats.reduce((s, x) => s + x.points, 0) / stats.length;
    const avgActivity = stats.reduce((s, x) => s + x.activityPct, 0) / stats.length;
    const hitTarget = stats.filter((x) => x.seconds / 3600 >= targetHours).length;

    companySeconds += totalSeconds;
    companyHeadcount += stats.length;
    activityWeightedSum += avgActivity * stats.length;

    rows.push({
      department: {
        id: dept.id,
        name: dept.name,
        slug: dept.slug,
        colour: dept.colour,
        accent: dept.accent,
        icon: dept.icon,
      },
      hasData: true,
      headcount: stats.length,
      avgPoints: Math.round(avgPoints * 10) / 10,
      avgActivity: Math.round(avgActivity * 10) / 10,
      totalSeconds,
      totalHoursLabel: formatDuration(totalSeconds),
      hitTargetPct: Math.round((hitTarget / stats.length) * 100),
      champion: stats[0]
        ? { ...employeeCard(stats[0].employee), points: stats[0].points }
        : null,
    });
  }

  const ranked = [...rows]
    .filter((r) => r.hasData)
    .sort((a, b) => b.avgPoints - a.avgPoints)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const withoutData = rows.filter((r) => !r.hasData).map((r) => ({ ...r, rank: null }));

  return {
    week: targetStart
      ? {
          startDate: toIso(targetStart),
          endDate: toIso(addDays(targetStart, 6)),
          label: latest?.label ?? '',
        }
      : null,
    departments: [...ranked, ...withoutData],
    company: {
      totalSeconds: companySeconds,
      totalHoursLabel: formatDuration(companySeconds),
      headcount: companyHeadcount,
      avgActivity:
        companyHeadcount > 0 ? Math.round((activityWeightedSum / companyHeadcount) * 10) / 10 : 0,
      departmentsReporting: ranked.length,
      departmentsTotal: departments.length,
    },
  };
}

// ── Employee profile ─────────────────────────────────────────────────────────

export async function getEmployeeProfile(prisma: PrismaClient, slug: string) {
  const employee = await prisma.employee.findUnique({
    where: { slug },
    include: { department: true },
  });
  if (!employee || employee.excludeFromLeaderboard) throw notFound('That person could not be found.');

  const stats = await prisma.weekStat.findMany({
    where: { employeeId: employee.id, week: PUBLISHED },
    include: { week: { select: { label: true, startDate: true, endDate: true } } },
    orderBy: { week: { startDate: 'asc' } },
  });

  const awards = await prisma.badgeAward.findMany({
    where: { employeeId: employee.id },
    include: { badge: true, week: { select: { label: true, startDate: true } } },
    orderBy: { awardedAt: 'desc' },
  });

  const prizes = await prisma.prize.findMany({
    where: { employeeId: employee.id, awardedAt: { not: null } },
    orderBy: { awardedAt: 'desc' },
  });

  const totalPoints = stats.reduce((s, x) => s + x.points, 0);
  const totalSeconds = stats.reduce((s, x) => s + x.seconds, 0);
  const wins = stats.filter((s) => s.rank === 1).length;
  const podiums = stats.filter((s) => s.rank <= 3).length;
  const bestWeek = stats.reduce<(typeof stats)[number] | null>(
    (best, s) => (!best || s.points > best.points ? s : best),
    null,
  );

  // Distinct badges with a count of how many times each was earned.
  const badgeCounts = new Map<string, { badge: (typeof awards)[number]['badge']; count: number; lastAwarded: Date }>();
  for (const a of awards) {
    const cur = badgeCounts.get(a.badge.key);
    if (cur) cur.count += 1;
    else badgeCounts.set(a.badge.key, { badge: a.badge, count: 1, lastAwarded: a.awardedAt });
  }

  const level = levelFromPoints(totalPoints);

  // Current streak of consecutive published weeks appeared in.
  let streak = 0;
  for (let i = stats.length - 1; i >= 0; i--) {
    if (stats[i].seconds > 0) streak++;
    else break;
  }

  return {
    employee: {
      ...employeeCard(employee),
      department: {
        name: employee.department.name,
        slug: employee.department.slug,
        colour: employee.department.colour,
        accent: employee.department.accent,
      },
    },
    level,
    totals: {
      points: Math.round(totalPoints * 10) / 10,
      seconds: totalSeconds,
      durationLabel: formatDuration(totalSeconds),
      weeksTracked: stats.length,
      wins,
      podiums,
      avgActivity: stats.length
        ? Math.round((stats.reduce((s, x) => s + x.activityPct, 0) / stats.length) * 10) / 10
        : 0,
      avgPoints: stats.length ? Math.round((totalPoints / stats.length) * 10) / 10 : 0,
      bestRank: stats.length ? Math.min(...stats.map((s) => s.rank)) : null,
      currentStreak: streak,
    },
    bestWeek: bestWeek
      ? {
          label: bestWeek.week.label,
          points: bestWeek.points,
          rank: bestWeek.rank,
          activityPct: bestWeek.activityPct,
          durationLabel: formatDuration(bestWeek.seconds),
        }
      : null,
    history: stats.map((s) => ({
      weekLabel: s.week.label,
      startDate: toIso(s.week.startDate),
      rank: s.rank,
      rankDelta: s.rankDelta,
      points: s.points,
      activityPct: s.activityPct,
      hours: Math.round((s.seconds / 3600) * 10) / 10,
      durationLabel: formatDuration(s.seconds),
      isPersonalBest: s.isPersonalBest,
    })),
    badges: [...badgeCounts.values()]
      .map((b) => ({
        key: b.badge.key,
        name: b.badge.name,
        description: b.badge.description,
        icon: b.badge.icon,
        colour: b.badge.colour,
        tier: b.badge.tier,
        count: b.count,
        lastAwarded: b.lastAwarded,
      }))
      .sort((a, b) => b.count - a.count),
    prizes: prizes.map((p) => ({
      title: p.title,
      reward: p.reward,
      periodKey: p.periodKey,
      periodType: p.periodType,
      awardedAt: p.awardedAt,
    })),
  };
}

// ── Hall of fame ─────────────────────────────────────────────────────────────

export async function getHallOfFame(prisma: PrismaClient) {
  const prizes = await prisma.prize.findMany({
    where: { awardedAt: { not: null }, employeeId: { not: null } },
    include: {
      employee: { include: { department: true } },
      department: true,
    },
    orderBy: [{ periodKey: 'desc' }, { createdAt: 'desc' }],
  });

  const allTime = await prisma.weekStat.groupBy({
    by: ['employeeId'],
    where: { week: PUBLISHED, employee: { excludeFromLeaderboard: false } },
    _sum: { points: true, seconds: true },
    _count: { _all: true },
    _avg: { activityPct: true },
  });

  const topIds = allTime
    .sort((a, b) => (b._sum.points ?? 0) - (a._sum.points ?? 0))
    .slice(0, 25)
    .map((a) => a.employeeId);

  const employees = await prisma.employee.findMany({
    where: { id: { in: topIds } },
    include: { department: true },
  });
  const empById = new Map(employees.map((e) => [e.id, e]));

  const leaderboard = allTime
    .filter((a) => empById.has(a.employeeId))
    .sort((a, b) => (b._sum.points ?? 0) - (a._sum.points ?? 0))
    .slice(0, 25)
    .map((a, i) => {
      const e = empById.get(a.employeeId)!;
      const points = Math.round((a._sum.points ?? 0) * 10) / 10;
      return {
        rank: i + 1,
        employee: {
          ...employeeCard(e),
          department: { name: e.department.name, slug: e.department.slug, colour: e.department.colour },
        },
        points,
        level: levelFromPoints(points),
        weeks: a._count._all,
        durationLabel: formatDuration(a._sum.seconds ?? 0),
        avgActivity: Math.round((a._avg.activityPct ?? 0) * 10) / 10,
      };
    });

  return {
    champions: prizes.map((p) => ({
      id: p.id,
      title: p.title,
      reward: p.reward,
      periodKey: p.periodKey,
      periodType: p.periodType,
      periodLabel: p.periodType === 'MONTH' ? monthLabel(p.periodKey) : p.periodKey,
      awardedAt: p.awardedAt,
      pointsTotal: p.pointsTotal,
      department: p.department
        ? { name: p.department.name, slug: p.department.slug, colour: p.department.colour }
        : null,
      employee: p.employee
        ? {
            ...employeeCard(p.employee),
            department: { name: p.employee.department.name, slug: p.employee.department.slug },
          }
        : null,
    })),
    allTime: leaderboard,
  };
}

export { quarterKeyForWeek };
