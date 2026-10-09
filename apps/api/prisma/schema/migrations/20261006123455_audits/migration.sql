-- CreateEnum
CREATE TYPE "AuditTemplateType" AS ENUM ('FIVE_S', 'TPM_AUTONOMOUS', 'TPM_EQUIPMENT', 'SAFETY', 'LAYERED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AuditAreaType" AS ENUM ('PRODUCTION', 'OFFICE', 'WAREHOUSE', 'ANY');

-- CreateEnum
CREATE TYPE "AuditScaleType" AS ENUM ('ZERO_TO_FOUR', 'ZERO_TO_FIVE', 'YES_NO');

-- CreateEnum
CREATE TYPE "AuditPlanFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "AuditorAssignMode" AS ENUM ('FIXED', 'ROTATION');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EquipmentCriticality" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "TagColor" AS ENUM ('RED', 'BLUE');

-- CreateEnum
CREATE TYPE "TagCategory" AS ENUM ('LEAK', 'LOOSENESS', 'CONTAMINATION', 'DAMAGE', 'SAFETY', 'MISSING_PART', 'OTHER');

-- CreateEnum
CREATE TYPE "TagStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AuditTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "AuditTemplateType" NOT NULL DEFAULT 'FIVE_S',
    "areaType" "AuditAreaType" NOT NULL DEFAULT 'ANY',
    "scaleType" "AuditScaleType" NOT NULL DEFAULT 'ZERO_TO_FOUR',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "builtinKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditTemplateSection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "AuditTemplateSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditTemplateQuestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "guidance" TEXT,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "photoRequiredBelow" INTEGER,

    CONSTRAINT "AuditTemplateQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditArea" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "responsibleId" TEXT,
    "areaType" "AuditAreaType" NOT NULL DEFAULT 'PRODUCTION',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "orgUnitId" TEXT,
    "criticality" "EquipmentCriticality" NOT NULL DEFAULT 'B',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "frequency" "AuditPlanFrequency" NOT NULL DEFAULT 'MONTHLY',
    "assignMode" "AuditorAssignMode" NOT NULL DEFAULT 'ROTATION',
    "fixedAuditorId" TEXT,
    "crossAudit" BOOLEAN NOT NULL DEFAULT false,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditPlanArea" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,

    CONSTRAINT "AuditPlanArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditPlanAuditor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AuditPlanAuditor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL DEFAULT 1,
    "scaleType" "AuditScaleType" NOT NULL DEFAULT 'ZERO_TO_FOUR',
    "areaId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "planId" TEXT,
    "periodKey" TEXT,
    "auditorId" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "AuditStatus" NOT NULL DEFAULT 'PLANNED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "scorePct" DOUBLE PRECISION,
    "sectionScores" JSONB,
    "notes" TEXT,
    "cancelledReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditAnswer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "sectionTitle" TEXT NOT NULL,
    "sectionSortOrder" INTEGER NOT NULL DEFAULT 0,
    "sectionWeight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "questionText" TEXT NOT NULL,
    "guidance" TEXT,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "photoRequiredBelow" INTEGER,
    "score" INTEGER,
    "comment" TEXT,
    "isFinding" BOOLEAN NOT NULL DEFAULT false,
    "actionId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbnormalityTag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "equipmentId" TEXT,
    "areaId" TEXT NOT NULL,
    "color" "TagColor" NOT NULL DEFAULT 'RED',
    "category" "TagCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL,
    "openedById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "dueDate" DATE,
    "status" "TagStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closeNote" TEXT,
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbnormalityTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditTemplate_tenantId_idx" ON "AuditTemplate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditTemplate_tenantId_code_version_key" ON "AuditTemplate"("tenantId", "code", "version");

-- CreateIndex
CREATE INDEX "AuditTemplateSection_tenantId_templateId_idx" ON "AuditTemplateSection"("tenantId", "templateId");

-- CreateIndex
CREATE INDEX "AuditTemplateQuestion_tenantId_sectionId_idx" ON "AuditTemplateQuestion"("tenantId", "sectionId");

-- CreateIndex
CREATE INDEX "AuditArea_tenantId_idx" ON "AuditArea"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditArea_tenantId_code_key" ON "AuditArea"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Equipment_tenantId_areaId_idx" ON "Equipment"("tenantId", "areaId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_tenantId_code_key" ON "Equipment"("tenantId", "code");

-- CreateIndex
CREATE INDEX "AuditPlan_tenantId_idx" ON "AuditPlan"("tenantId");

-- CreateIndex
CREATE INDEX "AuditPlanArea_tenantId_idx" ON "AuditPlanArea"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditPlanArea_planId_areaId_key" ON "AuditPlanArea"("planId", "areaId");

-- CreateIndex
CREATE INDEX "AuditPlanAuditor_tenantId_idx" ON "AuditPlanAuditor"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditPlanAuditor_planId_userId_key" ON "AuditPlanAuditor"("planId", "userId");

-- CreateIndex
CREATE INDEX "Audit_tenantId_status_dueDate_idx" ON "Audit"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Audit_tenantId_areaId_idx" ON "Audit"("tenantId", "areaId");

-- CreateIndex
CREATE INDEX "Audit_tenantId_auditorId_idx" ON "Audit"("tenantId", "auditorId");

-- CreateIndex
CREATE UNIQUE INDEX "Audit_tenantId_number_key" ON "Audit"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Audit_tenantId_planId_areaId_periodKey_key" ON "Audit"("tenantId", "planId", "areaId", "periodKey");

-- CreateIndex
CREATE INDEX "AuditAnswer_tenantId_auditId_idx" ON "AuditAnswer"("tenantId", "auditId");

-- CreateIndex
CREATE INDEX "AbnormalityTag_tenantId_status_idx" ON "AbnormalityTag"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AbnormalityTag_tenantId_areaId_idx" ON "AbnormalityTag"("tenantId", "areaId");

-- CreateIndex
CREATE UNIQUE INDEX "AbnormalityTag_tenantId_number_key" ON "AbnormalityTag"("tenantId", "number");

-- AddForeignKey
ALTER TABLE "AuditTemplateSection" ADD CONSTRAINT "AuditTemplateSection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AuditTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditTemplateQuestion" ADD CONSTRAINT "AuditTemplateQuestion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "AuditTemplateSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditArea" ADD CONSTRAINT "AuditArea_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditArea" ADD CONSTRAINT "AuditArea_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "AuditArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPlan" ADD CONSTRAINT "AuditPlan_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AuditTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPlan" ADD CONSTRAINT "AuditPlan_fixedAuditorId_fkey" FOREIGN KEY ("fixedAuditorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPlanArea" ADD CONSTRAINT "AuditPlanArea_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AuditPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPlanArea" ADD CONSTRAINT "AuditPlanArea_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "AuditArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPlanAuditor" ADD CONSTRAINT "AuditPlanAuditor_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AuditPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPlanAuditor" ADD CONSTRAINT "AuditPlanAuditor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AuditTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "AuditArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AuditPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditAnswer" ADD CONSTRAINT "AuditAnswer_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbnormalityTag" ADD CONSTRAINT "AbnormalityTag_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "AuditArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbnormalityTag" ADD CONSTRAINT "AbnormalityTag_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbnormalityTag" ADD CONSTRAINT "AbnormalityTag_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbnormalityTag" ADD CONSTRAINT "AbnormalityTag_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
