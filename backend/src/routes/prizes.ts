import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { assertDepartmentAccess, departmentScope, requireAuth } from '../middleware/auth';
import { getMonthlyStandings, listMonths } from '../services/leaderboard';
import { monthLabel } from '../lib/period';

export const prizeRouter = Router();
prizeRouter.use(requireAuth);

prizeRouter.get('/', async (req, res, next) => {
  try {
    const where: any = { ...departmentScope(req) };
    if (req.query.departmentId) {
      assertDepartmentAccess(req, String(req.query.departmentId));
      where.departmentId = String(req.query.departmentId);
    }
    const prizes = await prisma.prize.findMany({
      where,
      orderBy: [{ periodKey: 'desc' }, { createdAt: 'desc' }],
      include: {
        employee: { select: { id: true, fullName: true, slug: true, avatarColour: true } },
        department: { select: { id: true, name: true, slug: true, colour: true } },
      },
    });
    res.json({ prizes });
  } catch (err) {
    next(err);
  }
});

/** Available months plus who is currently on top of each. */
prizeRouter.get('/candidates', async (req, res, next) => {
  try {
    const departmentId = String(req.query.departmentId ?? req.user!.departmentId ?? '');
    if (!departmentId) throw badRequest('departmentId is required.');
    assertDepartmentAccess(req, departmentId);

    const months = await listMonths(prisma, departmentId);
    const monthKeyValue = String(req.query.month ?? months[0]?.key ?? '');
    if (!monthKeyValue) return res.json({ months: [], monthKey: null, standings: [], existingPrize: null });

    const standings = await getMonthlyStandings(prisma, departmentId, monthKeyValue);
    const existingPrize = await prisma.prize.findFirst({
      where: { departmentId, periodType: 'MONTH', periodKey: monthKeyValue },
      include: { employee: { select: { fullName: true, slug: true } } },
    });

    res.json({ months, ...standings, existingPrize });
  } catch (err) {
    next(err);
  }
});

const awardSchema = z.object({
  departmentId: z.string().min(1),
  periodType: z.enum(['WEEK', 'MONTH', 'QUARTER', 'YEAR', 'CUSTOM']).default('MONTH'),
  periodKey: z.string().min(4).max(20),
  employeeId: z.string().min(1),
  title: z.string().min(2).max(120).optional(),
  description: z.string().max(500).nullish(),
  reward: z.string().max(160).nullish(),
  pointsTotal: z.number().nullish(),
});

prizeRouter.post('/', async (req, res, next) => {
  try {
    const body = awardSchema.parse(req.body);
    assertDepartmentAccess(req, body.departmentId);

    const employee = await prisma.employee.findUnique({ where: { id: body.employeeId } });
    if (!employee) throw notFound('That person is not on the roster.');
    if (employee.departmentId !== body.departmentId)
      throw badRequest('That person is not in the department you are awarding for.');

    const title =
      body.title ??
      (body.periodType === 'MONTH'
        ? `${monthLabel(body.periodKey)} Champion`
        : `${body.periodKey} Champion`);

    // Compute the points total at award time so the record is self-contained.
    let pointsTotal = body.pointsTotal ?? null;
    if (pointsTotal == null && body.periodType === 'MONTH') {
      const standings = await getMonthlyStandings(prisma, body.departmentId, body.periodKey);
      pointsTotal = standings.standings.find((s) => s.employee.id === body.employeeId)?.points ?? null;
    }

    const prize = await prisma.prize.upsert({
      where: {
        departmentId_periodType_periodKey_title: {
          departmentId: body.departmentId,
          periodType: body.periodType,
          periodKey: body.periodKey,
          title,
        },
      },
      create: {
        departmentId: body.departmentId,
        periodType: body.periodType,
        periodKey: body.periodKey,
        title,
        description: body.description ?? null,
        reward: body.reward ?? null,
        employeeId: body.employeeId,
        pointsTotal,
        isAutomatic: false,
        awardedAt: new Date(),
      },
      update: {
        employeeId: body.employeeId,
        description: body.description ?? null,
        reward: body.reward ?? null,
        pointsTotal,
        awardedAt: new Date(),
      },
      include: { employee: { select: { fullName: true, slug: true } } },
    });

    // Give the winner the Monthly Champion badge. Postgres treats NULL weekId
    // values as distinct from one another, so the DB's unique constraint on
    // (employeeId, badgeId, weekId) does not actually stop two concurrent
    // awards of this lifetime badge from both landing — lock per
    // employee+badge so the check-then-create below can't race (e.g. two
    // admins confirming the same champion at once).
    if (body.periodType === 'MONTH') {
      const badge = await prisma.badgeDefinition.findUnique({ where: { key: 'MONTHLY_CHAMPION' } });
      if (badge) {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${body.employeeId + ':' + badge.id})::bigint)`;
          const existing = await tx.badgeAward.findFirst({
            where: { employeeId: body.employeeId, badgeId: badge.id, weekId: null },
          });
          if (!existing) {
            await tx.badgeAward.create({
              data: {
                employeeId: body.employeeId,
                badgeId: badge.id,
                context: { periodKey: body.periodKey, pointsTotal },
              },
            });
          }
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'PRIZE_AWARDED',
        entity: 'Prize',
        entityId: prize.id,
        meta: { periodKey: body.periodKey, employeeId: body.employeeId } as any,
        ip: req.ip,
      },
    });

    res.status(201).json({ prize });
  } catch (err) {
    next(err);
  }
});

prizeRouter.delete('/:id', async (req, res, next) => {
  try {
    const prize = await prisma.prize.findUnique({ where: { id: req.params.id } });
    if (!prize) throw notFound('That prize does not exist.');
    // Fail closed: a department-scoped prize is checked normally; a
    // company-wide prize (no departmentId — not creatable today, but the
    // schema allows it) can only be deleted by an admin rather than skipping
    // the check entirely.
    if (prize.departmentId) {
      assertDepartmentAccess(req, prize.departmentId);
    } else if (req.user!.role !== 'ADMIN') {
      throw forbidden('Only an administrator can delete a company-wide prize.');
    }

    await prisma.prize.delete({ where: { id: prize.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
