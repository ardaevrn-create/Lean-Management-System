-- CreateEnum
CREATE TYPE "StrategyPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SwotType" AS ENUM ('STRENGTH', 'WEAKNESS', 'OPPORTUNITY', 'THREAT');

-- CreateEnum
CREATE TYPE "StrategyPerspective" AS ENUM ('FINANCIAL', 'CUSTOMER', 'INTERNAL_PROCESS', 'LEARNING_GROWTH');

-- CreateEnum
CREATE TYPE "HoshinLevel" AS ENUM ('BREAKTHROUGH', 'ANNUAL', 'PRIORITY', 'DEPARTMENT', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "HoshinDirection" AS ENUM ('HIGHER_BETTER', 'LOWER_BETTER');

-- CreateEnum
CREATE TYPE "HoshinStatus" AS ENUM ('DRAFT', 'PROPOSED', 'IN_CATCHBALL', 'AGREED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HoshinCatchballType" AS ENUM ('PROPOSAL', 'COMMENT', 'COUNTER_PROPOSAL', 'AGREEMENT', 'REJECTION');

-- CreateEnum
CREATE TYPE "HoshinCatchballSide" AS ENUM ('PARENT', 'CHILD');

-- CreateEnum
CREATE TYPE "HoshinCorrelationTarget" AS ENUM ('GOAL', 'KPI', 'USER');

-- CreateEnum
CREATE TYPE "HoshinCorrelationStrength" AS ENUM ('STRONG', 'MEDIUM', 'WEAK');

-- CreateEnum
CREATE TYPE "HoshinUserRole" AS ENUM ('RESPONSIBLE', 'SUPPORT');

-- CreateTable
CREATE TABLE "StrategyPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "endYear" INTEGER NOT NULL,
    "status" "StrategyPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "vision" TEXT,
    "mission" TEXT,
    "values" TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousVersionId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SwotItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "type" "SwotType" NOT NULL,
    "text" TEXT NOT NULL,
    "impact" INTEGER NOT NULL DEFAULT 3,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SwotItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategicObjective" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "perspective" "StrategyPerspective",
    "ownerId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategicObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoshinGoal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "parentId" TEXT,
    "level" "HoshinLevel" NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "year" INTEGER,
    "objectiveId" TEXT,
    "orgUnitId" TEXT,
    "ownerId" TEXT,
    "kpiId" TEXT,
    "unit" TEXT NOT NULL DEFAULT '',
    "baseline" DECIMAL(18,4),
    "targetValue" DECIMAL(18,4),
    "direction" "HoshinDirection" NOT NULL DEFAULT 'HIGHER_BETTER',
    "aggregation" "KpiAggregation" NOT NULL DEFAULT 'LAST',
    "weight" DECIMAL(8,4) NOT NULL DEFAULT 1,
    "status" "HoshinStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" DATE,
    "endDate" DATE,
    "agreedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HoshinGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoshinMonthlyPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "plan" DECIMAL(18,4),
    "actual" DECIMAL(18,4),
    "comment" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HoshinMonthlyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoshinCatchballEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "side" "HoshinCatchballSide" NOT NULL,
    "type" "HoshinCatchballType" NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "proposedTarget" DECIMAL(18,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HoshinCatchballEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoshinCorrelation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "fromGoalId" TEXT NOT NULL,
    "targetType" "HoshinCorrelationTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "strength" "HoshinCorrelationStrength" NOT NULL DEFAULT 'MEDIUM',
    "userRole" "HoshinUserRole",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HoshinCorrelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StrategyPlan_tenantId_status_idx" ON "StrategyPlan"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SwotItem_tenantId_planId_idx" ON "SwotItem"("tenantId", "planId");

-- CreateIndex
CREATE INDEX "StrategicObjective_tenantId_planId_idx" ON "StrategicObjective"("tenantId", "planId");

-- CreateIndex
CREATE UNIQUE INDEX "StrategicObjective_planId_code_key" ON "StrategicObjective"("planId", "code");

-- CreateIndex
CREATE INDEX "HoshinGoal_tenantId_planId_level_idx" ON "HoshinGoal"("tenantId", "planId", "level");

-- CreateIndex
CREATE INDEX "HoshinGoal_tenantId_ownerId_idx" ON "HoshinGoal"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "HoshinGoal_tenantId_parentId_idx" ON "HoshinGoal"("tenantId", "parentId");

-- CreateIndex
CREATE INDEX "HoshinGoal_tenantId_kpiId_idx" ON "HoshinGoal"("tenantId", "kpiId");

-- CreateIndex
CREATE UNIQUE INDEX "HoshinGoal_planId_code_key" ON "HoshinGoal"("planId", "code");

-- CreateIndex
CREATE INDEX "HoshinMonthlyPlan_tenantId_goalId_idx" ON "HoshinMonthlyPlan"("tenantId", "goalId");

-- CreateIndex
CREATE UNIQUE INDEX "HoshinMonthlyPlan_goalId_period_key" ON "HoshinMonthlyPlan"("goalId", "period");

-- CreateIndex
CREATE INDEX "HoshinCatchballEntry_tenantId_goalId_createdAt_idx" ON "HoshinCatchballEntry"("tenantId", "goalId", "createdAt");

-- CreateIndex
CREATE INDEX "HoshinCorrelation_tenantId_planId_year_idx" ON "HoshinCorrelation"("tenantId", "planId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "HoshinCorrelation_planId_year_fromGoalId_targetType_targetI_key" ON "HoshinCorrelation"("planId", "year", "fromGoalId", "targetType", "targetId");

-- AddForeignKey
ALTER TABLE "StrategyPlan" ADD CONSTRAINT "StrategyPlan_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyPlan" ADD CONSTRAINT "StrategyPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwotItem" ADD CONSTRAINT "SwotItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StrategyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategicObjective" ADD CONSTRAINT "StrategicObjective_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StrategyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategicObjective" ADD CONSTRAINT "StrategicObjective_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoshinGoal" ADD CONSTRAINT "HoshinGoal_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StrategyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoshinGoal" ADD CONSTRAINT "HoshinGoal_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "HoshinGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoshinGoal" ADD CONSTRAINT "HoshinGoal_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "StrategicObjective"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoshinGoal" ADD CONSTRAINT "HoshinGoal_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoshinGoal" ADD CONSTRAINT "HoshinGoal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoshinGoal" ADD CONSTRAINT "HoshinGoal_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "KpiDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoshinGoal" ADD CONSTRAINT "HoshinGoal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoshinMonthlyPlan" ADD CONSTRAINT "HoshinMonthlyPlan_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "HoshinGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoshinCatchballEntry" ADD CONSTRAINT "HoshinCatchballEntry_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "HoshinGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoshinCatchballEntry" ADD CONSTRAINT "HoshinCatchballEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoshinCorrelation" ADD CONSTRAINT "HoshinCorrelation_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StrategyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoshinCorrelation" ADD CONSTRAINT "HoshinCorrelation_fromGoalId_fkey" FOREIGN KEY ("fromGoalId") REFERENCES "HoshinGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
