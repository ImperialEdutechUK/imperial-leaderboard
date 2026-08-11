import 'dotenv/config';
import { randomBytes } from 'crypto';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProd,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),

  jwtSecret: (() => {
    const secret = process.env.JWT_SECRET ?? '';
    // Checked unconditionally, not just when NODE_ENV === 'production': some
    // hosts (Railway included) don't set NODE_ENV unless you configure it
    // yourself, and a gate keyed on that would silently let a deployed,
    // internet-facing service fall back to a hardcoded, publicly-known
    // secret, letting anyone forge a valid manager/admin token.
    if (secret.length < 32 || secret.includes('change-me')) {
      if (!isProd && !secret) {
        // Only local/dev runs (no NODE_ENV=production, no secret configured
        // at all) get a fallback, and it's unique per-process so restarting
        // still invalidates old tokens rather than reusing one fixed string.
        return randomBytes(48).toString('base64');
      }
      throw new Error(
        'JWT_SECRET must be set to a strong random value (>= 32 chars). ' +
          'Generate one with: openssl rand -base64 48',
      );
    }
    return secret;
  })(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',

  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  publicSiteUrl: process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000',

  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB ?? 15) * 1024 * 1024,

  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com',
    adminPassword: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!2026',
    adminName: process.env.SEED_ADMIN_NAME ?? 'Administrator',
    sampleWeek: (process.env.SEED_SAMPLE_WEEK ?? 'true') === 'true',
  },
};
