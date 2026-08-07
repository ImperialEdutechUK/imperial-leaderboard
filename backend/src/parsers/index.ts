import path from 'node:path';
import { badRequest, unprocessable } from '../lib/errors';
import { parsePdfReport } from './pdf';
import { detectColumns, parseTabularReport, type ColumnRole } from './tabular';
import type { ParsedReport } from './types';

export * from './types';
export { parseDateRange } from './pdf';
export { detectColumns, type ColumnRole } from './tabular';

export interface ParseOptions {
  columnMap?: Record<string, ColumnRole>;
  startDate?: string;
  endDate?: string;
}

/** Routes an uploaded file to the right parser based on its extension and magic bytes. */
export async function parseUpload(
  buffer: Buffer,
  originalName: string,
  options: ParseOptions = {},
): Promise<ParsedReport> {
  const ext = path.extname(originalName).toLowerCase();
  const isPdfMagic = buffer.subarray(0, 4).toString('latin1') === '%PDF';
  const isZipMagic = buffer[0] === 0x50 && buffer[1] === 0x4b; // xlsx is a zip

  try {
    if (ext === '.pdf' || isPdfMagic) return await parsePdfReport(buffer);
    if (ext === '.xlsx' || ext === '.xls' || ext === '.xlsm' || isZipMagic)
      return parseTabularReport(buffer, 'XLSX', options);
    if (ext === '.csv' || ext === '.tsv' || ext === '.txt')
      return parseTabularReport(buffer, 'CSV', options);
  } catch (err: any) {
    if (err?.code === 'COLUMN_MAPPING_REQUIRED') {
      throw unprocessable(err.message, { headers: err.headers, columnMap: err.columnMap });
    }
    throw unprocessable(err?.message ?? 'Could not read this file.');
  }

  throw badRequest(
    `Unsupported file type "${ext || 'unknown'}". Upload a .pdf, .csv, .xlsx or .xls file.`,
  );
}

export { detectColumns as detectCsvColumns };
