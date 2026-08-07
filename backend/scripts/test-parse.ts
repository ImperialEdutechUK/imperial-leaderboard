/**
 * Manual verification harness: run the real weekly report through the parser
 * and print exactly what came out, so the numbers can be eyeballed against
 * the PDF itself.
 *
 *   npx tsx scripts/test-parse.ts ../path/to/report.pdf
 */
import fs from 'node:fs';
import { parsePdfReport } from '../src/parsers/pdf';
import { formatDuration } from '../src/lib/text';

const file = process.argv[2];
if (!file) {
  console.error('Usage: tsx scripts/test-parse.ts <file.pdf>');
  process.exit(1);
}

(async () => {
  const buf = fs.readFileSync(file);
  const r = await parsePdfReport(buf);

  console.log('title              :', r.title);
  console.log('week               :', r.startDate, '->', r.endDate);
  console.log('department code    :', r.inferredDepartmentCode);
  console.log('printed total      :', r.printedTotalSeconds, formatDuration(r.printedTotalSeconds ?? 0));
  console.log('printed avg activ. :', r.printedAvgActivity + '%');
  console.log('rows parsed        :', r.employees.length);
  console.log('');
  console.log('  # | name                        | duration  | activity');
  console.log('----+-----------------------------+-----------+---------');
  r.employees.forEach((e, i) => {
    console.log(
      String(i + 1).padStart(3),
      '|',
      e.cleanName.padEnd(27),
      '|',
      formatDuration(e.seconds).padStart(9),
      '|',
      String(e.activityPct).padStart(6) + '%',
    );
  });

  const total = r.employees.reduce((s, e) => s + e.seconds, 0);
  const avg = r.employees.reduce((s, e) => s + e.activityPct, 0) / r.employees.length;
  console.log('');
  console.log('computed total     :', total, '=', formatDuration(total));
  console.log('computed avg activ.:', avg.toFixed(3) + '%');
  console.log('');
  console.log('day totals:');
  for (const d of r.dayTotals) console.log('  ', d.date, formatDuration(d.seconds));
  console.log('');
  console.log('warnings:');
  for (const w of r.warnings) console.log(`   [${w.level}] ${w.code}: ${w.message}`);
})();
