import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { assertDepartmentAccess, departmentScope, requireAuth } from '../middleware/auth';
import { getDepartmentWeek } from '../services/leaderboard';
import { recalculateWeek } from '../services/imports';
import { toIso } from '../lib/period';

export const weekRouter = Router();
weekRouter.use(requireAuth);

/** GET /api/weeks — every week the caller can see, newest first. */
weekRouter.get('/', async (req, res, next) => {
  try {
    const where: any = { ...departmentScope(req) };
    if (req.query.departmentId) {
      assertDepartmentAccess(req, String(req.query.departmentId));
      where.departmentId = String(req.query.departmentId);
    }
    if (req.query.status) where.status = String(req.query.status).toUpperCase();

    const weeks = await prisma.week.findMany({
      where,
      orderBy: { startDate: 'desc' },
      take: Math.min(Number(req.query.limit ?? 60), 200),
      include: {
        department: { select: { id: true, name: true, slug: true, colour: true } },
        uploadedBy: { select: { name: true, email: true } },
        _count: { select: { stats: true } },
      },
    });

    res.json({
      weeks: weeks.map((w) => ({
        id: w.id,
        label: w.label,
        startDate: toIso(w.startDate),
        endDate: toIso(w.endDate),
        status: w.status,
        note: w.note,
        sourceType: w.sourceType,
        sourceFile: w.sourceFile,
        targetHoursOverride: w.targetHoursOverride,
        publishedAt: w.publishedAt,
        createdAt: w.createdAt,
        rowCount: w._count.stats,
        department: w.department,
        uploadedBy: w.uploadedBy,
        hasWarnings:
          Array.isArray(w.parseWarnings) &&
          (w.parseWarnings as any[]).some((x) => x?.level === 'warning' || x?.level === 'error'),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/weeks/:id — full detail including manager-only flags. */
weekRouter.get('/:id', async (req, res, next) => {
  try {
    const week = await prisma.week.findUnique({
      where: { id: req.params.id },
      include: { department: true },
    });
    if (!week) throw notFound('That week does not exist.');
    assertDepartmentAccess(req, week.departmentId);

    const data = await getDepartmentWeek(prisma, week.department.slug, toIso(week.startDate), {
      includeDrafts: true,
    });

    res.json({
      ...data,
      week: data.week
        ? { ...data.week, parseWarnings: week.parseWarnings, scoringSnapshot: week.scoringSnapshot }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

const patchSchema = z.object({
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  note: z.string().max(280).nullish(),
  targetHoursOverride: z.number().positive().nullish(),
});

/** PATCH /api/weeks/:id — publish, unpublish, archive, annotate, retarget. */
weekRouter.patch('/:id', async (req, res, next) => {
  try {
    const body = patchSchema.parse(req.body);
    const week = await prisma.week.findUnique({ where: { id: req.params.id } });
    if (!week) throw notFound('That week does not exist.');
    assertDepartmentAccess(req, week.departmentId);

    const data: any = {};
    if (body.status) {
      data.status = body.status;
      data.publishedAt = body.status === 'PUBLISHED' ? (week.publishedAt ?? new Date()) : null;
    }
    if (body.note !== undefined) data.note = body.note;

    const targetChanged =
      body.targetHoursOverride !== undefined && body.targetHoursOverride !== week.targetHoursOverride;
    if (body.targetHoursOverride !== undefined) data.targetHoursOverride = body.targetHoursOverride;

    const updated = await prisma.week.update({ where: { id: week.id }, data });

    // Changing the target changes everybody's score, so re-run the engine.
    if (targetChanged) await recalculateWeek(prisma, week.id);

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'WEEK_UPDATED',
        entity: 'Week',
        entityId: week.id,
        meta: body as any,
        ip: req.ip,
      },
    });

    res.json({ week: { id: updated.id, status: updated.status, note: updated.note }, recalculated: targetChanged });
  } catch (err) {
    next(err);
  }
});

/** POST /api/weeks/:id/recalculate — re-run scoring with current settings. */
weekRouter.post('/:id/recalculate', async (req, res, next) => {
  try {
    const week = await prisma.week.findUnique({ where: { id: req.params.id } });
    if (!week) throw notFound('That week does not exist.');
    assertDepartmentAccess(req, week.departmentId);

    const result = await recalculateWeek(prisma, week.id);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

const editRowSchema = z.object({
  seconds: z.number().int().min(0).optional(),
  activityPct: z.number().min(0).max(100).optional(),
});

/** PATCH /api/weeks/:id/stats/:statId — correct a single bad row, then re-score. */
weekRouter.patch('/:id/stats/:statId', async (req, res, next) => {
  try {
    const body = editRowSchema.parse(req.body);
    const stat = await prisma.weekStat.findUnique({
      where: { id: req.params.statId },
      include: { week: true },
    });
    if (!stat || stat.weekId !== req.params.id) throw notFound('That row does not exist.');
    assertDepartmentAccess(req, stat.week.departmentId);

    await prisma.weekStat.update({ where: { id: stat.id }, data: body });
    const result = await recalculateWeek(prisma, stat.weekId);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/weeks/:id */
weekRouter.delete('/:id', async (req, res, next) => {
  try {
    const week = await prisma.week.findUnique({ where: { id: req.params.id } });
    if (!week) throw notFound('That week does not exist.');
    assertDepartmentAccess(req, week.departmentId);

    await prisma.week.delete({ where: { id: week.id } });
    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'WEEK_DELETED',
        entity: 'Week',
        entityId: week.id,
        meta: { label: week.label },
        ip: req.ip,
      },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
