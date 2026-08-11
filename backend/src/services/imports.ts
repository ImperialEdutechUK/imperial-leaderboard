/**
 * Import pipeline.
 *
 * Two phases, deliberately separated:
 *
 *   PREVIEW  — parse the file, match names to the roster, compute what the
 *              leaderboard WOULD look like. Writes nothing to the database.
 *   COMMIT   — the manager has reviewed the preview and confirmed the name
 *              mapping; now create/update the week and its stats.
 *
 * Nothing is ever auto-published. A committed week starts as DRAFT and only
 * becomes public when a manager presses Publish. That gives a human the chance
 * to spot a bad parse before the whole department sees it.
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import { Prisma as PrismaRuntime } from '@prisma/client';
import { conflict, badRequest, notFound } from '../lib/errors';
import { normaliseName, slugify, toDisplayName } from '../lib/text';
import {
  addDays,
  isoWeekOf,
  startOfIsoWeek,
  toIso,
  utcDate,
  weekLabel,
  WORKING_DAYS_PER_WEEK,
} from '../lib/period';
import type { ParsedReport } from '../parsers/types';
import { matchNames, type RosterEntry } from './matching';
import { normaliseConfig, scoreWeek, type ScoreInput, type ScoringConfig } from './scoring';
import { evaluateBadges, type HistoryEntry } from './badges';

const AVATAR_COLOURS = [
  '#7C5CFC', '#38BDF8', '#34D399', '#FBBF24', '#F472B6',
  '#F97066', '#A78BFA', '#22D3EE', '#4ADE80', '#FB923C',
];

export function pickAvatarColour(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLOURS[h % AVATAR_COLOURS.length];
}

/** Reads the effective scoring config for a department, falling back to global. */
export async function getScoringConfig(
  prisma: PrismaClient | Prisma.TransactionClient,
  departmentId: string,
  targetHoursOverride?: number | null,
): Promise<ScoringConfig> {
  const [deptSetting, globalSetting, department] = await Promise.all([
    prisma.scoringSetting.findUnique({ where: { departmentId } }),
    prisma.scoringSetting.findFirst({ where: { departmentId: null } }),
    prisma.department.findUnique({ where: { id: departmentId } }),
  ]);

  const source = deptSetting ?? globalSetting;
  const cfg = normaliseConfig({
    ...(source
      ? {
          hoursWeight: source.hoursWeight,
          activityWeight: source.activityWeight,
          targetHours: source.targetHours,
          hoursCap: source.hoursCap,
          maxPoints: source.maxPoints,
          bonusPersonalBest: source.bonusPersonalBest,
          bonusTargetMet: source.bonusTargetMet,
          bonusHighActivity: source.bonusHighActivity,
          highActivityThreshold: source.highActivityThreshold,
          minHoursToQualify: source.minHoursToQualify,
          integrityFlagActivity: source.integrityFlagActivity,
        }
      : {}),
  });

  // Department target wins over the global setting when no department-specific
  // scoring row exists; a per-week override wins over everything.
  if (!deptSetting && department) cfg.targetHours = department.weeklyTargetHours;
  if (targetHoursOverride != null && targetHoursOverride > 0) cfg.targetHours = targetHoursOverride;

  return normaliseConfig(cfg);
}

async function loadRoster(prisma: PrismaClient, departmentId: string): Promise<RosterEntry[]> {
  const employees = await prisma.employee.findMany({
    where: { departmentId },
    include: { aliases: { select: { normalized: true } } },
  });
  return employees.map((e) => ({
    id: e.id,
    fullName: e.fullName,
    normalised: normaliseName(e.fullName),
    aliases: e.aliases.map((a) => a.normalized),
    isActive: e.isActive,
  }));
}

export interface PreviewRow {
  rawName: string;
  cleanName: string;
  employeeId: string | null;
  matchedName: string | null;
  matchMethod: string;
  confidence: number;
  suggestions: { employeeId: string; fullName: string; confidence: number }[];
  isNew: boolean;
  seconds: number;
  hours: number;
  activityPct: number;
  /** Provisional — recomputed for real at commit time. */
  projectedPoints: number;
  projectedRank: number;
  qualified: boolean;
  flags: unknown[];
}

export interface ImportPreview {
  parse: {
    source: string;
    title: string | null;
    startDate: string | null;
    endDate: string | null;
    inferredDepartmentCode: string | null;
    printedTotalSeconds: number | null;
    printedAvgActivity: number | null;
    warnings: ParsedReport['warnings'];
  };
  department: { id: string; name: string; slug: string; code: string | null } | null;
  weekExists: boolean;
  existingWeekStatus: string | null;
  scoring: ScoringConfig;
  rows: PreviewRow[];
  summary: {
    rowCount: number;
    matched: number;
    fuzzy: number;
    unmatched: number;
    totalSeconds: number;
    avgActivity: number;
  };
  dayTotals: { date: string; seconds: number }[];
}

export async function buildPreview(
  prisma: PrismaClient,
  parsed: ParsedReport,
  opts: { departmentId?: string; startDate?: string; endDate?: string; targetHoursOverride?: number | null },
): Promise<ImportPreview> {
  // ── Resolve the department ────────────────────────────────────────────────
  let department = null as null | { id: string; name: string; slug: string; code: string | null };

  if (opts.departmentId) {
    const d = await prisma.department.findUnique({ where: { id: opts.departmentId } });
    if (!d) throw notFound('That department does not exist.');
    department = { id: d.id, name: d.name, slug: d.slug, code: d.code };
  } else if (parsed.inferredDepartmentCode) {
    const d = await prisma.department.findFirst({
      where: { code: parsed.inferredDepartmentCode },
    });
    if (d) department = { id: d.id, name: d.name, slug: d.slug, code: d.code };
  }

  // ── Resolve the week ──────────────────────────────────────────────────────
  const startIso = opts.startDate ?? parsed.startDate;
  const endIso = opts.endDate ?? parsed.endDate;

  let weekExists = false;
  let existingWeekStatus: string | null = null;
  if (department && startIso) {
    const existing = await prisma.week.findUnique({
      where: { departmentId_startDate: { departmentId: department.id, startDate: utcDate(startIso) } },
      select: { status: true },
    });
    if (existing) {
      weekExists = true;
      existingWeekStatus = existing.status;
    }
  }

  const scoring = department
    ? await getScoringConfig(prisma, department.id, opts.targetHoursOverride)
    : normaliseConfig({});

  // ── Match names ───────────────────────────────────────────────────────────
  const roster = department ? await loadRoster(prisma, department.id) : [];
  const matches = matchNames(parsed.employees.map((e) => e.rawName), roster);

  // ── Provisional scoring (uses temporary ids for unmatched people) ─────────
  const scoreInputs: ScoreInput[] = parsed.employees.map((e, i) => ({
    employeeId: matches[i].employeeId ?? `new:${i}`,
    rawName: e.rawName,
    seconds: e.seconds,
    activityPct: e.activityPct,
    daysWorked: e.daysWorked ?? null,
  }));
  const scored = scoreWeek(scoreInputs, scoring);
  const scoreByKey = new Map(scored.map((s) => [s.employeeId, s]));

  const rows: PreviewRow[] = parsed.employees.map((e, i) => {
    const m = matches[i];
    const s = scoreByKey.get(m.employeeId ?? `new:${i}`)!;
    return {
      rawName: e.rawName,
      cleanName: e.cleanName,
      employeeId: m.employeeId,
      matchedName: m.matchedName,
      matchMethod: m.method,
      confidence: m.confidence,
      suggestions: m.suggestions,
      isNew: m.employeeId === null,
      seconds: e.seconds,
      hours: Math.round((e.seconds / 3600) * 100) / 100,
      activityPct: e.activityPct,
      projectedPoints: s.points,
      projectedRank: s.rank,
      qualified: s.qualified,
      flags: s.flags,
    };
  });

  const totalSeconds = parsed.employees.reduce((sum, e) => sum + e.seconds, 0);
  const avgActivity =
    parsed.employees.length > 0
      ? Math.round(
          (parsed.employees.reduce((s, e) => s + e.activityPct, 0) / parsed.employees.length) * 100,
        ) / 100
      : 0;

  return {
    parse: {
      source: parsed.source,
      title: parsed.title,
      startDate: startIso,
      endDate: endIso,
      inferredDepartmentCode: parsed.inferredDepartmentCode,
      printedTotalSeconds: parsed.printedTotalSeconds,
      printedAvgActivity: parsed.printedAvgActivity,
      warnings: parsed.warnings,
    },
    department,
    weekExists,
    existingWeekStatus,
    scoring,
    rows,
    summary: {
      rowCount: rows.length,
      matched: rows.filter((r) => r.matchMethod === 'ALIAS' || r.matchMethod === 'EXACT').length,
      fuzzy: rows.filter((r) => r.matchMethod === 'FUZZY').length,
      unmatched: rows.filter((r) => r.employeeId === null).length,
      totalSeconds,
      avgActivity,
    },
    dayTotals: parsed.dayTotals,
  };
}

// ── Commit ───────────────────────────────────────────────────────────────────

export interface CommitRow {
  rawName: string;
  seconds: number;
  activityPct: number;
  daysWorked?: number | null;
  /** Existing employee to attach this row to. */
  employeeId?: string | null;
  /** Create a new employee with this name instead. */
  createAs?: string | null;
  /** Skip this row entirely. */
  skip?: boolean;
}

export interface CommitInput {
  departmentId: string;
  startDate: string;
  endDate?: string;
  sourceType: 'PDF' | 'CSV' | 'XLSX' | 'MANUAL' | 'API';
  sourceFile?: string | null;
  targetHoursOverride?: number | null;
  note?: string | null;
  rows: CommitRow[];
  dayTotals?: { date: string; seconds: number }[];
  printedTotalSeconds?: number | null;
  printedAvgActivity?: number | null;
  parseWarnings?: unknown;
  uploadedById?: string | null;
  /** Overwrite an existing week for this department. */
  replace?: boolean;
}

export async function commitWeek(prisma: PrismaClient, input: CommitInput) {
  const start = startOfIsoWeek(utcDate(input.startDate));
  const end = input.endDate ? utcDate(input.endDate) : addDays(start, 6);

  if (toIso(start) !== input.startDate) {
    // Not fatal — we simply snap to the Monday and tell the caller.
  }

  const usable = input.rows.filter((r) => !r.skip);
  if (usable.length === 0) throw badRequest('There are no rows to import.');

  const scoring = await getScoringConfig(prisma, input.departmentId, input.targetHoursOverride);
  const { isoYear, isoWeek } = isoWeekOf(start);

  return prisma.$transaction(
    async (tx) => {
      // Serialize every commit/recalculation for this department. Two managers
      // importing at the same time (or a re-import racing a retroactive
      // recalculation) would otherwise both read "week doesn't exist yet" or
      // both read a stale set of WeekStat rows and clobber each other's
      // writes. The lock is held for the lifetime of this transaction and
      // released automatically on commit/rollback.
      await departmentCommitLock(tx, input.departmentId);

      const existing = await tx.week.findUnique({
        where: { departmentId_startDate: { departmentId: input.departmentId, startDate: start } },
      });
      if (existing && !input.replace) {
        throw conflict(
          `A week starting ${toIso(start)} already exists for this department (currently ${existing.status.toLowerCase()}). ` +
            'Re-import with "replace" enabled to overwrite it.',
          { weekId: existing.id, status: existing.status },
        );
      }

      return performCommit(tx, input, existing, scoring, start, end, isoYear, isoWeek);
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

/** Serializes all writers for a department behind a transaction-scoped Postgres advisory lock. */
async function departmentCommitLock(tx: Prisma.TransactionClient, departmentId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${departmentId})::bigint)`;
}

async function performCommit(
  tx: Prisma.TransactionClient,
  input: CommitInput,
  existing: { id: string } | null,
  scoring: ScoringConfig,
  start: Date,
  end: Date,
  isoYear: number,
  isoWeek: number,
) {
  const usable = input.rows.filter((r) => !r.skip);
  {
    // ── 1. Resolve every row to a real employee id ────────────────────────
      const resolved: { employeeId: string; row: CommitRow }[] = [];

      for (const row of usable) {
        let employeeId = row.employeeId ?? null;

        if (!employeeId) {
          const fullName = (row.createAs ?? row.rawName).replace(/\s*\([^)]*\)\s*$/, '').trim();
          if (!fullName) continue;

          // Resolve inside the transaction before creating anyone. Three lookups,
          // cheapest first. The ALIAS lookup matters: a report that says
          // "Sadeev (CDD)" must land on the roster entry "Sadeev Silva" rather
          // than silently creating a second person called "Sadeev".
          const normalizedRaw = normaliseName(row.rawName);
          const normalizedFull = normaliseName(fullName);

          const byAlias = await tx.employeeAlias.findFirst({
            where: {
              normalized: { in: [...new Set([normalizedRaw, normalizedFull])].filter(Boolean) },
              employee: { departmentId: input.departmentId },
            },
            select: { employeeId: true },
          });

          const existingEmp =
            (byAlias ? { id: byAlias.employeeId } : null) ??
            (await tx.employee.findFirst({
              where: { departmentId: input.departmentId, fullName },
              select: { id: true },
            }));

          if (existingEmp) {
            employeeId = existingEmp.id;
          } else {
            let slug = slugify(fullName);
            if (await tx.employee.findUnique({ where: { slug } })) {
              slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
            }
            try {
              const created = await tx.employee.create({
                data: {
                  fullName,
                  displayName: toDisplayName(fullName),
                  slug,
                  departmentId: input.departmentId,
                  avatarColour: pickAvatarColour(fullName),
                },
              });
              employeeId = created.id;
            } catch (err) {
              // The department is locked for the whole commit, so this can only be
              // the globally-unique slug colliding with a same-named person created
              // in a *different* department in the same instant. Retry once with a
              // fresh random suffix instead of failing the whole import.
              if (err instanceof PrismaRuntime.PrismaClientKnownRequestError && err.code === 'P2002') {
                const created = await tx.employee.create({
                  data: {
                    fullName,
                    displayName: toDisplayName(fullName),
                    slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
                    departmentId: input.departmentId,
                    avatarColour: pickAvatarColour(fullName),
                  },
                });
                employeeId = created.id;
              } else {
                throw err;
              }
            }
          }
        }

        // Remember this spelling so next week's import matches it instantly.
        const normalized = normaliseName(row.rawName);
        if (normalized) {
          await tx.employeeAlias.upsert({
            where: { employeeId_normalized: { employeeId, normalized } },
            create: { employeeId, normalized, raw: row.rawName },
            update: {},
          });
        }

        resolved.push({ employeeId, row });
      }

      // Two source rows resolving to the same person would violate the unique
      // constraint — merge them rather than failing the whole import.
      const merged = new Map<string, { employeeId: string; row: CommitRow }>();
      for (const r of resolved) {
        const prev = merged.get(r.employeeId);
        if (!prev) {
          merged.set(r.employeeId, { ...r, row: { ...r.row } });
        } else {
          const total = prev.row.seconds + r.row.seconds;
          prev.row.activityPct =
            total > 0
              ? (prev.row.activityPct * prev.row.seconds + r.row.activityPct * r.row.seconds) / total
              : r.row.activityPct;
          prev.row.seconds = total;
        }
      }

      // ── 2. Historical context for personal bests and rank movement ────────
      const employeeIds = [...merged.keys()];

      const priorWeek = await tx.week.findFirst({
        where: {
          departmentId: input.departmentId,
          startDate: { lt: start },
          status: { in: ['PUBLISHED', 'ARCHIVED'] },
        },
        orderBy: { startDate: 'desc' },
        select: { id: true },
      });

      const priorRanks = new Map<string, number>();
      if (priorWeek) {
        const prev = await tx.weekStat.findMany({
          where: { weekId: priorWeek.id, employeeId: { in: employeeIds } },
          select: { employeeId: true, rank: true },
        });
        for (const p of prev) priorRanks.set(p.employeeId, p.rank);
      }

      const pastStats = await tx.weekStat.findMany({
        where: {
          employeeId: { in: employeeIds },
          week: { departmentId: input.departmentId, startDate: { lt: start }, status: { in: ['PUBLISHED', 'ARCHIVED'] } },
        },
        select: {
          employeeId: true,
          points: true,
          rank: true,
          seconds: true,
          week: { select: { startDate: true } },
        },
        orderBy: { week: { startDate: 'desc' } },
      });

      const personalBest = new Map<string, number>();
      const lifetimePoints = new Map<string, number>();
      const history = new Map<string, HistoryEntry[]>();

      for (const s of pastStats) {
        personalBest.set(s.employeeId, Math.max(personalBest.get(s.employeeId) ?? 0, s.points));
        lifetimePoints.set(s.employeeId, (lifetimePoints.get(s.employeeId) ?? 0) + s.points);
        const list = history.get(s.employeeId) ?? [];
        list.push({
          weekStart: toIso(s.week.startDate),
          rank: s.rank,
          points: s.points,
          qualified: true,
          targetMet: s.seconds / 3600 >= scoring.targetHours,
        });
        history.set(s.employeeId, list);
      }

      // ── 3. Score ──────────────────────────────────────────────────────────
      const scoreInputs: ScoreInput[] = [...merged.values()].map(({ employeeId, row }) => ({
        employeeId,
        rawName: row.rawName,
        seconds: Math.max(0, Math.round(row.seconds)),
        activityPct: Math.max(0, Math.min(100, row.activityPct)),
        daysWorked: row.daysWorked ?? null,
        previousBest: personalBest.get(employeeId) ?? null,
        previousRank: priorRanks.get(employeeId) ?? null,
      }));

      const scored = scoreWeek(scoreInputs, scoring);

      // ── 4. Persist the week ───────────────────────────────────────────────
      if (existing) {
        await tx.weekStat.deleteMany({ where: { weekId: existing.id } });
        await tx.dayTotal.deleteMany({ where: { weekId: existing.id } });
        await tx.badgeAward.deleteMany({ where: { weekId: existing.id } });
      }

      const weekData = {
        departmentId: input.departmentId,
        startDate: start,
        endDate: end,
        isoYear,
        isoWeek,
        label: weekLabel(start, end),
        sourceType: input.sourceType,
        sourceFile: input.sourceFile ?? null,
        targetHoursOverride: input.targetHoursOverride ?? null,
        note: input.note ?? null,
        reportTotalSeconds: input.printedTotalSeconds ?? null,
        reportAvgActivity: input.printedAvgActivity ?? null,
        parseWarnings: (input.parseWarnings ?? null) as Prisma.InputJsonValue,
        scoringSnapshot: scoring as unknown as Prisma.InputJsonValue,
        uploadedById: input.uploadedById ?? null,
      };

      const week = existing
        ? await tx.week.update({ where: { id: existing.id }, data: weekData })
        : await tx.week.create({ data: { ...weekData, status: 'DRAFT' } });

      await tx.weekStat.createMany({
        data: scored.map((s) => ({
          weekId: week.id,
          employeeId: s.employeeId,
          rawName: s.rawName,
          seconds: s.seconds,
          activityPct: s.activityPct,
          hoursScore: s.hoursScore,
          activityScore: s.activityScore,
          basePoints: s.basePoints,
          bonusPoints: s.bonusPoints,
          points: s.points,
          rank: s.rank,
          previousRank: s.previousRank,
          rankDelta: s.rankDelta,
          isPersonalBest: s.isPersonalBest,
          daysWorked: s.daysWorked,
          flags: s.flags as unknown as Prisma.InputJsonValue,
          bonusBreakdown: s.bonusBreakdown as unknown as Prisma.InputJsonValue,
        })),
      });

      if (input.dayTotals?.length) {
        await tx.dayTotal.createMany({
          data: input.dayTotals.map((d) => ({
            weekId: week.id,
            date: utcDate(d.date),
            seconds: Math.max(0, Math.round(d.seconds)),
          })),
          skipDuplicates: true,
        });
      }

      // ── 5. Badges ─────────────────────────────────────────────────────────
      const drafts = evaluateBadges({
        rows: scored,
        history,
        lifetimePoints,
        targetHours: scoring.targetHours,
        workingDays: WORKING_DAYS_PER_WEEK,
      });

      if (drafts.length) {
        const defs = await tx.badgeDefinition.findMany({
          where: { key: { in: [...new Set(drafts.map((d) => d.badgeKey))] }, isActive: true },
          select: { id: true, key: true },
        });
        const defByKey = new Map(defs.map((d) => [d.key, d.id]));
        const rowsToInsert = drafts
          .filter((d) => defByKey.has(d.badgeKey))
          .map((d) => ({
            employeeId: d.employeeId,
            badgeId: defByKey.get(d.badgeKey)!,
            weekId: week.id,
            context: d.context as Prisma.InputJsonValue,
          }));
        if (rowsToInsert.length) {
          await tx.badgeAward.createMany({ data: rowsToInsert, skipDuplicates: true });
        }
      }

      return {
        weekId: week.id,
        status: week.status,
        label: week.label,
        startDate: toIso(start),
        endDate: toIso(end),
        rowCount: scored.length,
        badgesAwarded: drafts.length,
        createdEmployees: usable.filter((r) => !r.employeeId).length,
      };
  }
}

/**
 * Re-scores an existing week in place. Used after a manager edits the scoring
 * settings and asks to apply them retroactively, or after fixing a bad row.
 *
 * Runs under the same per-department advisory lock as commitWeek, and reads
 * the week + its stats only *after* acquiring that lock — otherwise two
 * concurrent recalculations (or a recalculation racing a re-import) could
 * each work off a stale snapshot and silently overwrite one another's edit.
 */
export async function recalculateWeek(prisma: PrismaClient, weekId: string) {
  const weekMeta = await prisma.week.findUnique({ where: { id: weekId }, select: { departmentId: true } });
  if (!weekMeta) throw notFound('That week does not exist.');

  return prisma.$transaction(
    async (tx) => {
      await departmentCommitLock(tx, weekMeta.departmentId);

      const week = await tx.week.findUnique({ where: { id: weekId }, include: { stats: true } });
      if (!week) throw notFound('That week does not exist.');

      const scoring = await getScoringConfig(tx, week.departmentId, week.targetHoursOverride);
      const start = startOfIsoWeek(utcDate(toIso(week.startDate)));
      const end = week.endDate;
      const { isoYear, isoWeek } = isoWeekOf(start);

      const input: CommitInput = {
        departmentId: week.departmentId,
        startDate: toIso(week.startDate),
        endDate: toIso(week.endDate),
        sourceType: week.sourceType,
        sourceFile: week.sourceFile,
        targetHoursOverride: week.targetHoursOverride,
        note: week.note,
        printedTotalSeconds: week.reportTotalSeconds,
        printedAvgActivity: week.reportAvgActivity,
        parseWarnings: week.parseWarnings,
        uploadedById: week.uploadedById,
        replace: true,
        rows: week.stats.map((s) => ({
          rawName: s.rawName,
          seconds: s.seconds,
          activityPct: s.activityPct,
          daysWorked: s.daysWorked,
          employeeId: s.employeeId,
        })),
      };

      return performCommit(tx, input, week, scoring, start, end, isoYear, isoWeek);
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}
