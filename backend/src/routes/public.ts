/**
 * Public routes — no authentication.
 *
 * These power everything an employee sees. They deliberately expose only
 * PUBLISHED weeks and never return manager-only fields such as parse warnings,
 * uploader identity, or integrity flags.
 */

import { Router } from 'express';
import { prisma } from '../lib/prisma';
import {
  getCompanyOverview,
  getDepartmentWeek,
  getEmployeeProfile,
  getHallOfFame,
  getMonthlyStandings,
  listMonths,
} from '../services/leaderboard';
import { notFound } from '../lib/errors';
import { monthKeyForWeek } from '../lib/period';

export const publicRouter = Router();

/** Strips manager-only detail from a standings row before it leaves the building. */
function publicise<T extends Record<string, any>>(row: T) {
  const { flags, statId, ...rest } = row as any;
  return rest;
}

publicRouter.get('/departments', async (_req, res, next) => {
  try {
    const departments = await prisma.department.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        code: true,
        colour: true,
        accent: true,
        icon: true,
        weeklyTargetHours: true,
        _count: { select: { employees: { where: { isActive: true, excludeFromLeaderboard: false } } } },
      },
    });

    const publishedCounts = await prisma.week.groupBy({
      by: ['departmentId'],
      where: { status: 'PUBLISHED' },
      _count: { _all: true },
      _max: { startDate: true },
    });
    const byDept = new Map(publishedCounts.map((c) => [c.departmentId, c]));

    res.json({
      departments: departments.map((d) => ({
        id: d.id,
        name: d.name,
        slug: d.slug,
        code: d.code,
        colour: d.colour,
        accent: d.accent,
        icon: d.icon,
        targetHours: d.weeklyTargetHours,
        headcount: d._count.employees,
        weeksPublished: byDept.get(d.id)?._count._all ?? 0,
        latestWeek: byDept.get(d.id)?._max.startDate ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/departments/:slug/leaderboard', async (req, res, next) => {
  try {
    const data = await getDepartmentWeek(prisma, req.params.slug, req.query.week as string | undefined);
    res.json({
      ...data,
      podium: data.podium.map(publicise),
      standings: data.standings.map(publicise),
    });
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/departments/:slug/months', async (req, res, next) => {
  try {
    const dept = await prisma.department.findUnique({ where: { slug: req.params.slug } });
    if (!dept) throw notFound('That department does not exist.');
    res.json({ months: await listMonths(prisma, dept.id) });
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/departments/:slug/monthly', async (req, res, next) => {
  try {
    const dept = await prisma.department.findUnique({ where: { slug: req.params.slug } });
    if (!dept) throw notFound('That department does not exist.');

    let key = req.query.month as string | undefined;
    if (!key) {
      const latest = await prisma.week.findFirst({
        where: { departmentId: dept.id, status: 'PUBLISHED' },
        orderBy: { startDate: 'desc' },
        select: { startDate: true },
      });
      key = latest ? monthKeyForWeek(latest.startDate) : undefined;
    }
    if (!key) return res.json({ monthKey: null, monthName: null, weeks: [], standings: [], prize: null });

    const standings = await getMonthlyStandings(prisma, dept.id, key);
    const prize = await prisma.prize.findFirst({
      where: { departmentId: dept.id, periodType: 'MONTH', periodKey: key },
      include: { employee: true },
    });

    res.json({
      ...standings,
      department: { id: dept.id, name: dept.name, slug: dept.slug, colour: dept.colour, accent: dept.accent },
      prize: prize
        ? {
            title: prize.title,
            reward: prize.reward,
            awardedAt: prize.awardedAt,
            employee: prize.employee
              ? { name: prize.employee.fullName, slug: prize.employee.slug, colour: prize.employee.avatarColour }
              : null,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/company', async (req, res, next) => {
  try {
    res.json(await getCompanyOverview(prisma, req.query.week as string | undefined));
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/employees/:slug', async (req, res, next) => {
  try {
    res.json(await getEmployeeProfile(prisma, req.params.slug));
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/hall-of-fame', async (_req, res, next) => {
  try {
    res.json(await getHallOfFame(prisma));
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/badges', async (_req, res, next) => {
  try {
    const badges = await prisma.badgeDefinition.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        key: true,
        name: true,
        description: true,
        icon: true,
        tier: true,
        colour: true,
        _count: { select: { awards: true } },
      },
    });
    res.json({
      badges: badges.map((b) => ({
        key: b.key,
        name: b.name,
        description: b.description,
        icon: b.icon,
        tier: b.tier,
        colour: b.colour,
        timesAwarded: b._count.awards,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** Small payload for the home page hero. */
publicRouter.get('/summary', async (_req, res, next) => {
  try {
    const [departments, employees, weeks, latest, totals] = await Promise.all([
      prisma.department.count({ where: { isActive: true } }),
      prisma.employee.count({ where: { isActive: true, excludeFromLeaderboard: false } }),
      prisma.week.count({ where: { status: 'PUBLISHED' } }),
      prisma.week.findFirst({
        where: { status: 'PUBLISHED' },
        orderBy: { startDate: 'desc' },
        select: { label: true, startDate: true },
      }),
      prisma.weekStat.aggregate({
        where: { week: { status: 'PUBLISHED' } },
        _sum: { seconds: true },
        _avg: { activityPct: true },
      }),
    ]);

    res.json({
      departments,
      employees,
      weeksPublished: weeks,
      latestWeek: latest ? { label: latest.label, startDate: latest.startDate } : null,
      totalSeconds: totals._sum.seconds ?? 0,
      avgActivity: Math.round((totals._avg.activityPct ?? 0) * 10) / 10,
    });
  } catch (err) {
    next(err);
  }
});
