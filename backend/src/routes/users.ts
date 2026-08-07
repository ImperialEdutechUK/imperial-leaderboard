import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { hashPassword, validatePassword } from '../lib/auth';

export const userRouter = Router();
userRouter.use(requireAuth, requireAdmin);

userRouter.get('/', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true,
        department: { select: { id: true, name: true, slug: true, colour: true } },
      },
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(10),
  role: z.enum(['ADMIN', 'MANAGER']).default('MANAGER'),
  departmentId: z.string().nullish(),
});

userRouter.post('/', async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const problem = validatePassword(body.password);
    if (problem) throw badRequest(problem);

    if (body.role === 'MANAGER' && !body.departmentId)
      throw badRequest('A manager must be assigned to a department.');

    const email = body.email.toLowerCase().trim();
    if (await prisma.user.findUnique({ where: { email } }))
      throw badRequest('An account with that email address already exists.');

    const user = await prisma.user.create({
      data: {
        name: body.name.trim(),
        email,
        role: body.role,
        departmentId: body.role === 'ADMIN' ? (body.departmentId ?? null) : body.departmentId!,
        passwordHash: await hashPassword(body.password),
        mustChangePassword: true,
      },
      select: { id: true, name: true, email: true, role: true, departmentId: true },
    });

    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  role: z.enum(['ADMIN', 'MANAGER']).optional(),
  departmentId: z.string().nullish(),
  isActive: z.boolean().optional(),
  password: z.string().min(10).optional(),
});

userRouter.patch('/:id', async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw notFound('That account does not exist.');

    // Guard against locking everyone out.
    if (target.id === req.user!.sub) {
      if (body.isActive === false) throw badRequest('You cannot deactivate your own account.');
      if (body.role && body.role !== 'ADMIN')
        throw badRequest('You cannot remove your own administrator access.');
    }
    if (target.role === 'ADMIN' && (body.role === 'MANAGER' || body.isActive === false)) {
      const activeAdmins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (activeAdmins <= 1)
        throw badRequest('This is the last active administrator account. Create another one first.');
    }

    const data: any = { ...body };
    if (body.password) {
      const problem = validatePassword(body.password);
      if (problem) throw badRequest(problem);
      data.passwordHash = await hashPassword(body.password);
      data.mustChangePassword = true;
      delete data.password;
    }

    const user = await prisma.user.update({
      where: { id: target.id },
      data,
      select: { id: true, name: true, email: true, role: true, isActive: true, departmentId: true },
    });

    res.json({ user });
  } catch (err) {
    next(err);
  }
});

userRouter.delete('/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.user!.sub) throw badRequest('You cannot delete your own account.');
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw notFound('That account does not exist.');

    if (target.role === 'ADMIN') {
      const activeAdmins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (activeAdmins <= 1) throw badRequest('This is the last administrator account.');
    }

    await prisma.user.update({ where: { id: target.id }, data: { isActive: false } });
    res.json({ ok: true, message: 'Account deactivated. History and audit trail are preserved.' });
  } catch (err) {
    next(err);
  }
});

/** Recent activity, for the admin dashboard. */
userRouter.get('/audit-log', async (req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(req.query.limit ?? 100), 500),
      include: { user: { select: { name: true, email: true } } },
    });
    res.json({ logs });
  } catch (err) {
    next(err);
  }
});
