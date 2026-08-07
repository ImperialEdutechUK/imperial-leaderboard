import 'dotenv/config';

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
    if (isProd && (secret.length < 32 || secret.includes('change-me'))) {
      throw new Error(
        'JWT_SECRET must be set to a strong random value (>= 32 chars) in production. ' +
          'Generate one with: openssl rand -base64 48',
      );
    }
    return secret || 'dev-only-insecure-secret-do-not-use-in-production';
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
