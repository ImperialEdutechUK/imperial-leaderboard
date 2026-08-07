/**
 * Name normalisation and duration parsing.
 *
 * These two functions are the difference between an import that "just works"
 * every Monday morning and one that needs a human to fix it. They are
 * deliberately forgiving about how Screenshot Monitor formats things.
 */

/** Matches a trailing department code, e.g. "Aaisha (CDD)" -> "CDD". */
const DEPT_SUFFIX = /\s*\(\s*([A-Za-z0-9&.\- ]{1,24})\s*\)\s*$/;

export function extractDepartmentCode(rawName: string): string | null {
  const m = rawName.match(DEPT_SUFFIX);
  return m ? m[1].trim().toUpperCase() : null;
}

export function stripDepartmentSuffix(rawName: string): string {
  return rawName.replace(DEPT_SUFFIX, '').trim();
}

/**
 * Produces a stable lookup key for a person's name.
 * "Pasindu  maddumage (CDD)" and "PASINDU MADDUMAGE" both -> "pasindu maddumage"
 */
export function normaliseName(rawName: string): string {
  return stripDepartmentSuffix(rawName)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // punctuation -> space
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function slugify(input: string): string {
  return normaliseName(input).replace(/\s+/g, '-').replace(/^-+|-+$/g, '') || 'unnamed';
}

/** "Fathima Rukaiya" -> "Fathima R."  ·  "Milona" -> "Milona" */
export function toDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/**
 * Parses any duration Screenshot Monitor is likely to print.
 *
 * Accepted:
 *   "33h 16m"   "33h16m"   "8h"   "45m"   "33:16"   "33:16:30"
 *   "33.5"      "33.5h"    "2d 4h 30m"
 *
 * Returns seconds, or null if it cannot be read confidently.
 * A bare number with no unit is treated as HOURS (that is how every
 * Screenshot Monitor CSV export we have seen formats a decimal duration).
 */
export function parseDurationToSeconds(input: string): number | null {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase().replace(/[\u00a0\u202f\u2009]/g, ' ');
  if (!s || s === '-' || s === '–' || s === 'n/a') return null;

  // hh:mm or hh:mm:ss
  const clock = s.match(/^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (clock) {
    return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3] ?? 0);
  }

  // 2d 4h 30m 15s (any subset, any order of the standard sequence)
  const unit = s.match(
    /^(?:(\d+(?:\.\d+)?)\s*d\w*)?\s*(?:(\d+(?:\.\d+)?)\s*h\w*)?\s*(?:(\d+(?:\.\d+)?)\s*m(?!s)\w*)?\s*(?:(\d+(?:\.\d+)?)\s*s\w*)?$/,
  );
  if (unit && (unit[1] || unit[2] || unit[3] || unit[4])) {
    const d = Number(unit[1] ?? 0);
    const h = Number(unit[2] ?? 0);
    const m = Number(unit[3] ?? 0);
    const sec = Number(unit[4] ?? 0);
    return Math.round(d * 86400 + h * 3600 + m * 60 + sec);
  }

  // Bare decimal -> hours
  const bare = s.match(/^(\d+(?:[.,]\d+)?)$/);
  if (bare) return Math.round(Number(bare[1].replace(',', '.')) * 3600);

  return null;
}

/** 119760 -> "33h 16m" */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (m === 60) return `${h + 1}h 00m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Parses an activity percentage. Accepts "65%", "65", "0.65", " 100 % ".
 * Values between 0 and 1 (exclusive of 1) are treated as fractions and
 * multiplied by 100 — but only when the source had no "%" sign, because
 * "0.65%" would be a genuinely tiny percentage.
 * Returns 0–100, or null.
 */
export function parseActivityPercent(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw || raw === '-' || raw === '–') return null;

  const hadPercent = raw.includes('%');
  const cleaned = raw.replace(/%/g, '').replace(',', '.').trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;

  let n = Number(cleaned);
  if (!hadPercent && n > 0 && n <= 1) n *= 100;
  if (n < 0) return null;
  return Math.min(100, Math.round(n * 100) / 100);
}
