import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../lib/errors';
import { verifyToken, type JwtPayload } from '../lib/auth';
import { prisma } from '../lib/prisma';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/** Requires a valid manager/admin token. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();

    let payload: JwtPayload;
    try {
      payload = verifyToken(header.slice(7));
    } catch {
      throw unauthorized('Your session has expired. Please sign in again.');
    }

    // Confirm the account still exists and is active on every request, so
    // deactivating a manager takes effect immediately rather than at token expiry.
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, role: true, departmentId: true, email: true },
    });
    if (!user || !user.isActive) throw unauthorized('This account is no longer active.');

    req.user = {
      sub: user.id,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'ADMIN')
    return next(forbidden('This action requires a company administrator account.'));
  next();
}

/**
 * Throws unless the caller may act on the given department.
 * Admins may act on any department; managers only on their own.
 */
export function assertDepartmentAccess(req: Request, departmentId: string) {
  if (!req.user) throw unauthorized();
  if (req.user.role === 'ADMIN') return;
  if (req.user.departmentId !== departmentId)
    throw forbidden('You can only manage your own department.');
}

/** Returns a Prisma where-fragment restricting results to what the caller may see. */
export function departmentScope(req: Request): { departmentId?: string } {
  if (req.user?.role === 'ADMIN') return {};
  return { departmentId: req.user?.departmentId ?? '__none__' };
}
