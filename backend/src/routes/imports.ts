/**
 * Import routes: upload -> preview -> commit.
 *
 * The uploaded file is held in memory only. Nothing is written to disk, which
 * keeps the container stateless and means an ephemeral Railway filesystem is
 * not a problem.
 */

import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { assertDepartmentAccess, requireAuth } from '../middleware/auth';
import { parseUpload } from '../parsers';
import { buildPreview, commitWeek } from '../services/imports';
import { startOfIsoWeek, toIso, utcDate } from '../lib/period';

export const importRouter = Router();
importRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
});

// Each of these does real work — file parsing, fuzzy name matching, or a
// scored department-wide write — so cap them well below the generous global
// ceiling to stop one compromised or careless account from tying up the
// single Node process for everyone.
const importLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many import requests. Please slow down and try again shortly.' },
  },
});
importRouter.use(importLimiter);

/**
 * POST /api/imports/preview
 * multipart/form-data:  file, [departmentId], [startDate], [endDate], [targetHoursOverride], [columnMap]
 *
 * Parses and matches, but writes nothing.
 */
importRouter.post('/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw badRequest('Attach a report file to upload.');

    let columnMap: Record<string, any> | undefined;
    if (req.body.columnMap) {
      try {
        columnMap = JSON.parse(req.body.columnMap);
      } catch {
        throw badRequest('columnMap must be valid JSON.');
      }
    }

    const parsed = await parseUpload(req.file.buffer, req.file.originalname, {
      columnMap,
      startDate: req.body.startDate || undefined,
      endDate: req.body.endDate || undefined,
    });

    // A manager may only import into their own department. If the file's
    // department could not be inferred, they must pick one explicitly.
    let departmentId: string | undefined = req.body.departmentId || undefined;
    if (!departmentId && parsed.inferredDepartmentCode) {
      const d = await prisma.department.findFirst({
        where: { code: parsed.inferredDepartmentCode },
        select: { id: true },
      });
      departmentId = d?.id;
    }
    if (!departmentId && req.user!.role === 'MANAGER' && req.user!.departmentId) {
      departmentId = req.user!.departmentId;
    }
    if (departmentId) assertDepartmentAccess(req, departmentId);

    const preview = await buildPreview(prisma, parsed, {
      departmentId,
      startDate: req.body.startDate || undefined,
      endDate: req.body.endDate || undefined,
      targetHoursOverride: req.body.targetHoursOverride ? Number(req.body.targetHoursOverride) : null,
    });

    res.json({
      ...preview,
      file: { name: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype },
    });
  } catch (err) {
    next(err);
  }
});

const commitSchema = z.object({
  departmentId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be yyyy-mm-dd'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sourceType: z.enum(['PDF', 'CSV', 'XLSX', 'MANUAL']).default('MANUAL'),
  sourceFile: z.string().nullish(),
  targetHoursOverride: z.number().positive().nullish(),
  note: z.string().max(280).nullish(),
  replace: z.boolean().default(false),
  publishImmediately: z.boolean().default(false),
  printedTotalSeconds: z.number().int().nullish(),
  printedAvgActivity: z.number().nullish(),
  parseWarnings: z.any().optional(),
  dayTotals: z
    .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), seconds: z.number().int().min(0) }))
    .optional(),
  rows: z
    .array(
      z.object({
        rawName: z.string().min(1),
        seconds: z.number().int().min(0),
        activityPct: z.number().min(0).max(100),
        daysWorked: z.number().int().min(0).max(7).nullish(),
        employeeId: z.string().nullish(),
        createAs: z.string().nullish(),
        skip: z.boolean().optional(),
      }),
    )
    .min(1, 'At least one row is required.'),
});

/** POST /api/imports/commit — writes the week as a DRAFT (or publishes it). */
importRouter.post('/commit', async (req, res, next) => {
  try {
    const body = commitSchema.parse(req.body);
    assertDepartmentAccess(req, body.departmentId);

    const snapped = toIso(startOfIsoWeek(utcDate(body.startDate)));

    const result = await commitWeek(prisma, {
      ...body,
      startDate: snapped,
      uploadedById: req.user!.sub,
    });

    if (body.publishImmediately) {
      await prisma.week.update({
        where: { id: result.weekId },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: body.replace ? 'WEEK_REPLACED' : 'WEEK_IMPORTED',
        entity: 'Week',
        entityId: result.weekId,
        meta: {
          rowCount: result.rowCount,
          createdEmployees: result.createdEmployees,
          published: body.publishImmediately,
        },
        ip: req.ip,
      },
    });

    res.status(201).json({
      ...result,
      status: body.publishImmediately ? 'PUBLISHED' : 'DRAFT',
      snappedToMonday: snapped !== body.startDate ? snapped : null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/imports/manual — type a week in by hand, no file.
 * Useful when Screenshot Monitor is down or for departments not yet on it.
 */
const manualSchema = commitSchema.extend({ sourceType: z.literal('MANUAL').default('MANUAL') });

importRouter.post('/manual', async (req, res, next) => {
  try {
    const body = manualSchema.parse({ ...req.body, sourceType: 'MANUAL' });
    assertDepartmentAccess(req, body.departmentId);

    const result = await commitWeek(prisma, {
      ...body,
      startDate: toIso(startOfIsoWeek(utcDate(body.startDate))),
      uploadedById: req.user!.sub,
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
