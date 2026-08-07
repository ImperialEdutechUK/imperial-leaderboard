-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER');

-- CreateEnum
CREATE TYPE "WeekStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('PDF', 'CSV', 'XLSX', 'MANUAL', 'API');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('WEEK', 'MONTH', 'QUARTER', 'YEAR', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BadgeTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "code" TEXT,
    "colour" TEXT NOT NULL DEFAULT '#6366F1',
    "accent" TEXT NOT NULL DEFAULT '#8B5CF6',
    "icon" TEXT NOT NULL DEFAULT 'Sparkles',
    "weeklyTargetHours" DOUBLE PRECISION NOT NULL DEFAULT 35,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MANAGER',
    "departmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "jobTitle" TEXT,
    "avatarColour" TEXT NOT NULL DEFAULT '#6366F1',
    "isManager" BOOLEAN NOT NULL DEFAULT false,
    "excludeFromLeaderboard" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAlias" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "raw" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Week" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isoYear" INTEGER NOT NULL,
    "isoWeek" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "status" "WeekStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "sourceType" "SourceType" NOT NULL,
    "sourceFile" TEXT,
    "targetHoursOverride" DOUBLE PRECISION,
    "note" TEXT,
    "reportTotalSeconds" INTEGER,
    "reportAvgActivity" DOUBLE PRECISION,
    "parseWarnings" JSONB,
    "scoringSnapshot" JSONB,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Week_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayTotal" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "seconds" INTEGER NOT NULL,

    CONSTRAINT "DayTotal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeekStat" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL,
    "activityPct" DOUBLE PRECISION NOT NULL,
    "hoursScore" DOUBLE PRECISION NOT NULL,
    "activityScore" DOUBLE PRECISION NOT NULL,
    "basePoints" DOUBLE PRECISION NOT NULL,
    "bonusPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "points" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,
    "previousRank" INTEGER,
    "rankDelta" INTEGER,
    "isPersonalBest" BOOLEAN NOT NULL DEFAULT false,
    "daysWorked" INTEGER,
    "flags" JSONB,
    "bonusBreakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeekStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringSetting" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT,
    "hoursWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "activityWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "targetHours" DOUBLE PRECISION NOT NULL DEFAULT 35,
    "hoursCap" DOUBLE PRECISION NOT NULL DEFAULT 1.1,
    "maxPoints" INTEGER NOT NULL DEFAULT 1000,
    "bonusPersonalBest" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "bonusTargetMet" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "bonusHighActivity" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "highActivityThreshold" DOUBLE PRECISION NOT NULL DEFAULT 85,
    "minHoursToQualify" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "integrityFlagActivity" DOUBLE PRECISION NOT NULL DEFAULT 99,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoringSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BadgeDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "tier" "BadgeTier" NOT NULL DEFAULT 'BRONZE',
    "colour" TEXT NOT NULL DEFAULT '#F59E0B',
    "rule" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BadgeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BadgeAward" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "weekId" TEXT,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "context" JSONB,

    CONSTRAINT "BadgeAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prize" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT,
    "periodType" "PeriodType" NOT NULL DEFAULT 'MONTH',
    "periodKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reward" TEXT,
    "employeeId" TEXT,
    "pointsTotal" DOUBLE PRECISION,
    "isAutomatic" BOOLEAN NOT NULL DEFAULT true,
    "awardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_slug_key" ON "Department"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE INDEX "Department_isActive_sortOrder_idx" ON "Department"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_slug_key" ON "Employee"("slug");

-- CreateIndex
CREATE INDEX "Employee_departmentId_isActive_idx" ON "Employee"("departmentId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_departmentId_fullName_key" ON "Employee"("departmentId", "fullName");

-- CreateIndex
CREATE INDEX "EmployeeAlias_normalized_idx" ON "EmployeeAlias"("normalized");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeAlias_employeeId_normalized_key" ON "EmployeeAlias"("employeeId", "normalized");

-- CreateIndex
CREATE INDEX "Week_departmentId_status_startDate_idx" ON "Week"("departmentId", "status", "startDate");

-- CreateIndex
CREATE INDEX "Week_status_startDate_idx" ON "Week"("status", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "Week_departmentId_startDate_key" ON "Week"("departmentId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "DayTotal_weekId_date_key" ON "DayTotal"("weekId", "date");

-- CreateIndex
CREATE INDEX "WeekStat_employeeId_idx" ON "WeekStat"("employeeId");

-- CreateIndex
CREATE INDEX "WeekStat_weekId_rank_idx" ON "WeekStat"("weekId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "WeekStat_weekId_employeeId_key" ON "WeekStat"("weekId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringSetting_departmentId_key" ON "ScoringSetting"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeDefinition_key_key" ON "BadgeDefinition"("key");

-- CreateIndex
CREATE INDEX "BadgeAward_employeeId_idx" ON "BadgeAward"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeAward_employeeId_badgeId_weekId_key" ON "BadgeAward"("employeeId", "badgeId", "weekId");

-- CreateIndex
CREATE INDEX "Prize_periodType_periodKey_idx" ON "Prize"("periodType", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "Prize_departmentId_periodType_periodKey_title_key" ON "Prize"("departmentId", "periodType", "periodKey", "title");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAlias" ADD CONSTRAINT "EmployeeAlias_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Week" ADD CONSTRAINT "Week_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Week" ADD CONSTRAINT "Week_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayTotal" ADD CONSTRAINT "DayTotal_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekStat" ADD CONSTRAINT "WeekStat_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekStat" ADD CONSTRAINT "WeekStat_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringSetting" ADD CONSTRAINT "ScoringSetting_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeAward" ADD CONSTRAINT "BadgeAward_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeAward" ADD CONSTRAINT "BadgeAward_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "BadgeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeAward" ADD CONSTRAINT "BadgeAward_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prize" ADD CONSTRAINT "Prize_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prize" ADD CONSTRAINT "Prize_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
