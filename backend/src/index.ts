import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { prisma } from './lib/prisma';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authRouter } from './routes/auth';
import { publicRouter } from './routes/public';
import { importRouter } from './routes/imports';
import { weekRouter } from './routes/weeks';
import { employeeRouter } from './routes/employees';
import { departmentRouter } from './routes/departments';
import { settingsRouter } from './routes/settings';
import { prizeRouter } from './routes/prizes';
import { userRouter } from './routes/users';

const app = express();

// Railway/Vercel sit behind a proxy; without this, rate limiting and req.ip
// see the proxy address rather than the real client.
app.set('trust proxy', 1);

// Railway's Serverless mode sleeps the service after ~10min with no outbound
// traffic — but Prisma's connection pool sends its own keepalives to Postgres,
// which counts as outbound traffic and would keep it awake forever. Dropping
// the connection after a shorter idle window lets the service actually sleep;
// Prisma reconnects lazily on the next query, so this is invisible to callers.
const IDLE_DISCONNECT_MS = 5 * 60_000;
let idleTimer: NodeJS.Timeout;
function armIdleDisconnect() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    prisma.$disconnect().catch((err) => console.error('[api] idle disconnect failed', err));
  }, IDLE_DISCONNECT_MS).unref();
}
app.use((_req, _res, next) => {
  armIdleDisconnect();
  next();
});
armIdleDisconnect();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(
  cors({
    origin(origin, callback) {
      // Allow server-to-server and same-origin requests (no Origin header).
      if (!origin) return callback(null, true);
      if (config.corsOrigins.includes(origin)) return callback(null, true);

      // Allow Vercel preview deployments for the configured projects.
      const isVercelPreview = /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin);
      if (isVercelPreview && config.corsOrigins.some((o) => o.endsWith('.vercel.app'))) {
        return callback(null, true);
      }

      return callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Generous global ceiling — protects against runaway loops, not real users.
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health',
  }),
);

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'unreachable' });
  }
});

app.get('/', (_req, res) => {
  res.json({
    name: 'Imperial Learning Leaderboard API',
    version: '1.0.0',
    docs: 'See README.md for the full endpoint reference.',
    health: '/health',
  });
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/public', publicRouter);
app.use('/api/imports', importRouter);
app.use('/api/weeks', weekRouter);
app.use('/api/employees', employeeRouter);
app.use('/api/departments', departmentRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/prizes', prizeRouter);
app.use('/api/users', userRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`[api] listening on :${config.port}  (${config.env})`);
  console.log(`[api] CORS allows: ${config.corsOrigins.join(', ')}`);
});

// Graceful shutdown so Railway deploys do not drop in-flight requests.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}

export { app };
