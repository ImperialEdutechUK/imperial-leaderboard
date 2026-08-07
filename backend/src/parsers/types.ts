export interface ParsedEmployeeRow {
  /** Name exactly as printed in the source file, e.g. "Pasindu maddumage (CDD)". */
  rawName: string;
  /** Name with any trailing "(DEPT)" removed. */
  cleanName: string;
  /** Department code found in the name, if any. */
  departmentCode: string | null;
  seconds: number;
  activityPct: number;
  /** Only present when the source provides a per-day breakdown. */
  daysWorked?: number;
}

export interface ParsedDayTotal {
  /** ISO date string, yyyy-mm-dd. */
  date: string;
  seconds: number;
}

export interface ParseWarning {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
}

export interface ParsedReport {
  source: 'PDF' | 'CSV' | 'XLSX' | 'MANUAL';
  /** Organisation / report title line, when present. */
  title: string | null;
  /** yyyy-mm-dd, Monday of the reporting week. Null when it could not be read. */
  startDate: string | null;
  /** yyyy-mm-dd, Sunday of the reporting week. */
  endDate: string | null;
  /** Department code inferred from employee name suffixes, e.g. "CDD". */
  inferredDepartmentCode: string | null;
  /** Totals as printed on the report itself, used to validate our parse. */
  printedTotalSeconds: number | null;
  printedAvgActivity: number | null;
  employees: ParsedEmployeeRow[];
  dayTotals: ParsedDayTotal[];
  warnings: ParseWarning[];
}
