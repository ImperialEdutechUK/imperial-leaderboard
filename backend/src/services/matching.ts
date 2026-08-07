/**
 * Resolves the names printed on a report to people in the roster.
 *
 * Screenshot Monitor names are typed by humans, so they drift: "Pasindu
 * maddumage" one week, "Pasindu Maddumage" the next, "P. Maddumage" the week
 * after. Three passes handle this:
 *
 *   1. Exact match on a stored alias (fast, and covers every name ever seen).
 *   2. Exact match on the normalised canonical name.
 *   3. Fuzzy match — normalised Levenshtein similarity above a threshold —
 *      offered to the manager as a SUGGESTION, never applied silently.
 *
 * Anything unresolved is presented as "new person" so the manager decides
 * whether to create them or link them to someone already on the roster.
 * The system never invents a link on its own.
 */

import { normaliseName } from '../lib/text';

export interface RosterEntry {
  id: string;
  fullName: string;
  normalised: string;
  aliases: string[]; // already normalised
  isActive: boolean;
}

export type MatchMethod = 'ALIAS' | 'EXACT' | 'FUZZY' | 'NONE';

export interface MatchResult {
  rawName: string;
  cleanName: string;
  employeeId: string | null;
  matchedName: string | null;
  method: MatchMethod;
  /** 0–1. Only meaningful for FUZZY. */
  confidence: number;
  /** Alternatives for the manager to choose from when confidence is not perfect. */
  suggestions: { employeeId: string; fullName: string; confidence: number }[];
}

/** Classic Levenshtein distance, iterative with a single row buffer. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(a, b) / longest;
}

/**
 * Token-aware similarity: also rewards a shared distinctive token, so
 * "Pasindu maddumage" still matches "Maddumage Pasindu".
 */
function nameSimilarity(a: string, b: string): number {
  const direct = similarity(a, b);
  const at = new Set(a.split(' ').filter((t) => t.length > 2));
  const bt = new Set(b.split(' ').filter((t) => t.length > 2));
  if (at.size === 0 || bt.size === 0) return direct;
  let shared = 0;
  for (const t of at) if (bt.has(t)) shared++;
  const jaccard = shared / (at.size + bt.size - shared);
  return Math.max(direct, jaccard * 0.95);
}

const FUZZY_ACCEPT = 0.86; // auto-suggest as the primary candidate
const FUZZY_OFFER = 0.62; // include in the suggestion list

export function matchNames(rawNames: string[], roster: RosterEntry[]): MatchResult[] {
  const aliasIndex = new Map<string, RosterEntry>();
  const canonicalIndex = new Map<string, RosterEntry>();

  for (const entry of roster) {
    canonicalIndex.set(entry.normalised, entry);
    for (const alias of entry.aliases) if (!aliasIndex.has(alias)) aliasIndex.set(alias, entry);
  }

  return rawNames.map((rawName) => {
    const cleanName = rawName.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const key = normaliseName(rawName);

    const byAlias = aliasIndex.get(key);
    if (byAlias) {
      return {
        rawName,
        cleanName,
        employeeId: byAlias.id,
        matchedName: byAlias.fullName,
        method: 'ALIAS' as const,
        confidence: 1,
        suggestions: [],
      };
    }

    const byCanonical = canonicalIndex.get(key);
    if (byCanonical) {
      return {
        rawName,
        cleanName,
        employeeId: byCanonical.id,
        matchedName: byCanonical.fullName,
        method: 'EXACT' as const,
        confidence: 1,
        suggestions: [],
      };
    }

    const scored = roster
      .map((e) => ({
        employeeId: e.id,
        fullName: e.fullName,
        confidence: Math.round(nameSimilarity(key, e.normalised) * 100) / 100,
      }))
      .filter((s) => s.confidence >= FUZZY_OFFER)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 4);

    const top = scored[0];
    if (top && top.confidence >= FUZZY_ACCEPT) {
      return {
        rawName,
        cleanName,
        employeeId: top.employeeId,
        matchedName: top.fullName,
        method: 'FUZZY' as const,
        confidence: top.confidence,
        suggestions: scored.slice(1),
      };
    }

    return {
      rawName,
      cleanName,
      employeeId: null,
      matchedName: null,
      method: 'NONE' as const,
      confidence: 0,
      suggestions: scored,
    };
  });
}
