import { PrismaClient } from '@prisma/client';
import { config } from '../config';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: config.isProd ? ['error', 'warn'] : ['error', 'warn'],
  });

if (!config.isProd) global.__prisma = prisma;
