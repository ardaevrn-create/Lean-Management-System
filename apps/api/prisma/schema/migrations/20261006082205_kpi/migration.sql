-- CreateEnum
CREATE TYPE "KpiCategory" AS ENUM ('QUALITY', 'PRODUCTIVITY', 'COST', 'DELIVERY', 'SAFETY', 'PEOPLE', 'ENVIRONMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "KpiDirection" AS ENUM ('HIGHER_BETTER', 'LOWER_BETTER', 'RANGE');

-- CreateEnum
CREATE TYPE "KpiFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "KpiAggregation" AS ENUM ('SUM', 'AVERAGE', 'LAST', 'MIN', 'MAX');

-- CreateEnum
CREATE TYPE "KpiStatus" AS ENUM ('GREEN', 'YELLOW', 'RED', 'NO_TARGET');

-- CreateEnum
CREATE TYPE "KpiValueSource" AS ENUM ('MANUAL', 'IMPORT', 'API', 'CALCULATED');

-- CreateTable
CREATE TABLE "KpiDefinition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "KpiCategory" NOT NULL DEFAULT 'OTHER',
    "unit" TEXT NOT NULL DEFAULT '',
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "direction" "KpiDirection" NOT NULL DEFAULT 'HIGHER_BETTER',
    "frequency" "KpiFrequency" NOT NULL DEFAULT 'MONTHLY',
    "aggregation" "KpiAggregation" NOT NULL DEFAULT 'AVERAGE',
    "warningTolerancePct" DECIMAL(8,4) NOT NULL DEFAULT 5,
    "entryDueDays" INTEGER NOT NULL DEFAULT 5,
    "orgUnitId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "dataEntryUserId" TEXT,
    "formula" TEXT,
    "formulaRefs" TEXT[],
    "startPeriod" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiTarget" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "target" DECIMAL(18,4) NOT NULL,
    "targetMax" DECIMAL(18,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiValue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "status" "KpiStatus" NOT NULL DEFAULT 'NO_TARGET',
    "source" "KpiValueSource" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "enteredById" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiValueRevision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,
    "oldValue" DECIMAL(18,4) NOT NULL,
    "newValue" DECIMAL(18,4) NOT NULL,
    "changedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiValueRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiDeviation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "rootCause" TEXT,
    "approvalStatus" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiDeviation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KpiDefinition_tenantId_orgUnitId_idx" ON "KpiDefinition"("tenantId", "orgUnitId");

-- CreateIndex
CREATE INDEX "KpiDefinition_tenantId_ownerId_idx" ON "KpiDefinition"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "KpiDefinition_tenantId_dataEntryUserId_idx" ON "KpiDefinition"("tenantId", "dataEntryUserId");

-- CreateIndex
CREATE UNIQUE INDEX "KpiDefinition_tenantId_code_key" ON "KpiDefinition"("tenantId", "code");

-- CreateIndex
CREATE INDEX "KpiTarget_tenantId_kpiId_idx" ON "KpiTarget"("tenantId", "kpiId");

-- CreateIndex
CREATE UNIQUE INDEX "KpiTarget_kpiId_period_key" ON "KpiTarget"("kpiId", "period");

-- CreateIndex
CREATE INDEX "KpiValue_tenantId_kpiId_idx" ON "KpiValue"("tenantId", "kpiId");

-- CreateIndex
CREATE INDEX "KpiValue_tenantId_status_idx" ON "KpiValue"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "KpiValue_kpiId_period_key" ON "KpiValue"("kpiId", "period");

-- CreateIndex
CREATE INDEX "KpiValueRevision_tenantId_valueId_idx" ON "KpiValueRevision"("tenantId", "valueId");

-- CreateIndex
CREATE INDEX "KpiDeviation_tenantId_approvalStatus_idx" ON "KpiDeviation"("tenantId", "approvalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "KpiDeviation_kpiId_period_key" ON "KpiDeviation"("kpiId", "period");

-- AddForeignKey
ALTER TABLE "KpiDefinition" ADD CONSTRAINT "KpiDefinition_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiDefinition" ADD CONSTRAINT "KpiDefinition_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiDefinition" ADD CONSTRAINT "KpiDefinition_dataEntryUserId_fkey" FOREIGN KEY ("dataEntryUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiTarget" ADD CONSTRAINT "KpiTarget_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "KpiDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiValue" ADD CONSTRAINT "KpiValue_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "KpiDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiValue" ADD CONSTRAINT "KpiValue_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiValueRevision" ADD CONSTRAINT "KpiValueRevision_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "KpiValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiValueRevision" ADD CONSTRAINT "KpiValueRevision_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiDeviation" ADD CONSTRAINT "KpiDeviation_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "KpiDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiDeviation" ADD CONSTRAINT "KpiDeviation_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "KpiValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiDeviation" ADD CONSTRAINT "KpiDeviation_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiDeviation" ADD CONSTRAINT "KpiDeviation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
