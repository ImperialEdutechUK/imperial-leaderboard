import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { notFound } from '../lib/errors';
import { assertDepartmentAccess, departmentScope, requireAdmin, requireAuth } from '../middleware/auth';
import { slugify } from '../lib/text';

export const departmentRouter = Router();
departmentRouter.use(requireAuth);

departmentRouter.get('/', async (req, res, next) => {
  try {
    const departments = await prisma.department.findMany({
      where: req.user!.role === 'ADMIN' ? {} : { id: req.user!.departmentId ?? '__none__' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        setting: true,
        _count: { select: { employees: true, weeks: true, users: true } },
      },
    });
    res.json({ departments });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  name: z.string().min(2).max(80),
  code: z.string().min(1).max(12).nullish(),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366F1'),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#8B5CF6'),
  icon: z.string().max(40).default('Sparkles'),
  weeklyTargetHours: z.number().positive().max(100).default(35),
  sortOrder: z.number().int().default(0),
});

departmentRouter.post('/', requireAdmin, async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const department = await prisma.department.create({
      data: {
        ...body,
        code: body.code?.toUpperCase() ?? null,
        slug: slugify(body.name),
      },
    });
    res.status(201).json({ department });
  } catch (err) {
    next(err);
  }
});

const updateSchema = createSchema.partial().extend({ isActive: z.boolean().optional() });

departmentRouter.patch('/:id', async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const dept = await prisma.department.findUnique({ where: { id: req.params.id } });
    if (!dept) throw notFound('That department does not exist.');
    assertDepartmentAccess(req, dept.id);

    // Only admins may rename a department or change its code, because both
    // affect routing of uploaded reports company-wide.
    if (req.user!.role !== 'ADMIN') {
      delete (body as any).name;
      delete (body as any).code;
      delete (body as any).isActive;
      delete (body as any).sortOrder;
    }

    const data: any = { ...body };
    if (body.name) data.slug = slugify(body.name);
    if (body.code !== undefined) data.code = body.code ? body.code.toUpperCase() : null;

    const department = await prisma.department.update({ where: { id: dept.id }, data });
    res.json({ department });
  } catch (err) {
    next(err);
  }
});

departmentRouter.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const dept = await prisma.department.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { weeks: true } } },
    });
    if (!dept) throw notFound('That department does not exist.');

    if (dept._count.weeks > 0) {
      await prisma.department.update({ where: { id: dept.id }, data: { isActive: false } });
      return res.json({
        ok: true,
        deactivated: true,
        message: `${dept.name} has ${dept._count.weeks} weeks of history, so it was hidden rather than deleted.`,
      });
    }

    await prisma.department.delete({ where: { id: dept.id } });
    res.json({ ok: true, deactivated: false });
  } catch (err) {
    next(err);
  }
});
