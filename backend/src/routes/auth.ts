import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { hashPassword, signToken, validatePassword, verifyPassword } from '../lib/auth';
import { badRequest, unauthorized } from '../lib/errors';
import { requireAuth } from '../middleware/auth';

export const authRouter = Router();

/** Slows down credential stuffing without locking out a manager who fat-fingers once. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many sign-in attempts. Please wait 15 minutes and try again.',
    },
  },
});

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { department: true },
    });

    // Always run a hash comparison so the response time does not reveal
    // whether the email exists.
    const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu';
    const ok = await verifyPassword(password, hash);

    if (!user || !ok || !user.isActive) {
      throw unauthorized('Those sign-in details were not recognised.');
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const token = signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        department: user.department
          ? { id: user.department.id, name: user.department.name, slug: user.department.slug }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      include: { department: true },
    });
    if (!user) throw unauthorized();
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        lastLoginAt: user.lastLoginAt,
        department: user.department
          ? { id: user.department.id, name: user.department.name, slug: user.department.slug }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

authRouter.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) throw unauthorized();

    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw badRequest('Your current password is not correct.');
    }
    const problem = validatePassword(newPassword);
    if (problem) throw badRequest(problem);
    if (await verifyPassword(newPassword, user.passwordHash)) {
      throw badRequest('Your new password must be different from your current one.');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
    });

    res.json({ ok: true, message: 'Password updated.' });
  } catch (err) {
    next(err);
  }
});
