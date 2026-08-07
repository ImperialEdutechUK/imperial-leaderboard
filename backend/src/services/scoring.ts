/**
 * The scoring engine.
 *
 * ── The formula ──────────────────────────────────────────────────────────────
 *
 *   hoursScore    = min(hoursWorked / targetHours, hoursCap) / hoursCap
 *   activityScore = activityPct / 100
 *   basePoints    = maxPoints × (hoursWeight × hoursScore + activityWeight × activityScore)
 *   points        = basePoints + bonuses
 *
 * Two deliberate design decisions worth understanding before you change anything:
 *
 * 1. HOURS ARE CAPPED. hoursCap defaults to 1.1, meaning you get full credit at
 *    110% of target and nothing extra beyond that. Without a cap the leaderboard
 *    rewards the longest hours, which is how you get burnout and inflated
 *    timesheets rather than productivity.
 *
 * 2. THE CAP IS ALSO THE DENOMINATOR. Dividing by hoursCap means hitting exactly
 *    the cap scores 1.0, and hitting exactly target scores 1/1.1 = 0.909. This
 *    keeps a small, bounded incentive to go slightly beyond target without
 *    making target-hitters look like underperformers.
 *
 * Everything here is pure — no database, no side effects — so it can be unit
 * tested and so the frontend can reproduce the same numbers for its
 * "how was this calculated?" panel.
 */

export interface ScoringConfig {
  hoursWeight: number;
  activityWeight: number;
  targetHours: number;
  hoursCap: number;
  maxPoints: number;
  bonusPersonalBest: number;
  bonusTargetMet: number;
  bonusHighActivity: number;
  highActivityThreshold: number;
  minHoursToQualify: number;
  integrityFlagActivity: number;
}

export const DEFAULT_SCORING: ScoringConfig = {
  hoursWeight: 0.5,
  activityWeight: 0.5,
  targetHours: 35,
  hoursCap: 1.1,
  maxPoints: 1000,
  bonusPersonalBest: 25,
  bonusTargetMet: 20,
  bonusHighActivity: 25,
  highActivityThreshold: 85,
  minHoursToQualify: 8,
  integrityFlagActivity: 99,
};

export interface ScoreInput {
  employeeId: string;
  rawName: string;
  seconds: number;
  activityPct: number;
  daysWorked?: number | null;
  /** Best points total this employee has previously achieved, if any. */
  previousBest?: number | null;
  /** Rank in the immediately preceding published week, if any. */
  previousRank?: number | null;
}

export interface BonusItem {
  key: string;
  label: string;
  points: number;
}

export interface ScoreFlag {
  type: 'LOW_HOURS' | 'NOT_QUALIFIED' | 'ACTIVITY_OUTLIER' | 'ZERO_TIME';
  severity: 'info' | 'warning';
  message: string;
}

export interface ScoredRow {
  employeeId: string;
  rawName: string;
  seconds: number;
  activityPct: number;
  hoursScore: number;
  activityScore: number;
  basePoints: number;
  bonusPoints: number;
  points: number;
  rank: number;
  previousRank: number | null;
  rankDelta: number | null;
  isPersonalBest: boolean;
  daysWorked: number | null;
  qualified: boolean;
  bonusBreakdown: BonusItem[];
  flags: ScoreFlag[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function normaliseConfig(partial: Partial<ScoringConfig>): ScoringConfig {
  const cfg = { ...DEFAULT_SCORING, ...partial };

  // Weights must sum to 1, otherwise the maximum achievable score drifts and
  // scores stop being comparable between departments.
  const sum = cfg.hoursWeight + cfg.activityWeight;
  if (sum <= 0) {
    cfg.hoursWeight = 0.5;
    cfg.activityWeight = 0.5;
  } else if (Math.abs(sum - 1) > 1e-9) {
    cfg.hoursWeight = cfg.hoursWeight / sum;
    cfg.activityWeight = cfg.activityWeight / sum;
  }

  cfg.hoursCap = Math.max(1, cfg.hoursCap);
  cfg.targetHours = Math.max(0.1, cfg.targetHours);
  cfg.maxPoints = Math.max(1, Math.round(cfg.maxPoints));
  return cfg;
}

/** Score a single row. Exported so the frontend explainer can call the same logic. */
export function scoreOne(
  input: ScoreInput,
  config: ScoringConfig,
): Omit<ScoredRow, 'rank' | 'rankDelta'> {
  const hours = input.seconds / 3600;
  const ratio = hours / config.targetHours;
  const cappedRatio = Math.min(ratio, config.hoursCap);
  const hoursScore = Math.max(0, cappedRatio / config.hoursCap);
  const activityScore = Math.max(0, Math.min(1, input.activityPct / 100));

  const basePoints =
    config.maxPoints * (config.hoursWeight * hoursScore + config.activityWeight * activityScore);

  const qualified = hours >= config.minHoursToQualify;

  const bonusBreakdown: BonusItem[] = [];
  const flags: ScoreFlag[] = [];

  if (qualified) {
    if (ratio >= 1 && config.bonusTargetMet > 0) {
      bonusBreakdown.push({
        key: 'TARGET_MET',
        label: `Hit the ${config.targetHours}h weekly target`,
        points: config.bonusTargetMet,
      });
    }
    if (input.activityPct >= config.highActivityThreshold && config.bonusHighActivity > 0) {
      bonusBreakdown.push({
        key: 'HIGH_ACTIVITY',
        label: `Activity at or above ${config.highActivityThreshold}%`,
        points: config.bonusHighActivity,
      });
    }
  }

  const bonusPoints = bonusBreakdown.reduce((s, b) => s + b.points, 0);
  const preBonusTotal = basePoints + bonusPoints;

  const isPersonalBest =
    qualified && input.previousBest != null && preBonusTotal > input.previousBest + 0.001;

  if (isPersonalBest && config.bonusPersonalBest > 0) {
    bonusBreakdown.push({
      key: 'PERSONAL_BEST',
      label: 'New personal best',
      points: config.bonusPersonalBest,
    });
  }

  // ── Flags (visible to managers only) ──────────────────────────────────────
  if (input.seconds === 0) {
    flags.push({
      type: 'ZERO_TIME',
      severity: 'warning',
      message: 'No time recorded this week.',
    });
  } else if (!qualified) {
    flags.push({
      type: 'NOT_QUALIFIED',
      severity: 'info',
      message: `Under the ${config.minHoursToQualify}h qualifying threshold — shown as "not ranked" rather than placed last. Common for part-time, annual leave or sick leave.`,
    });
  } else if (hours < config.targetHours * 0.6) {
    flags.push({
      type: 'LOW_HOURS',
      severity: 'info',
      message: `Well below the ${config.targetHours}h target — worth checking whether this is leave, a part-time contract, or a tracking problem.`,
    });
  }

  if (input.activityPct >= config.integrityFlagActivity) {
    flags.push({
      type: 'ACTIVITY_OUTLIER',
      severity: 'info',
      message:
        `Activity of ${input.activityPct}% is at the top of the possible range. Screenshot Monitor derives activity from ` +
        `keyboard and mouse input, so sustained near-100% readings can indicate genuinely intense input-heavy work ` +
        `(data entry, editing) or an input-simulation tool. Flagged for a human look, not an accusation.`,
    });
  }

  const finalBonus = bonusBreakdown.reduce((s, b) => s + b.points, 0);

  return {
    employeeId: input.employeeId,
    rawName: input.rawName,
    seconds: input.seconds,
    activityPct: input.activityPct,
    hoursScore: round2(hoursScore),
    activityScore: round2(activityScore),
    basePoints: round2(basePoints),
    bonusPoints: round2(finalBonus),
    points: round2(basePoints + finalBonus),
    isPersonalBest,
    daysWorked: input.daysWorked ?? null,
    qualified,
    previousRank: input.previousRank ?? null,
    bonusBreakdown,
    flags,
  };
}

/**
 * Score and rank a whole week.
 *
 * Ranking rules:
 *   • Unqualified employees (below minHoursToQualify) are scored but ranked last
 *     as a block, so a week of annual leave never reads as "worst performer".
 *   • Ties share a rank and the next rank is skipped (standard competition
 *     ranking: 1, 2, 2, 4).
 *   • Ties are broken for display order by activity %, then hours, then name,
 *     so the order is stable between reruns.
 */
export function scoreWeek(inputs: ScoreInput[], config: ScoringConfig): ScoredRow[] {
  const cfg = normaliseConfig(config);
  const scored = inputs.map((i) => scoreOne(i, cfg));

  const ordered = [...scored].sort((a, b) => {
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
    if (b.points !== a.points) return b.points - a.points;
    if (b.activityPct !== a.activityPct) return b.activityPct - a.activityPct;
    if (b.seconds !== a.seconds) return b.seconds - a.seconds;
    return a.rawName.localeCompare(b.rawName);
  });

  const rows: ScoredRow[] = [];
  let lastPoints: number | null = null;
  let lastRank = 0;
  const firstUnqualifiedIndex = ordered.findIndex((r) => !r.qualified);
  const qualifiedCount = firstUnqualifiedIndex === -1 ? ordered.length : firstUnqualifiedIndex;

  ordered.forEach((row, idx) => {
    let rank: number;
    if (!row.qualified) {
      // All unqualified rows share the position immediately after the ranked block.
      rank = qualifiedCount + 1;
    } else if (lastPoints !== null && Math.abs(row.points - lastPoints) < 0.005) {
      rank = lastRank;
    } else {
      rank = idx + 1;
      lastRank = rank;
      lastPoints = row.points;
    }

    const rankDelta =
      row.previousRank != null && row.qualified ? row.previousRank - rank : null;

    rows.push({ ...row, rank, rankDelta });
  });

  return rows;
}

/**
 * Note on why there is no "biggest climber" POINTS bonus.
 *
 * An early draft of this engine awarded points for climbing the table. That is
 * a bad idea and it was removed deliberately: because climbing is measured
 * against your own previous rank, a points reward for climbing pays people for
 * being inconsistent. The optimal strategy becomes "have a bad week, then a
 * normal week" — repeatedly. It also creates a circular dependency, since the
 * bonus changes the points total that produced the rank in the first place.
 *
 * Climbing is still celebrated — loudly — but as a BADGE (see services/badges.ts).
 * Badges carry status, not points, so recognising a comeback cannot be farmed
 * for monthly prize position.
 */

/** Convenience: the maximum points reachable in a week under a given config. */
export function maxAchievablePoints(config: ScoringConfig): number {
  const cfg = normaliseConfig(config);
  return round2(
    cfg.maxPoints + cfg.bonusTargetMet + cfg.bonusHighActivity + cfg.bonusPersonalBest,
  );
}

/**
 * XP and levels. Cumulative points translate into a level using a gentle
 * square-root curve so early levels come quickly and later ones take real work.
 *   level = floor(sqrt(totalPoints / 250)) + 1
 */
export function levelFromPoints(totalPoints: number): {
  level: number;
  title: string;
  currentLevelFloor: number;
  nextLevelAt: number;
  progress: number;
} {
  const level = Math.max(1, Math.floor(Math.sqrt(Math.max(0, totalPoints) / 250)) + 1);
  const currentLevelFloor = 250 * Math.pow(level - 1, 2);
  const nextLevelAt = 250 * Math.pow(level, 2);
  const span = nextLevelAt - currentLevelFloor;
  const progress = span > 0 ? Math.min(1, Math.max(0, (totalPoints - currentLevelFloor) / span)) : 0;

  const TITLES = [
    'Rookie',
    'Contributor',
    'Operator',
    'Specialist',
    'Professional',
    'Veteran',
    'Expert',
    'Master',
    'Elite',
    'Legend',
  ];
  const title = TITLES[Math.min(level - 1, TITLES.length - 1)];

  return { level, title, currentLevelFloor, nextLevelAt, progress: round2(progress) };
}
