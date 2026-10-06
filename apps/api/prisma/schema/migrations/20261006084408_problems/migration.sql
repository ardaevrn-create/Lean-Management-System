-- CreateEnum
CREATE TYPE "ProblemSource" AS ENUM ('CUSTOMER_COMPLAINT', 'INTERNAL_AUDIT', 'EXTERNAL_AUDIT', 'PROCESS', 'SUPPLIER', 'KPI_DEVIATION', 'AUDIT_FINDING', 'MEETING', 'SUGGESTION', 'SAFETY', 'OTHER');

-- CreateEnum
CREATE TYPE "ProblemSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ProblemMethod" AS ENUM ('BASIC', 'EIGHT_D', 'A3');

-- CreateEnum
CREATE TYPE "ProblemPhase" AS ENUM ('DEFINITION', 'CONTAINMENT', 'ROOT_CAUSE', 'ACTIONS', 'VERIFICATION', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProblemCauseCategory" AS ENUM ('MAN', 'MACHINE', 'METHOD', 'MATERIAL', 'MEASUREMENT', 'ENVIRONMENT');

-- CreateEnum
CREATE TYPE "ProblemActionKind" AS ENUM ('CONTAINMENT', 'CORRECTIVE', 'PREVENTIVE', 'HORIZONTAL');

-- CreateEnum
CREATE TYPE "ProblemVerificationResult" AS ENUM ('EFFECTIVE', 'NOT_EFFECTIVE');

-- CreateTable
CREATE TABLE "Problem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source" "ProblemSource" NOT NULL DEFAULT 'OTHER',
    "sourceId" TEXT,
    "sourceLabel" TEXT,
    "orgUnitId" TEXT NOT NULL,
    "severity" "ProblemSeverity" NOT NULL DEFAULT 'MEDIUM',
    "method" "ProblemMethod" NOT NULL DEFAULT 'BASIC',
    "phase" "ProblemPhase" NOT NULL DEFAULT 'DEFINITION',
    "ownerId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "what" TEXT,
    "whereText" TEXT,
    "occurredAt" TIMESTAMP(3),
    "who" TEXT,
    "how" TEXT,
    "howMuch" TEXT,
    "isNot" TEXT,
    "customerName" TEXT,
    "customerRef" TEXT,
    "costImpact" DECIMAL(18,2),
    "containment" TEXT,
    "containmentNotNeeded" BOOLEAN NOT NULL DEFAULT false,
    "containmentSkipReason" TEXT,
    "targetCloseDate" DATE,
    "verificationDate" DATE,
    "closedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT,

    CONSTRAINT "ProblemMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemCause" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "category" "ProblemCauseCategory" NOT NULL,
    "text" TEXT NOT NULL,
    "parentId" TEXT,
    "isCandidate" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemCause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemWhyChain" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "causeId" TEXT NOT NULL,
    "rootCause" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProblemWhyChain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemWhyStep" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "question" TEXT,
    "answer" TEXT NOT NULL,

    CONSTRAINT "ProblemWhyStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemAction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "kind" "ProblemActionKind" NOT NULL,
    "rootCauseChainId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemVerification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "plannedDate" DATE,
    "result" "ProblemVerificationResult" NOT NULL,
    "note" TEXT,
    "verifiedById" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "fromPhase" "ProblemPhase",
    "toPhase" "ProblemPhase" NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Problem_tenantId_phase_idx" ON "Problem"("tenantId", "phase");

-- CreateIndex
CREATE INDEX "Problem_tenantId_orgUnitId_idx" ON "Problem"("tenantId", "orgUnitId");

-- CreateIndex
CREATE INDEX "Problem_tenantId_ownerId_idx" ON "Problem"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "Problem_tenantId_reportedById_idx" ON "Problem"("tenantId", "reportedById");

-- CreateIndex
CREATE UNIQUE INDEX "Problem_tenantId_number_key" ON "Problem"("tenantId", "number");

-- CreateIndex
CREATE INDEX "ProblemMember_tenantId_userId_idx" ON "ProblemMember"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProblemMember_problemId_userId_key" ON "ProblemMember"("problemId", "userId");

-- CreateIndex
CREATE INDEX "ProblemCause_tenantId_problemId_idx" ON "ProblemCause"("tenantId", "problemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProblemWhyChain_causeId_key" ON "ProblemWhyChain"("causeId");

-- CreateIndex
CREATE INDEX "ProblemWhyChain_tenantId_problemId_idx" ON "ProblemWhyChain"("tenantId", "problemId");

-- CreateIndex
CREATE INDEX "ProblemWhyStep_tenantId_chainId_idx" ON "ProblemWhyStep"("tenantId", "chainId");

-- CreateIndex
CREATE INDEX "ProblemAction_tenantId_problemId_idx" ON "ProblemAction"("tenantId", "problemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProblemAction_problemId_actionId_key" ON "ProblemAction"("problemId", "actionId");

-- CreateIndex
CREATE INDEX "ProblemVerification_tenantId_problemId_idx" ON "ProblemVerification"("tenantId", "problemId");

-- CreateIndex
CREATE INDEX "ProblemHistory_tenantId_problemId_idx" ON "ProblemHistory"("tenantId", "problemId");

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemMember" ADD CONSTRAINT "ProblemMember_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemMember" ADD CONSTRAINT "ProblemMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemCause" ADD CONSTRAINT "ProblemCause_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemCause" ADD CONSTRAINT "ProblemCause_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProblemCause"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemWhyChain" ADD CONSTRAINT "ProblemWhyChain_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemWhyChain" ADD CONSTRAINT "ProblemWhyChain_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "ProblemCause"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemWhyStep" ADD CONSTRAINT "ProblemWhyStep_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "ProblemWhyChain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemAction" ADD CONSTRAINT "ProblemAction_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemAction" ADD CONSTRAINT "ProblemAction_rootCauseChainId_fkey" FOREIGN KEY ("rootCauseChainId") REFERENCES "ProblemWhyChain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemVerification" ADD CONSTRAINT "ProblemVerification_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemVerification" ADD CONSTRAINT "ProblemVerification_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemHistory" ADD CONSTRAINT "ProblemHistory_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemHistory" ADD CONSTRAINT "ProblemHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
