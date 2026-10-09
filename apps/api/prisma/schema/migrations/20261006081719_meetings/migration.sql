-- CreateEnum
CREATE TYPE "MeetingCategory" AS ENUM ('TIER', 'DEPARTMENT', 'MANAGEMENT_REVIEW', 'PROJECT', 'OTHER');

-- CreateEnum
CREATE TYPE "MeetingFrequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'ADHOC');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MeetingParticipantRole" AS ENUM ('ORGANIZER', 'PARTICIPANT', 'OPTIONAL', 'GUEST');

-- CreateEnum
CREATE TYPE "MeetingAttendance" AS ENUM ('UNKNOWN', 'PRESENT', 'ABSENT', 'EXCUSED', 'LATE');

-- CreateTable
CREATE TABLE "MeetingType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "category" "MeetingCategory" NOT NULL DEFAULT 'OTHER',
    "tier" INTEGER,
    "frequency" "MeetingFrequency" NOT NULL DEFAULT 'WEEKLY',
    "defaultDurationMin" INTEGER NOT NULL DEFAULT 60,
    "defaultLocation" TEXT,
    "orgUnitId" TEXT,
    "facilitatorId" TEXT,
    "agendaTemplate" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingTypeMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MeetingParticipantRole" NOT NULL DEFAULT 'PARTICIPANT',

    CONSTRAINT "MeetingTypeMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "typeId" TEXT,
    "title" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "onlineUrl" TEXT,
    "organizerId" TEXT NOT NULL,
    "orgUnitId" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'PLANNED',
    "seriesId" TEXT,
    "summary" TEXT,
    "guests" TEXT[],
    "completedAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "createdById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingParticipant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MeetingParticipantRole" NOT NULL DEFAULT 'PARTICIPANT',
    "attendance" "MeetingAttendance" NOT NULL DEFAULT 'UNKNOWN',

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAgendaItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "presenterId" TEXT,
    "durationMin" INTEGER,
    "discussion" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MeetingAgendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingDecision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "agendaItemId" TEXT,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingType_tenantId_idx" ON "MeetingType"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingType_tenantId_code_key" ON "MeetingType"("tenantId", "code");

-- CreateIndex
CREATE INDEX "MeetingTypeMember_tenantId_idx" ON "MeetingTypeMember"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingTypeMember_typeId_userId_key" ON "MeetingTypeMember"("typeId", "userId");

-- CreateIndex
CREATE INDEX "Meeting_tenantId_startAt_idx" ON "Meeting"("tenantId", "startAt");

-- CreateIndex
CREATE INDEX "Meeting_tenantId_typeId_startAt_idx" ON "Meeting"("tenantId", "typeId", "startAt");

-- CreateIndex
CREATE INDEX "Meeting_tenantId_seriesId_idx" ON "Meeting"("tenantId", "seriesId");

-- CreateIndex
CREATE INDEX "Meeting_tenantId_organizerId_idx" ON "Meeting"("tenantId", "organizerId");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_tenantId_number_key" ON "Meeting"("tenantId", "number");

-- CreateIndex
CREATE INDEX "MeetingParticipant_tenantId_userId_idx" ON "MeetingParticipant"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingParticipant_meetingId_userId_key" ON "MeetingParticipant"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "MeetingAgendaItem_tenantId_meetingId_idx" ON "MeetingAgendaItem"("tenantId", "meetingId");

-- CreateIndex
CREATE INDEX "MeetingDecision_tenantId_meetingId_idx" ON "MeetingDecision"("tenantId", "meetingId");

-- AddForeignKey
ALTER TABLE "MeetingType" ADD CONSTRAINT "MeetingType_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingType" ADD CONSTRAINT "MeetingType_facilitatorId_fkey" FOREIGN KEY ("facilitatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingTypeMember" ADD CONSTRAINT "MeetingTypeMember_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "MeetingType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingTypeMember" ADD CONSTRAINT "MeetingTypeMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "MeetingType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAgendaItem" ADD CONSTRAINT "MeetingAgendaItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAgendaItem" ADD CONSTRAINT "MeetingAgendaItem_presenterId_fkey" FOREIGN KEY ("presenterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingDecision" ADD CONSTRAINT "MeetingDecision_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingDecision" ADD CONSTRAINT "MeetingDecision_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "MeetingAgendaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
