import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { assertDepartmentAccess, requireAdmin, requireAuth } from '../middleware/auth';
import { DEFAULT_SCORING, maxAchievablePoints, normaliseConfig, scoreOne } from '../services/scoring';
import { getScoringConfig, recalculateWeek } from '../services/imports';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

/** GET /api/settings/scoring?departmentId=… */
settingsRouter.get('/scoring', async (req, res, next) => {
  try {
    const departmentId = req.query.departmentId ? String(req.query.departmentId) : null;
    if (departmentId) assertDepartmentAccess(req, departmentId);

    const [deptSetting, globalSetting] = await Promise.all([
      departmentId ? prisma.scoringSetting.findUnique({ where: { departmentId } }) : null,
      prisma.scoringSetting.findFirst({ where: { departmentId: null } }),
    ]);

    const effective = departmentId
      ? await getScoringConfig(prisma, departmentId)
      : normaliseConfig(globalSetting ?? {});

    res.json({
      defaults: DEFAULT_SCORING,
      global: globalSetting,
      department: deptSetting,
      /** What is actually applied right now, after all fallbacks. */
      effective,
      maxAchievablePoints: maxAchievablePoints(effective),
      usingGlobalFallback: !!departmentId && !deptSetting,
    });
  } catch (err) {
    next(err);
  }
});

const scoringSchema = z.object({
  departmentId: z.string().nullish(),
  hoursWeight: z.number().min(0).max(1),
  activityWeight: z.number().min(0).max(1),
  targetHours: z.number().positive().max(100),
  hoursCap: z.number().min(1).max(3),
  maxPoints: z.number().int().min(10).max(100_000),
  bonusPersonalBest: z.number().min(0).max(500),
  bonusTargetMet: z.number().min(0).max(500),
  bonusHighActivity: z.number().min(0).max(500),
  highActivityThreshold: z.number().min(0).max(100),
  minHoursToQualify: z.number().min(0).max(80),
  integrityFlagActivity: z.number().min(50).max(100),
  /** Re-score every existing week with the new settings. */
  applyRetroactively: z.boolean().default(false),
});

settingsRouter.put('/scoring', async (req, res, next) => {
  try {
    const body = scoringSchema.parse(req.body);
    const departmentId = body.departmentId ?? null;

    if (departmentId) assertDepartmentAccess(req, departmentId);
    else if (req.user!.role !== 'ADMIN')
      throw badRequest('Only a company administrator can change the company-wide default scoring.');

    if (Math.abs(body.hoursWeight + body.activityWeight - 1) > 0.001) {
      throw badRequest(
        `The hours weight (${body.hoursWeight}) and activity weight (${body.activityWeight}) must add up to exactly 1. ` +
          `They currently add up to ${(body.hoursWeight + body.activityWeight).toFixed(3)}.`,
      );
    }

    const { applyRetroactively, departmentId: _d, ...values } = body;

    const setting = departmentId
      ? await prisma.scoringSetting.upsert({
          where: { departmentId },
          create: { ...values, departmentId },
          update: values,
        })
      : await (async () => {
          const existing = await prisma.scoringSetting.findFirst({ where: { departmentId: null } });
          return existing
            ? prisma.scoringSetting.update({ where: { id: existing.id }, data: values })
            : prisma.scoringSetting.create({ data: { ...values, departmentId: null } });
        })();

    let recalculated = 0;
    if (applyRetroactively) {
      const weeks = await prisma.week.findMany({
        where: departmentId ? { departmentId } : {},
        select: { id: true },
        orderBy: { startDate: 'asc' },
      });
      for (const w of weeks) {
        await recalculateWeek(prisma, w.id);
        recalculated++;
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'SCORING_UPDATED',
        entity: 'ScoringSetting',
        entityId: setting.id,
        meta: { ...values, applyRetroactively, recalculated } as any,
        ip: req.ip,
      },
    });

    res.json({ setting, recalculated });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/settings/scoring/preview
 * Try weights against sample numbers without saving. Powers the live
 * "what would this do to the table?" slider on the settings screen.
 */
const previewSchema = z.object({
  config: scoringSchema.omit({ departmentId: true, applyRetroactively: true }).partial(),
  rows: z
    .array(z.object({ name: z.string(), hours: z.number().min(0), activityPct: z.number().min(0).max(100) }))
    .min(1)
    .max(200),
});

settingsRouter.post('/scoring/preview', async (req, res, next) => {
  try {
    const { config, rows } = previewSchema.parse(req.body);
    const cfg = normaliseConfig(config);

    const scored = rows
      .map((r) => {
        const s = scoreOne(
          {
            employeeId: r.name,
            rawName: r.name,
            seconds: Math.round(r.hours * 3600),
            activityPct: r.activityPct,
          },
          cfg,
        );
        return { ...s, name: r.name, hours: r.hours, activityPct: r.activityPct };
      })
      .sort((a, b) => (a.qualified === b.qualified ? b.points - a.points : a.qualified ? -1 : 1))
      .map((r, i) => ({ ...r, rank: i + 1 }));

    res.json({ config: cfg, maxAchievablePoints: maxAchievablePoints(cfg), rows: scored });
  } catch (err) {
    next(err);
  }
});

/** Site-wide key/value settings (hero copy, prize blurb, etc.). */
settingsRouter.get('/app', async (_req, res, next) => {
  try {
    const rows = await prisma.appSetting.findMany();
    res.json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
  } catch (err) {
    next(err);
  }
});

settingsRouter.put('/app', requireAdmin, async (req, res, next) => {
  try {
    const body = z.record(z.string(), z.any()).parse(req.body);
    for (const [key, value] of Object.entries(body)) {
      await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
    const rows = await prisma.appSetting.findMany();
    res.json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
  } catch (err) {
    next(err);
  }
});
