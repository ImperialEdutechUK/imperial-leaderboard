/**
 * Seed script.
 *
 * Idempotent — safe to run repeatedly. Creates:
 *   • the ten departments
 *   • the badge catalogue
 *   • the company-wide default scoring configuration
 *   • a bootstrap administrator account
 *   • optionally, the real week of 6–12 April 2026 for Course Development,
 *     taken verbatim from the sample Screenshot Monitor report, so the app has
 *     live data the moment it boots.
 *
 * Run with:  npm run seed
 */

import { PrismaClient } from '@prisma/client';
import { config } from '../src/config';
import { hashPassword } from '../src/lib/auth';
import { BADGE_CATALOGUE } from '../src/services/badges';
import { DEFAULT_SCORING } from '../src/services/scoring';
import { commitWeek } from '../src/services/imports';
import { normaliseName, slugify, toDisplayName } from '../src/lib/text';

const prisma = new PrismaClient();

/**
 * Department codes.
 *
 * "CDD" is confirmed — it is the suffix used on every name in the sample
 * report (e.g. "Aaisha (CDD)"). The other nine codes are PLACEHOLDERS chosen
 * to be plausible; they must be checked against how each department's people
 * are actually named in Screenshot Monitor. Getting a code wrong only means an
 * upload will not auto-route to that department — the manager can still pick
 * the department by hand on the import screen, and can correct the code in
 * Admin → Departments at any time.
 */
const DEPARTMENTS = [
  { name: 'Course Development', code: 'CDD', colour: '#7C5CFC', accent: '#A78BFA', icon: 'BookOpen', sortOrder: 1, verified: true },
  { name: 'Marketing',          code: 'MKT', colour: '#F472B6', accent: '#FB7185', icon: 'Megaphone', sortOrder: 2, verified: false },
  { name: 'Sales',              code: 'SLS', colour: '#34D399', accent: '#4ADE80', icon: 'TrendingUp', sortOrder: 3, verified: false },
  { name: 'Finance',            code: 'FIN', colour: '#FBBF24', accent: '#F59E0B', icon: 'Wallet', sortOrder: 4, verified: false },
  { name: 'Academic',           code: 'ACD', colour: '#38BDF8', accent: '#22D3EE', icon: 'GraduationCap', sortOrder: 5, verified: false },
  { name: 'Human Resources',    code: 'HRD', colour: '#A78BFA', accent: '#C084FC', icon: 'Users', sortOrder: 6, verified: false },
  { name: 'Customer Service',   code: 'CSD', colour: '#FB923C', accent: '#F97316', icon: 'Headphones', sortOrder: 7, verified: false },
  { name: 'IT',                 code: 'ITD', colour: '#22D3EE', accent: '#06B6D4', icon: 'Server', sortOrder: 8, verified: false },
  { name: 'Operations',         code: 'OPS', colour: '#F97066', accent: '#EF4444', icon: 'Settings2', sortOrder: 9, verified: false },
  { name: 'Management',         code: 'MGT', colour: '#94A3B8', accent: '#64748B', icon: 'Building2', sortOrder: 10, verified: false },
];

/**
 * The week of 6–12 April 2026, exactly as printed in the supplied report.
 * Verified: these 17 rows total 562h 12m and average 68.18% activity, which
 * matches the totals printed on the report itself (562h 12m / 68%).
 *
 * Note: Monday 6 April 2026 was Easter Monday and shows zero tracked hours
 * across the whole department, so this week is seeded with a 28-hour target
 * (4 days x 7h) rather than the standard 35.
 */
const SAMPLE_WEEK = {
  startDate: '2026-04-06',
  endDate: '2026-04-12',
  targetHoursOverride: 28,
  note: 'Easter Monday — 4-day week, target reduced to 28h',
  rows: [
    { rawName: 'Aaisha (CDD)',              seconds: 119760, activityPct: 65 },
    { rawName: 'Amana Nasik (CDD)',         seconds: 108060, activityPct: 44 },
    { rawName: 'Anjani De Silva (CDD)',     seconds: 120840, activityPct: 64 },
    { rawName: 'Dulmini (CDD)',             seconds: 119220, activityPct: 67 },
    { rawName: 'Fathima Rukaiya (CDD)',     seconds: 131460, activityPct: 66 },
    { rawName: 'Malinda Gunasekara (CDD)',  seconds: 120540, activityPct: 97 },
    { rawName: 'Malsha (CDD)',              seconds: 117120, activityPct: 60 },
    { rawName: 'Menuka (CDD)',              seconds: 115380, activityPct: 59 },
    { rawName: 'Milona (CDD)',              seconds: 122880, activityPct: 77 },
    { rawName: 'Nandika (CDD)',             seconds: 117300, activityPct: 60 },
    { rawName: 'Pasindu maddumage (CDD)',   seconds: 120060, activityPct: 81 },
    { rawName: 'Piyumi (CDD)',              seconds: 119220, activityPct: 50 },
    { rawName: 'Pragatheesh (CDD)',         seconds: 119100, activityPct: 74 },
    { rawName: 'Ridma Keshan (CDD)',        seconds: 117900, activityPct: 100 },
    { rawName: 'Sadeev (CDD)',              seconds: 118260, activityPct: 53 },
    { rawName: 'Yenushka (CDD)',            seconds: 116820, activityPct: 60 },
    { rawName: 'Yohan Madushanka (CDD)',    seconds: 120000, activityPct: 82 },
  ],
  dayTotals: [
    { date: '2026-04-06', seconds: 0 },
    { date: '2026-04-07', seconds: 502800 },
    { date: '2026-04-08', seconds: 487320 },
    { date: '2026-04-09', seconds: 501540 },
    { date: '2026-04-10', seconds: 511380 },
    { date: '2026-04-11', seconds: 20880 },
    { date: '2026-04-12', seconds: 0 },
  ],
  printedTotalSeconds: 2023920,
  printedAvgActivity: 68,
};

/** Canonical names for people whose report name is a first name only. */
const NAME_OVERRIDES: Record<string, string> = {
  'sadeev': 'Sadeev Silva',
};

const AVATAR_COLOURS = [
  '#7C5CFC', '#38BDF8', '#34D399', '#FBBF24', '#F472B6',
  '#F97066', '#A78BFA', '#22D3EE', '#4ADE80', '#FB923C',
];
function colourFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLOURS[h % AVATAR_COLOURS.length];
}

async function main() {
  console.log('▸ Seeding departments…');
  for (const d of DEPARTMENTS) {
    await prisma.department.upsert({
      where: { name: d.name },
      create: {
        name: d.name,
        slug: slugify(d.name),
        code: d.code,
        colour: d.colour,
        accent: d.accent,
        icon: d.icon,
        sortOrder: d.sortOrder,
        weeklyTargetHours: 35,
      },
      update: { colour: d.colour, accent: d.accent, icon: d.icon, sortOrder: d.sortOrder },
    });
  }
  console.log(`  ${DEPARTMENTS.length} departments ready.`);

  console.log('▸ Seeding badge catalogue…');
  for (const b of BADGE_CATALOGUE) {
    await prisma.badgeDefinition.upsert({
      where: { key: b.key },
      create: {
        key: b.key,
        name: b.name,
        description: b.description,
        icon: b.icon,
        tier: b.tier,
        colour: b.colour,
        sortOrder: b.sortOrder,
        rule: { builtIn: true },
      },
      update: {
        name: b.name,
        description: b.description,
        icon: b.icon,
        tier: b.tier,
        colour: b.colour,
        sortOrder: b.sortOrder,
      },
    });
  }
  console.log(`  ${BADGE_CATALOGUE.length} badges ready.`);

  console.log('▸ Seeding default scoring…');
  const existingGlobal = await prisma.scoringSetting.findFirst({ where: { departmentId: null } });
  if (!existingGlobal) {
    await prisma.scoringSetting.create({ data: { ...DEFAULT_SCORING, departmentId: null } });
    console.log('  Created company-wide default: 50% hours / 50% activity, 35h target.');
  } else {
    console.log('  Company-wide default already exists — left unchanged.');
  }

  console.log('▸ Seeding administrator…');
  const courseDev = await prisma.department.findUnique({ where: { name: 'Course Development' } });
  const adminEmail = config.seed.adminEmail.toLowerCase().trim();
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        name: config.seed.adminName,
        email: adminEmail,
        passwordHash: await hashPassword(config.seed.adminPassword),
        role: 'ADMIN',
        departmentId: courseDev?.id ?? null,
        mustChangePassword: true,
      },
    });
    console.log(`  Created admin ${adminEmail}`);
    console.log('  ⚠  Change this password on first sign-in.');
  } else {
    console.log(`  Admin ${adminEmail} already exists — password left unchanged.`);
  }

  if (!config.seed.sampleWeek) {
    console.log('▸ SEED_SAMPLE_WEEK is false — skipping sample data.');
    return;
  }

  if (!courseDev) throw new Error('Course Development department missing.');

  const alreadySeeded = await prisma.week.findFirst({
    where: { departmentId: courseDev.id, startDate: new Date(Date.UTC(2026, 3, 6)) },
  });
  if (alreadySeeded) {
    console.log('▸ Sample week already present — skipping.');
    return;
  }

  console.log('▸ Seeding the roster from the 6–12 Apr 2026 report…');
  for (const row of SAMPLE_WEEK.rows) {
    const reported = row.rawName.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const fullName = NAME_OVERRIDES[reported.toLowerCase()] ?? reported;

    const existing = await prisma.employee.findFirst({
      where: { departmentId: courseDev.id, fullName },
    });
    if (existing) continue;

    await prisma.employee.create({
      data: {
        fullName,
        displayName: toDisplayName(fullName),
        slug: slugify(fullName),
        departmentId: courseDev.id,
        avatarColour: colourFor(fullName),
        isManager: fullName === 'Sadeev Silva',
        jobTitle: fullName === 'Sadeev Silva' ? 'Department Manager' : null,
        aliases: {
          create: [...new Set([fullName, reported, row.rawName])]
            .map((a) => ({ raw: a, normalized: normaliseName(a) }))
            .filter((a, i, arr) => a.normalized && arr.findIndex((x) => x.normalized === a.normalized) === i),
        },
      },
    });
  }
  console.log(`  ${SAMPLE_WEEK.rows.length} people on the Course Development roster.`);

  console.log('▸ Importing the sample week…');
  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });

  const result = await commitWeek(prisma, {
    departmentId: courseDev.id,
    startDate: SAMPLE_WEEK.startDate,
    endDate: SAMPLE_WEEK.endDate,
    sourceType: 'PDF',
    sourceFile: 'Weekly report.pdf',
    targetHoursOverride: SAMPLE_WEEK.targetHoursOverride,
    note: SAMPLE_WEEK.note,
    printedTotalSeconds: SAMPLE_WEEK.printedTotalSeconds,
    printedAvgActivity: SAMPLE_WEEK.printedAvgActivity,
    dayTotals: SAMPLE_WEEK.dayTotals,
    uploadedById: admin?.id ?? null,
    rows: SAMPLE_WEEK.rows.map((r) => ({
      rawName: r.rawName,
      seconds: r.seconds,
      activityPct: r.activityPct,
    })),
  });

  await prisma.week.update({
    where: { id: result.weekId },
    data: { status: 'PUBLISHED', publishedAt: new Date() },
  });

  console.log(`  Imported and published: ${result.label} (${result.rowCount} people, ${result.badgesAwarded} badges).`);

  const top = await prisma.weekStat.findMany({
    where: { weekId: result.weekId },
    orderBy: { rank: 'asc' },
    take: 3,
    include: { employee: { select: { fullName: true } } },
  });
  console.log('  Podium:');
  top.forEach((s) => console.log(`    ${s.rank}. ${s.employee.fullName} — ${s.points} pts`));

  console.log('\n✔ Seed complete.');
}

main()
  .catch((e) => {
    console.error('✖ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
