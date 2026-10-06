-- CreateEnum
CREATE TYPE "SuggestionCategory" AS ENUM ('QUALITY', 'SAFETY', 'COST', 'PRODUCTIVITY', 'ENVIRONMENT', 'ERGONOMICS', 'CUSTOMER', 'OTHER');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('SUBMITTED', 'PRE_EVALUATION', 'COMMITTEE', 'ACCEPTED', 'REJECTED', 'ON_HOLD', 'IN_IMPLEMENTATION', 'IMPLEMENTED', 'CLOSED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PreEvaluationMode" AS ENUM ('DIRECT_MANAGER', 'ORG_UNIT_MANAGER');

-- CreateEnum
CREATE TYPE "EvaluationStage" AS ENUM ('PRE', 'COMMITTEE');

-- CreateEnum
CREATE TYPE "EvaluationDecision" AS ENUM ('FORWARD', 'ACCEPT', 'REJECT', 'HOLD', 'REVISE');

-- CreateEnum
CREATE TYPE "KaizenType" AS ENUM ('QUICK', 'EVENT', 'PROJECT');

-- CreateEnum
CREATE TYPE "KaizenStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "KaizenGainType" AS ENUM ('TANGIBLE', 'INTANGIBLE');

-- CreateEnum
CREATE TYPE "KaizenGainMetric" AS ENUM ('COST_TL', 'TIME_MIN', 'SCRAP', 'AREA_M2', 'DISTANCE_M', 'ENERGY_KWH', 'SAFETY', 'QUALITY', 'OTHER');

-- CreateTable
CREATE TABLE "SuggestionSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "criteria" JSONB NOT NULL DEFAULT '[]',
    "preEvaluation" "PreEvaluationMode" NOT NULL DEFAULT 'DIRECT_MANAGER',
    "committeeTeamId" TEXT,
    "autoAcceptMinScore" DOUBLE PRECISION,
    "autoAcceptMaxCost" DECIMAL(18,2),
    "pointRules" JSONB NOT NULL DEFAULT '{}',
    "rewardTiers" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuggestionSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "currentState" TEXT NOT NULL,
    "proposedState" TEXT NOT NULL,
    "expectedBenefit" TEXT NOT NULL,
    "category" "SuggestionCategory" NOT NULL DEFAULT 'OTHER',
    "orgUnitId" TEXT,
    "submittedById" TEXT NOT NULL,
    "estimatedCost" DECIMAL(18,2),
    "estimatedSaving" DECIMAL(18,2),
    "selfImplementable" BOOLEAN NOT NULL DEFAULT false,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "preEvaluatorId" TEXT,
    "preScore" DOUBLE PRECISION,
    "finalScore" DOUBLE PRECISION,
    "fastTrack" BOOLEAN NOT NULL DEFAULT false,
    "decisionNote" TEXT,
    "rejectionReason" TEXT,
    "revisionNote" TEXT,
    "implementerId" TEXT,
    "targetDate" DATE,
    "implementationNote" TEXT,
    "isSuggestionOfMonth" BOOLEAN NOT NULL DEFAULT false,
    "suggestionMonth" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preEvaluatedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "implementedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestionMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "SuggestionMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestionEvaluation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "stage" "EvaluationStage" NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "scores" JSONB NOT NULL DEFAULT '{}',
    "totalScore" DOUBLE PRECISION NOT NULL,
    "decision" "EvaluationDecision",
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuggestionEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestionEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuggestionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kaizen" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "type" "KaizenType" NOT NULL DEFAULT 'QUICK',
    "title" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "rootCause" TEXT,
    "beforeDescription" TEXT NOT NULL,
    "afterDescription" TEXT NOT NULL,
    "orgUnitId" TEXT,
    "leaderId" TEXT NOT NULL,
    "startDate" DATE,
    "endDate" DATE,
    "suggestionId" TEXT,
    "status" "KaizenStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "standardization" TEXT,
    "horizontalDeployment" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kaizen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KaizenMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kaizenId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "KaizenMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KaizenGain" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kaizenId" TEXT NOT NULL,
    "type" "KaizenGainType" NOT NULL,
    "metric" "KaizenGainMetric" NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL,
    "beforeValue" DECIMAL(18,4),
    "afterValue" DECIMAL(18,4),
    "annualSaving" DECIMAL(18,2),
    "financeApproved" BOOLEAN NOT NULL DEFAULT false,
    "financeApprovedById" TEXT,
    "financeApprovedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KaizenGain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsLedger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SuggestionSettings_tenantId_key" ON "SuggestionSettings"("tenantId");

-- CreateIndex
CREATE INDEX "Suggestion_tenantId_status_idx" ON "Suggestion"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Suggestion_tenantId_submittedById_idx" ON "Suggestion"("tenantId", "submittedById");

-- CreateIndex
CREATE INDEX "Suggestion_tenantId_orgUnitId_idx" ON "Suggestion"("tenantId", "orgUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "Suggestion_tenantId_number_key" ON "Suggestion"("tenantId", "number");

-- CreateIndex
CREATE INDEX "SuggestionMember_tenantId_userId_idx" ON "SuggestionMember"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SuggestionMember_suggestionId_userId_key" ON "SuggestionMember"("suggestionId", "userId");

-- CreateIndex
CREATE INDEX "SuggestionEvaluation_tenantId_suggestionId_idx" ON "SuggestionEvaluation"("tenantId", "suggestionId");

-- CreateIndex
CREATE UNIQUE INDEX "SuggestionEvaluation_suggestionId_stage_evaluatorId_key" ON "SuggestionEvaluation"("suggestionId", "stage", "evaluatorId");

-- CreateIndex
CREATE INDEX "SuggestionEvent_tenantId_suggestionId_idx" ON "SuggestionEvent"("tenantId", "suggestionId");

-- CreateIndex
CREATE INDEX "Kaizen_tenantId_status_idx" ON "Kaizen"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Kaizen_tenantId_leaderId_idx" ON "Kaizen"("tenantId", "leaderId");

-- CreateIndex
CREATE UNIQUE INDEX "Kaizen_tenantId_number_key" ON "Kaizen"("tenantId", "number");

-- CreateIndex
CREATE INDEX "KaizenMember_tenantId_userId_idx" ON "KaizenMember"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "KaizenMember_kaizenId_userId_key" ON "KaizenMember"("kaizenId", "userId");

-- CreateIndex
CREATE INDEX "KaizenGain_tenantId_kaizenId_idx" ON "KaizenGain"("tenantId", "kaizenId");

-- CreateIndex
CREATE INDEX "PointsLedger_tenantId_userId_idx" ON "PointsLedger"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PointsLedger_tenantId_userId_sourceType_sourceId_reason_key" ON "PointsLedger"("tenantId", "userId", "sourceType", "sourceId", "reason");

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_preEvaluatorId_fkey" FOREIGN KEY ("preEvaluatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_implementerId_fkey" FOREIGN KEY ("implementerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionMember" ADD CONSTRAINT "SuggestionMember_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "Suggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionMember" ADD CONSTRAINT "SuggestionMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionEvaluation" ADD CONSTRAINT "SuggestionEvaluation_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "Suggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionEvaluation" ADD CONSTRAINT "SuggestionEvaluation_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionEvent" ADD CONSTRAINT "SuggestionEvent_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "Suggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionEvent" ADD CONSTRAINT "SuggestionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kaizen" ADD CONSTRAINT "Kaizen_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kaizen" ADD CONSTRAINT "Kaizen_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kaizen" ADD CONSTRAINT "Kaizen_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kaizen" ADD CONSTRAINT "Kaizen_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kaizen" ADD CONSTRAINT "Kaizen_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "Suggestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KaizenMember" ADD CONSTRAINT "KaizenMember_kaizenId_fkey" FOREIGN KEY ("kaizenId") REFERENCES "Kaizen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KaizenMember" ADD CONSTRAINT "KaizenMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KaizenGain" ADD CONSTRAINT "KaizenGain_kaizenId_fkey" FOREIGN KEY ("kaizenId") REFERENCES "Kaizen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KaizenGain" ADD CONSTRAINT "KaizenGain_financeApprovedById_fkey" FOREIGN KEY ("financeApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsLedger" ADD CONSTRAINT "PointsLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
