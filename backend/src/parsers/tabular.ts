/**
 * CSV / Excel parser for Screenshot Monitor exports.
 *
 * Column names vary between exports and between versions of the tool, so
 * instead of hardcoding them we score each header against a list of known
 * aliases and pick the best match. The manager can always override the mapping
 * in the import preview screen before anything is saved.
 */

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  extractDepartmentCode,
  parseActivityPercent,
  parseDurationToSeconds,
  stripDepartmentSuffix,
} from '../lib/text';
import { parseDateRange } from './pdf';
import type { ParsedEmployeeRow, ParsedReport, ParseWarning } from './types';

export type ColumnRole = 'name' | 'duration' | 'activity' | 'date' | 'days' | 'ignore';

const ALIASES: Record<Exclude<ColumnRole, 'ignore'>, string[]> = {
  name: ['employee', 'employee name', 'name', 'user', 'user name', 'username', 'member', 'person', 'staff'],
  duration: ['duration', 'time', 'total time', 'hours', 'worked', 'time worked', 'tracked', 'tracked time', 'total'],
  activity: ['activity', 'activity %', 'activity percent', 'active', 'activity level', 'productivity', 'efficiency'],
  date: ['date', 'day', 'week', 'week starting', 'period'],
  days: ['days', 'days worked', 'active days'],
};

function normHeader(h: string): string {
  return String(h ?? '')
    .replace(/[ ]/g, ' ')
    .replace(/[^\p{L}\p{N}%\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Guess which column plays which role. Exact alias match wins over substring match. */
export function detectColumns(headers: string[]): Record<string, ColumnRole> {
  const map: Record<string, ColumnRole> = {};
  const taken = new Set<ColumnRole>();

  const scored: { header: string; role: ColumnRole; score: number }[] = [];
  for (const raw of headers) {
    const h = normHeader(raw);
    if (!h) continue;
    for (const [role, aliases] of Object.entries(ALIASES) as [Exclude<ColumnRole, 'ignore'>, string[]][]) {
      for (const alias of aliases) {
        let score = 0;
        if (h === alias) score = 100;
        else if (h.startsWith(alias) || h.endsWith(alias)) score = 70;
        else if (h.includes(alias)) score = 50;
        if (score > 0) scored.push({ header: raw, role, score: score - aliases.indexOf(alias) });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  for (const s of scored) {
    if (taken.has(s.role) || map[s.header]) continue;
    map[s.header] = s.role;
    taken.add(s.role);
  }
  for (const h of headers) if (!map[h]) map[h] = 'ignore';
  return map;
}

interface TabularOptions {
  /** Manager-supplied override from the import preview screen. */
  columnMap?: Record<string, ColumnRole>;
  /** Fallback week when the file itself carries no dates. */
  startDate?: string;
  endDate?: string;
}

function rowsFromCsv(buffer: Buffer): Record<string, string>[] {
  const text = buffer.toString('utf8').replace(/^﻿/, '');
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  return (result.data ?? []).filter((r) => r && Object.keys(r).length > 0);
}

function rowsFromXlsx(buffer: Buffer): Record<string, string>[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];

  // Screenshot Monitor exports sometimes carry a title block above the real
  // header. Find the first row that looks like a header and slice from there.
  const grid = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false, raw: false });
  let headerIdx = 0;
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const cells = (grid[i] ?? []).map((c) => normHeader(String(c ?? '')));
    const hits = cells.filter((c) =>
      Object.values(ALIASES).some((list) => list.some((a) => c === a || c.includes(a))),
    ).length;
    if (hits >= 2) {
      headerIdx = i;
      break;
    }
  }

  const headers = (grid[headerIdx] ?? []).map((c, i) => String(c ?? `Column ${i + 1}`).trim());
  const out: Record<string, string>[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    if (row.every((c) => String(c ?? '').trim() === '')) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, j) => {
      obj[h] = String(row[j] ?? '').trim();
    });
    out.push(obj);
  }
  return out;
}

/**
 * A weekly report has, at most, a few hundred employee rows. A file that
 * expands to far more than that once parsed is either corrupt or crafted to
 * blow up memory (e.g. a highly-compressible XLSX) — reject it outright
 * rather than let it flow into name-matching/scoring, which are O(rows).
 */
const MAX_REPORT_ROWS = 20_000;

export function parseTabularReport(
  buffer: Buffer,
  kind: 'CSV' | 'XLSX',
  options: TabularOptions = {},
): ParsedReport {
  const warnings: ParseWarning[] = [];
  const rows = kind === 'CSV' ? rowsFromCsv(buffer) : rowsFromXlsx(buffer);

  if (rows.length === 0) {
    throw Object.assign(new Error('No data rows found in this file.'), { code: 'NO_ROWS' });
  }
  if (rows.length > MAX_REPORT_ROWS) {
    throw Object.assign(
      new Error(`This file has ${rows.length} rows, which is far more than a weekly report should contain.`),
      { code: 'TOO_MANY_ROWS' },
    );
  }

  const headers = Object.keys(rows[0]);
  const columnMap = options.columnMap ?? detectColumns(headers);

  const nameCol = headers.find((h) => columnMap[h] === 'name');
  const durCol = headers.find((h) => columnMap[h] === 'duration');
  const actCol = headers.find((h) => columnMap[h] === 'activity');
  const daysCol = headers.find((h) => columnMap[h] === 'days');
  const dateCol = headers.find((h) => columnMap[h] === 'date');

  const missing: string[] = [];
  if (!nameCol) missing.push('employee name');
  if (!durCol) missing.push('duration');
  if (!actCol) missing.push('activity %');
  if (missing.length) {
    throw Object.assign(
      new Error(
        `Could not identify the ${missing.join(', ')} column${missing.length > 1 ? 's' : ''}. ` +
          `Columns found: ${headers.join(', ')}. Use the column mapper on the import screen to set them manually.`,
      ),
      { code: 'COLUMN_MAPPING_REQUIRED', headers, columnMap },
    );
  }

  const employees: ParsedEmployeeRow[] = [];
  const skipped: string[] = [];
  const byName = new Map<string, ParsedEmployeeRow>();

  for (const row of rows) {
    const rawName = String(row[nameCol!] ?? '').trim();
    if (!rawName) continue;
    if (/^(total|grand total|sum|average|avg)\b/i.test(rawName)) continue;

    const seconds = parseDurationToSeconds(String(row[durCol!] ?? ''));
    const activityPct = parseActivityPercent(row[actCol!]);

    if (seconds == null || activityPct == null) {
      skipped.push(rawName);
      continue;
    }

    const cleanName = stripDepartmentSuffix(rawName);
    const key = cleanName.toLowerCase();

    // Per-day exports produce several rows per person — roll them up.
    const existing = byName.get(key);
    if (existing) {
      const totalSecs = existing.seconds + seconds;
      existing.activityPct =
        totalSecs > 0
          ? Math.round(
              ((existing.activityPct * existing.seconds + activityPct * seconds) / totalSecs) * 100,
            ) / 100
          : activityPct;
      existing.seconds = totalSecs;
      existing.daysWorked = (existing.daysWorked ?? 1) + 1;
      continue;
    }

    const entry: ParsedEmployeeRow = {
      rawName,
      cleanName,
      departmentCode: extractDepartmentCode(rawName),
      seconds,
      activityPct,
    };
    if (daysCol) {
      const d = Number(String(row[daysCol] ?? '').trim());
      if (Number.isFinite(d) && d > 0) entry.daysWorked = d;
    }
    byName.set(key, entry);
    employees.push(entry);
  }

  if (skipped.length) {
    warnings.push({
      level: 'warning',
      code: 'ROWS_SKIPPED',
      message: `${skipped.length} row${skipped.length > 1 ? 's were' : ' was'} skipped because the duration or activity could not be read: ${skipped
        .slice(0, 8)
        .join(', ')}${skipped.length > 8 ? '…' : ''}`,
    });
  }

  if (employees.length === 0) {
    throw Object.assign(new Error('No usable employee rows found in this file.'), { code: 'NO_ROWS' });
  }

  // ── Week dates ────────────────────────────────────────────────────────────
  let startDate = options.startDate ?? null;
  let endDate = options.endDate ?? null;

  if ((!startDate || !endDate) && dateCol) {
    const dates = rows
      .map((r) => String(r[dateCol] ?? '').trim())
      .filter(Boolean)
      .map((d) => {
        const range = parseDateRange(`${d} - ${d}`);
        return range?.start ?? null;
      })
      .filter((d): d is string => !!d)
      .sort();
    if (dates.length) {
      startDate = startDate ?? dates[0];
      endDate = endDate ?? dates[dates.length - 1];
    }
  }

  if (!startDate || !endDate) {
    warnings.push({
      level: 'warning',
      code: 'NO_DATE_RANGE',
      message: 'This file does not contain the reporting week. Please set the week dates on the import screen.',
    });
  }

  const codeCounts = new Map<string, number>();
  for (const e of employees) {
    if (e.departmentCode) codeCounts.set(e.departmentCode, (codeCounts.get(e.departmentCode) ?? 0) + 1);
  }
  const inferredDepartmentCode =
    codeCounts.size > 0 ? [...codeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;

  return {
    source: kind,
    title: null,
    startDate,
    endDate,
    inferredDepartmentCode,
    printedTotalSeconds: null,
    printedAvgActivity: null,
    employees,
    dayTotals: [],
    warnings,
  };
}
