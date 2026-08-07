import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { assertDepartmentAccess, departmentScope, requireAuth } from '../middleware/auth';
import { normaliseName, slugify, toDisplayName } from '../lib/text';
import { pickAvatarColour } from '../services/imports';

export const employeeRouter = Router();
employeeRouter.use(requireAuth);

employeeRouter.get('/', async (req, res, next) => {
  try {
    const where: any = { ...departmentScope(req) };
    if (req.query.departmentId) {
      assertDepartmentAccess(req, String(req.query.departmentId));
      where.departmentId = String(req.query.departmentId);
    }
    if (req.query.q) {
      where.fullName = { contains: String(req.query.q), mode: 'insensitive' };
    }

    const employees = await prisma.employee.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
      include: {
        department: { select: { id: true, name: true, slug: true, colour: true } },
        aliases: { select: { id: true, raw: true, normalized: true } },
        _count: { select: { stats: true, badges: true } },
      },
    });

    res.json({
      employees: employees.map((e) => ({
        id: e.id,
        fullName: e.fullName,
        displayName: e.displayName,
        slug: e.slug,
        jobTitle: e.jobTitle,
        colour: e.avatarColour,
        isManager: e.isManager,
        isActive: e.isActive,
        excludeFromLeaderboard: e.excludeFromLeaderboard,
        department: e.department,
        aliases: e.aliases,
        weeksTracked: e._count.stats,
        badgeCount: e._count.badges,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  fullName: z.string().min(2).max(120),
  departmentId: z.string().min(1),
  jobTitle: z.string().max(120).nullish(),
  isManager: z.boolean().default(false),
  excludeFromLeaderboard: z.boolean().default(false),
  aliases: z.array(z.string().min(1)).default([]),
});

employeeRouter.post('/', async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    assertDepartmentAccess(req, body.departmentId);

    const fullName = body.fullName.trim();
    const clash = await prisma.employee.findFirst({
      where: { departmentId: body.departmentId, fullName },
    });
    if (clash) throw badRequest(`${fullName} is already on this department's roster.`);

    let slug = slugify(fullName);
    if (await prisma.employee.findUnique({ where: { slug } })) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const employee = await prisma.employee.create({
      data: {
        fullName,
        displayName: toDisplayName(fullName),
        slug,
        departmentId: body.departmentId,
        jobTitle: body.jobTitle ?? null,
        isManager: body.isManager,
        excludeFromLeaderboard: body.excludeFromLeaderboard,
        avatarColour: pickAvatarColour(fullName),
        aliases: {
          create: [...new Set([fullName, ...body.aliases])]
            .map((a) => ({ raw: a, normalized: normaliseName(a) }))
            .filter((a, i, arr) => a.normalized && arr.findIndex((x) => x.normalized === a.normalized) === i),
        },
      },
      include: { aliases: true },
    });

    res.status(201).json({ employee });
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  displayName: z.string().min(1).max(60).optional(),
  jobTitle: z.string().max(120).nullish(),
  avatarColour: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  isManager: z.boolean().optional(),
  excludeFromLeaderboard: z.boolean().optional(),
  isActive: z.boolean().optional(),
  departmentId: z.string().optional(),
});

employeeRouter.patch('/:id', async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!employee) throw notFound('That person is not on the roster.');
    assertDepartmentAccess(req, employee.departmentId);
    if (body.departmentId) assertDepartmentAccess(req, body.departmentId);

    const data: any = { ...body };
    if (body.fullName && body.fullName.trim() !== employee.fullName) {
      data.fullName = body.fullName.trim();
      if (!body.displayName) data.displayName = toDisplayName(data.fullName);
      // Keep the old spelling as an alias so historic imports still match.
      await prisma.employeeAlias.upsert({
        where: {
          employeeId_normalized: { employeeId: employee.id, normalized: normaliseName(employee.fullName) },
        },
        create: {
          employeeId: employee.id,
          raw: employee.fullName,
          normalized: normaliseName(employee.fullName),
        },
        update: {},
      });
    }

    const updated = await prisma.employee.update({ where: { id: employee.id }, data });
    res.json({ employee: updated });
  } catch (err) {
    next(err);
  }
});

/** Add an alternative spelling so future imports match automatically. */
employeeRouter.post('/:id/aliases', async (req, res, next) => {
  try {
    const raw = z.object({ alias: z.string().min(1).max(120) }).parse(req.body).alias.trim();
    const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!employee) throw notFound('That person is not on the roster.');
    assertDepartmentAccess(req, employee.departmentId);

    const normalized = normaliseName(raw);
    if (!normalized) throw badRequest('That alias is empty once punctuation is removed.');

    const taken = await prisma.employeeAlias.findFirst({
      where: { normalized, employee: { departmentId: employee.departmentId }, NOT: { employeeId: employee.id } },
      include: { employee: { select: { fullName: true } } },
    });
    if (taken)
      throw badRequest(`"${raw}" is already used as an alias for ${taken.employee.fullName}.`);

    const alias = await prisma.employeeAlias.upsert({
      where: { employeeId_normalized: { employeeId: employee.id, normalized } },
      create: { employeeId: employee.id, raw, normalized },
      update: { raw },
    });

    res.status(201).json({ alias });
  } catch (err) {
    next(err);
  }
});

employeeRouter.delete('/:id/aliases/:aliasId', async (req, res, next) => {
  try {
    const alias = await prisma.employeeAlias.findUnique({
      where: { id: req.params.aliasId },
      include: { employee: true },
    });
    if (!alias || alias.employeeId !== req.params.id) throw notFound('That alias does not exist.');
    assertDepartmentAccess(req, alias.employee.departmentId);

    await prisma.employeeAlias.delete({ where: { id: alias.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Merge two people who were accidentally created twice.
 * All stats, badges and aliases move to the target; the source is deleted.
 */
employeeRouter.post('/:id/merge', async (req, res, next) => {
  try {
    const { intoEmployeeId } = z.object({ intoEmployeeId: z.string().min(1) }).parse(req.body);
    if (intoEmployeeId === req.params.id) throw badRequest('Cannot merge a person into themselves.');

    const [source, target] = await Promise.all([
      prisma.employee.findUnique({ where: { id: req.params.id } }),
      prisma.employee.findUnique({ where: { id: intoEmployeeId } }),
    ]);
    if (!source || !target) throw notFound('One of those people does not exist.');
    assertDepartmentAccess(req, source.departmentId);
    assertDepartmentAccess(req, target.departmentId);
    if (source.departmentId !== target.departmentId)
      throw badRequest('Both people must be in the same department to merge.');

    await prisma.$transaction(async (tx) => {
      // A week can only hold one row per person — keep the target's row where both exist.
      const sourceStats = await tx.weekStat.findMany({ where: { employeeId: source.id } });
      const targetWeekIds = new Set(
        (await tx.weekStat.findMany({ where: { employeeId: target.id }, select: { weekId: true } })).map(
          (s) => s.weekId,
        ),
      );
      const movable = sourceStats.filter((s) => !targetWeekIds.has(s.weekId));
      const clashing = sourceStats.filter((s) => targetWeekIds.has(s.weekId));

      if (movable.length)
        await tx.weekStat.updateMany({
          where: { id: { in: movable.map((s) => s.id) } },
          data: { employeeId: target.id },
        });
      if (clashing.length)
        await tx.weekStat.deleteMany({ where: { id: { in: clashing.map((s) => s.id) } } });

      await tx.badgeAward.deleteMany({ where: { employeeId: source.id } });
      await tx.employeeAlias.updateMany({
        where: { employeeId: source.id },
        data: { employeeId: target.id },
      });
      await tx.employeeAlias.upsert({
        where: {
          employeeId_normalized: { employeeId: target.id, normalized: normaliseName(source.fullName) },
        },
        create: { employeeId: target.id, raw: source.fullName, normalized: normaliseName(source.fullName) },
        update: {},
      });
      await tx.prize.updateMany({ where: { employeeId: source.id }, data: { employeeId: target.id } });
      await tx.employee.delete({ where: { id: source.id } });
    });

    res.json({
      ok: true,
      message: `${source.fullName} merged into ${target.fullName}. Re-run "recalculate" on affected weeks to refresh badges.`,
    });
  } catch (err) {
    next(err);
  }
});

employeeRouter.delete('/:id', async (req, res, next) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { stats: true } } },
    });
    if (!employee) throw notFound('That person is not on the roster.');
    assertDepartmentAccess(req, employee.departmentId);

    if (employee._count.stats > 0) {
      // Never destroy history by accident.
      await prisma.employee.update({ where: { id: employee.id }, data: { isActive: false } });
      return res.json({
        ok: true,
        deactivated: true,
        message: `${employee.fullName} has ${employee._count.stats} weeks of history, so they were deactivated rather than deleted. Their past results remain on the leaderboard.`,
      });
    }

    await prisma.employee.delete({ where: { id: employee.id } });
    res.json({ ok: true, deactivated: false });
  } catch (err) {
    next(err);
  }
});
