/**
 * PDF parser for Screenshot Monitor weekly reports.
 *
 * Strategy
 * ────────
 * A PDF has no concept of a "table row" — it is a bag of positioned glyphs.
 * We therefore:
 *   1. pull every text run together with its x/y coordinates,
 *   2. rebuild rows by clustering on the y axis,
 *   3. locate the "Employee | Duration | Activity" header, and
 *   4. read every row below it, identifying columns by CONTENT
 *      (what parses as a duration, what parses as a percentage) rather than
 *      by fixed x offsets — so the parser survives column widths moving.
 *
 * If the header is missing entirely we fall back to a strict pattern scan.
 * Every assumption that could not be verified is reported as a warning
 * rather than silently guessed at.
 */

import {
  extractDepartmentCode,
  parseActivityPercent,
  parseDurationToSeconds,
  stripDepartmentSuffix,
} from '../lib/text';
import type { ParsedDayTotal, ParsedEmployeeRow, ParsedReport, ParseWarning } from './types';

// TypeScript compiles `import()` down to `require()` under CommonJS, which cannot
// load pdfjs' ESM build. This keeps the dynamic import intact at runtime.
const esmImport = new Function('s', 'return import(s)') as (s: string) => Promise<any>;

interface Cell {
  text: string;
  x: number;
  y: number;
  width: number;
}
interface Row {
  page: number;
  y: number;
  cells: Cell[];
  text: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const DAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Rebuild logical rows from positioned glyph runs. */
async function extractRows(buffer: Buffer): Promise<Row[]> {
  const pdfjs = await esmImport('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  const rows: Row[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    const cells: Cell[] = content.items
      .filter((i: any) => typeof i.str === 'string' && i.str.trim() !== '')
      .map((i: any) => ({
        text: String(i.str).replace(/[   ]/g, ' ').trim(),
        x: i.transform[4] as number,
        y: i.transform[5] as number,
        width: (i.width as number) ?? 0,
      }));

    // Cluster on y. 2.5pt tolerance handles sub-pixel baseline jitter without
    // merging genuinely different lines (report line spacing is ~10pt+).
    const buckets = new Map<number, Cell[]>();
    for (const c of cells) {
      const key = Math.round(c.y / 2.5);
      const arr = buckets.get(key);
      if (arr) arr.push(c);
      else buckets.set(key, [c]);
    }

    const pageRows = [...buckets.values()]
      .map((group) => {
        group.sort((a, b) => a.x - b.x);
        return {
          page: p,
          y: group[0].y,
          cells: group,
          text: group.map((g) => g.text).join(' ').replace(/\s+/g, ' ').trim(),
        };
      })
      .sort((a, b) => b.y - a.y); // top of page downwards

    rows.push(...pageRows);
    page.cleanup();
  }

  await doc.destroy();
  return rows;
}

function isPercentCell(text: string): boolean {
  return /^\d{1,3}(\.\d+)?\s*%$/.test(text.trim());
}

function isDurationCell(text: string): boolean {
  const t = text.trim();
  if (/—|–/.test(t)) return false; // donut-chart labels use an em dash
  return /^\d{1,4}\s*h(\s*\d{1,2}\s*m)?$/i.test(t) || /^\d{1,4}:\d{2}$/.test(t) || /^\d{1,3}\s*m$/i.test(t);
}

/** Turn one reconstructed row into an employee record, or null if it is not one. */
function rowToEmployee(row: Row): ParsedEmployeeRow | null {
  const cells = row.cells;
  if (cells.length < 2) return null;

  const pctIdx = cells.findIndex((c) => isPercentCell(c.text));
  if (pctIdx === -1) return null;

  // The duration must sit to the LEFT of the percentage.
  let durIdx = -1;
  for (let i = pctIdx - 1; i >= 0; i--) {
    if (isDurationCell(cells[i].text)) {
      durIdx = i;
      break;
    }
  }
  if (durIdx <= 0) return null; // nothing left for a name

  const nameCells = cells.slice(0, durIdx);
  const rawName = nameCells.map((c) => c.text).join(' ').replace(/\s+/g, ' ').trim();
  if (!rawName) return null;

  // Reject chart labels and totals rows.
  if (/—|–/.test(rawName)) return null;
  if (/^(total|grand total|all employees|employee)$/i.test(rawName)) return null;
  if (!/\p{L}/u.test(rawName)) return null;

  const seconds = parseDurationToSeconds(cells[durIdx].text);
  const activityPct = parseActivityPercent(cells[pctIdx].text);
  if (seconds == null || activityPct == null) return null;

  return {
    rawName,
    cleanName: stripDepartmentSuffix(rawName),
    departmentCode: extractDepartmentCode(rawName),
    seconds,
    activityPct,
  };
}

/** Reads "06/04/26 - 12/04/26", "6 Apr 2026 – 12 Apr 2026", "2026-04-06 to 2026-04-12". */
export function parseDateRange(text: string): { start: string; end: string } | null {
  const cleaned = text.replace(/[–—]/g, '-').replace(/\bto\b/gi, '-');

  // ISO: 2026-04-06 - 2026-04-12
  const iso = cleaned.match(/(\d{4})-(\d{2})-(\d{2})\s*-\s*(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return { start: `${iso[1]}-${iso[2]}-${iso[3]}`, end: `${iso[4]}-${iso[5]}-${iso[6]}` };
  }

  // Numeric: 06/04/26 - 12/04/26  (also handles 4-digit years and dot/dash separators)
  const num = cleaned.match(
    /(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\s*-\s*(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/,
  );
  if (num) {
    const [, a1, a2, a3, b1, b2, b3] = num;
    const yr = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

    const build = (d: string, m: string, y: string) =>
      `${yr(y)}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;

    // Day-first and month-first are ambiguous for 06/04. Pick whichever produces
    // a sane forward-running span of 6 to 7 days, preferring day-first (UK format,
    // which is what this report uses).
    const candidates = [
      { start: build(a1, a2, a3), end: build(b1, b2, b3) }, // DD/MM/YY
      { start: build(a2, a1, a3), end: build(b2, b1, b3) }, // MM/DD/YY
    ];
    for (const c of candidates) {
      const s = Date.parse(`${c.start}T00:00:00Z`);
      const e = Date.parse(`${c.end}T00:00:00Z`);
      if (Number.isNaN(s) || Number.isNaN(e)) continue;
      const days = (e - s) / 86_400_000;
      if (days >= 5 && days <= 7) return c;
    }
    // Nothing matched a week — return the day-first reading so the manager can correct it.
    const s = Date.parse(`${candidates[0].start}T00:00:00Z`);
    if (!Number.isNaN(s)) return candidates[0];
  }

  // Textual: 6 Apr 2026 - 12 Apr 2026  /  Apr 6, 2026 - Apr 12, 2026
  const textual = [
    ...cleaned.matchAll(
      /(?:(\d{1,2})\s*([A-Za-z]{3,9})|([A-Za-z]{3,9})\s*(\d{1,2}))\,?\s*(\d{4})/g,
    ),
  ];
  if (textual.length >= 2) {
    const toIso = (m: RegExpMatchArray) => {
      const day = Number(m[1] ?? m[4]);
      const monName = (m[2] ?? m[3]).slice(0, 3).toLowerCase();
      const mon = MONTHS[monName];
      if (!mon || !day) return null;
      return `${m[5]}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    };
    const s = toIso(textual[0]);
    const e = toIso(textual[textual.length - 1]);
    if (s && e) return { start: s, end: e };
  }

  return null;
}

/**
 * Best-effort read of the daily timeline bar chart.
 * Values sit on their own line above the day labels, so we match each value
 * to the nearest day label by horizontal centre. Never used for scoring —
 * purely so the UI can draw a little "which day did the work happen" strip.
 */
function extractDayTotals(rows: Row[], year: number): ParsedDayTotal[] {
  const dayRowIdx = rows.findIndex((r) => {
    const found = new Set(
      r.cells
        .map((c) => c.text.trim().slice(0, 3).toLowerCase())
        .filter((t) => DAY_NAMES.includes(t)),
    );
    return found.size >= 4;
  });
  if (dayRowIdx === -1) return [];

  const dayRow = rows[dayRowIdx];
  const dateRow = rows[dayRowIdx + 1];
  if (!dateRow) return [];

  // "Apr 6" style cells directly beneath the day names.
  const dates = dateRow.cells
    .map((c) => {
      const m = c.text.match(/^([A-Za-z]{3,9})\s*(\d{1,2})$/);
      if (!m) return null;
      const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
      if (!mon) return null;
      return {
        centre: c.x + c.width / 2,
        iso: `${year}-${String(mon).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`,
      };
    })
    .filter((d): d is { centre: number; iso: string } => d !== null);

  if (dates.length < 4) return [];

  // Value labels live in the rows above the day labels, within the chart body.
  const chartTop = dayRow.y + 220;
  const valueCells: Cell[] = [];
  for (const r of rows) {
    if (r.page !== dayRow.page) continue;
    if (r.y <= dayRow.y || r.y > chartTop) continue;
    for (const c of r.cells) if (isDurationCell(c.text)) valueCells.push(c);
  }

  const spacing =
    dates.length > 1
      ? Math.abs(dates[1].centre - dates[0].centre)
      : 60;

  const totals = new Map<string, number>();
  for (const c of valueCells) {
    const centre = c.x + c.width / 2;
    let best: { iso: string; dist: number } | null = null;
    for (const d of dates) {
      const dist = Math.abs(d.centre - centre);
      if (!best || dist < best.dist) best = { iso: d.iso, dist };
    }
    // Only accept a match well inside the column, otherwise we are guessing.
    if (best && best.dist <= spacing * 0.6) {
      const secs = parseDurationToSeconds(c.text);
      if (secs != null) totals.set(best.iso, (totals.get(best.iso) ?? 0) + secs);
    }
  }

  // Days with no bar genuinely had no tracked time.
  for (const d of dates) if (!totals.has(d.iso)) totals.set(d.iso, 0);

  return [...totals.entries()]
    .map(([date, seconds]) => ({ date, seconds }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function parsePdfReport(buffer: Buffer): Promise<ParsedReport> {
  const warnings: ParseWarning[] = [];
  const rows = await extractRows(buffer);

  if (rows.length === 0) {
    throw Object.assign(new Error('No readable text found in this PDF.'), { code: 'EMPTY_PDF' });
  }

  // ── Header block ──────────────────────────────────────────────────────────
  const titleRow = rows[0];
  const title = titleRow.cells[0]?.text ?? null;

  const headerText = rows.slice(0, 6).map((r) => r.text).join(' ');
  const printedTotalMatch = headerText.match(/(\d{1,5}\s*h\s*\d{1,2}\s*m)/i);
  const printedTotalSeconds = printedTotalMatch
    ? parseDurationToSeconds(printedTotalMatch[1])
    : null;
  const printedPctMatch = titleRow.text.match(/(\d{1,3})\s*%/);
  const printedAvgActivity = printedPctMatch ? Number(printedPctMatch[1]) : null;

  // ── Date range ────────────────────────────────────────────────────────────
  const dateRow = rows.find((r) => /date\s*range/i.test(r.text));
  let range = dateRow ? parseDateRange(dateRow.text) : null;
  if (!range) {
    // Some exports omit the label; try the first 8 rows.
    for (const r of rows.slice(0, 8)) {
      range = parseDateRange(r.text);
      if (range) break;
    }
  }
  if (!range) {
    warnings.push({
      level: 'warning',
      code: 'NO_DATE_RANGE',
      message:
        'Could not read the reporting week from this PDF. Please confirm the week dates before publishing.',
    });
  }

  // ── Employee table ────────────────────────────────────────────────────────
  const headerIdx = rows.findIndex((r) => {
    const t = r.text.toLowerCase();
    return (
      t.includes('employee') &&
      t.includes('duration') &&
      (t.includes('activity') || t.includes('active'))
    );
  });

  const employees: ParsedEmployeeRow[] = [];
  const seen = new Set<string>();

  const pushRow = (row: Row) => {
    const parsed = rowToEmployee(row);
    if (!parsed) return;
    const key = parsed.cleanName.toLowerCase();
    if (seen.has(key)) return; // repeated header/page artefacts
    seen.add(key);
    employees.push(parsed);
  };

  if (headerIdx !== -1) {
    // Everything after the header on that page, plus every following page.
    const headerRow = rows[headerIdx];
    for (const r of rows) {
      const after =
        r.page > headerRow.page || (r.page === headerRow.page && r.y < headerRow.y);
      if (after) pushRow(r);
    }
  } else {
    warnings.push({
      level: 'warning',
      code: 'NO_TABLE_HEADER',
      message:
        'The "Employee / Duration / Activity" table header was not found. Rows were matched by pattern instead — please check the preview carefully.',
    });
    for (const r of rows) pushRow(r);
  }

  if (employees.length === 0) {
    throw Object.assign(
      new Error(
        'No employee rows could be read from this PDF. It may be a scanned image rather than a text PDF, ' +
          'or a different report type. Try the CSV/Excel import instead.',
      ),
      { code: 'NO_ROWS' },
    );
  }

  // ── Department inference ──────────────────────────────────────────────────
  const codeCounts = new Map<string, number>();
  for (const e of employees) {
    if (e.departmentCode) codeCounts.set(e.departmentCode, (codeCounts.get(e.departmentCode) ?? 0) + 1);
  }
  let inferredDepartmentCode: string | null = null;
  if (codeCounts.size > 0) {
    const [topCode, topCount] = [...codeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    inferredDepartmentCode = topCode;
    if (codeCounts.size > 1) {
      warnings.push({
        level: 'warning',
        code: 'MIXED_DEPARTMENT_CODES',
        message: `This report contains more than one department code (${[...codeCounts.keys()].join(
          ', ',
        )}). "${topCode}" was used for ${topCount} of ${employees.length} people.`,
      });
    }
  }

  // ── Day totals ────────────────────────────────────────────────────────────
  const year = range ? Number(range.start.slice(0, 4)) : new Date().getUTCFullYear();
  let dayTotals: ParsedDayTotal[] = [];
  try {
    dayTotals = extractDayTotals(rows, year);
  } catch {
    dayTotals = [];
  }

  // ── Self-validation against the report's own printed totals ───────────────
  const ourTotal = employees.reduce((sum, e) => sum + e.seconds, 0);
  if (printedTotalSeconds != null) {
    const diff = Math.abs(ourTotal - printedTotalSeconds);
    if (diff > 60) {
      warnings.push({
        level: 'warning',
        code: 'TOTAL_MISMATCH',
        message: `Our row total (${Math.round(ourTotal / 60)} min) differs from the total printed on the report (${Math.round(
          printedTotalSeconds / 60,
        )} min) by ${Math.round(diff / 60)} min. Some rows may be missing.`,
      });
    } else {
      warnings.push({
        level: 'info',
        code: 'TOTAL_MATCHED',
        message: `Verified: ${employees.length} rows totalling ${Math.round(
          ourTotal / 3600,
        )}h, matching the total printed on the report.`,
      });
    }
  }

  if (printedAvgActivity != null && employees.length > 0) {
    const ourAvg = employees.reduce((s, e) => s + e.activityPct, 0) / employees.length;
    if (Math.abs(ourAvg - printedAvgActivity) > 1.5) {
      warnings.push({
        level: 'warning',
        code: 'ACTIVITY_MISMATCH',
        message: `Our average activity (${ourAvg.toFixed(
          1,
        )}%) differs from the report's printed average (${printedAvgActivity}%).`,
      });
    }
  }

  return {
    source: 'PDF',
    title,
    startDate: range?.start ?? null,
    endDate: range?.end ?? null,
    inferredDepartmentCode,
    printedTotalSeconds,
    printedAvgActivity,
    employees,
    dayTotals,
    warnings,
  };
}
