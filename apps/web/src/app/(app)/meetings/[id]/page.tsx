"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarPlus, ExternalLink, Lock, MapPin, Pencil, Play, Printer, RotateCcw, Square, User, XCircle } from "lucide-react";
import type { MeetingDetail } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Badge, Button, Card, CardBody, ConfirmDialog, LoadingBlock } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { KpiBoardPanel } from "@/components/kpi/board-tab";
import { fmtLongDate, fmtTime, MeetingStatusBadge, useTenantTz } from "@/components/meetings/meeting-bits";
import { CancelMeetingDialog, EditMeetingDialog, ParticipantsDialog } from "@/components/meetings/meeting-dialogs";
import {
  AgendaPanel, AttendancePanel, CarriedActionsPanel, DecisionsPanel, detailKey, MeetingActionsPanel, MinutesPanel,
} from "@/components/meetings/meeting-room-panels";

/** Toplantı odası: canlı toplantı yürütme (katılım, gündem notları, kararlar, aksiyonlar). */
export default function MeetingRoomPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const tz = useTenantTz();
  const key = detailKey(id);
  const { data: m, isLoading, error } = useQuery({ queryKey: key, queryFn: () => api.get<MeetingDetail>(`/meetings/${id}`), retry: false });

  const [editing, setEditing] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);

  const transition = useMutation({
    mutationFn: (action: "start" | "complete" | "reopen") => api.post<MeetingDetail>(`/meetings/${id}/${action}`),
    onSuccess: (data, action) => {
      qc.setQueryData(key, data);
      qc.invalidateQueries({ queryKey: ["meetings"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setCompleteOpen(false);
      toast.success(t(`meetingsModule.room.done.${action}`));
    },
    onError: (e) => {
      setCompleteOpen(false);
      toast.error(e);
    },
  });

  if (isLoading) return <LoadingBlock />;
  if (!m || error) {
    return (
      <Card>
        <CardBody>
          <p className="mb-3 text-sm text-slate-600">{t("meetingsModule.room.notFound")}</p>
          <Link href="/meetings" className="text-sm font-medium text-brand-600">
            {t("meetingsModule.room.back")}
          </Link>
        </CardBody>
      </Card>
    );
  }

  const unknownCount = m.participants.filter((p) => p.attendance === "UNKNOWN").length;
  const live = m.status === "IN_PROGRESS";

  return (
    <>
      <Link href="/meetings" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" />
        {t("meetingsModule.room.back")}
      </Link>

      <Card className={live ? "mb-4 border-amber-300 ring-1 ring-amber-200" : "mb-4"}>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-slate-500">{m.code}</span>
                <MeetingStatusBadge status={m.status} />
                {m.type && (
                  <Badge tone="indigo">
                    {m.type.name}
                    {m.type.tier ? ` · Tier ${m.type.tier}` : ""}
                  </Badge>
                )}
                {m.seriesId && <Badge tone="gray">{t("meetingsModule.recurring")}</Badge>}
                {live && <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-amber-500" aria-label={t("meetingsModule.status.IN_PROGRESS")} />}
              </div>
              <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">{m.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                <span className="font-medium capitalize">
                  {fmtLongDate(m.startAt, tz, locale)} · {fmtTime(m.startAt, tz, locale)}–{fmtTime(m.endAt, tz, locale)}
                </span>
                {m.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {m.location}
                  </span>
                )}
                {m.onlineUrl && (
                  <a href={m.onlineUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t("meetingsModule.onlineJoin")}
                  </a>
                )}
                <span className="inline-flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {m.organizer.fullName}
                </span>
                {m.orgUnit && <span>{m.orgUnit.name}</span>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {m.can.run && m.status === "PLANNED" && (
                <Button loading={transition.isPending && transition.variables === "start"} onClick={() => transition.mutate("start")}>
                  <Play className="h-4 w-4" />
                  {t("meetingsModule.room.start")}
                </Button>
              )}
              {m.can.run && (m.status === "PLANNED" || m.status === "IN_PROGRESS") && (
                <Button variant={live ? "primary" : "outline"} onClick={() => setCompleteOpen(true)}>
                  <Square className="h-4 w-4" />
                  {t("meetingsModule.room.complete")}
                </Button>
              )}
              {m.status === "COMPLETED" && m.can.manage && (
                <Button variant="outline" loading={transition.isPending && transition.variables === "reopen"} onClick={() => transition.mutate("reopen")}>
                  <RotateCcw className="h-4 w-4" />
                  {t("meetingsModule.room.reopen")}
                </Button>
              )}
              {m.can.edit && (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" />
                  {t("common.edit")}
                </Button>
              )}
              <Link
                href={`/meetings/${m.id}/print`}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Printer className="h-4 w-4" />
                {t("meetingsModule.room.print")}
              </Link>
              <Button variant="outline" onClick={() => api.download(`/meetings/${m.id}/ics`, `${m.code}.ics`).catch(toast.error)}>
                <CalendarPlus className="h-4 w-4" />
                .ics
              </Button>
              {m.can.run && (m.status === "PLANNED" || m.status === "IN_PROGRESS") && (
                <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setCancelOpen(true)}>
                  <XCircle className="h-4 w-4" />
                  {t("meetingsModule.room.cancelMeeting")}
                </Button>
              )}
            </div>
          </div>

          {m.status === "COMPLETED" && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <Lock className="h-4 w-4" />
              {t("meetingsModule.room.lockedBanner")}
            </div>
          )}
          {m.status === "CANCELLED" && (
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
              {t("meetingsModule.room.cancelledBanner")}: {m.cancelledReason}
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <AgendaPanel meeting={m} />
          {m.orgUnit && <KpiBoardPanel orgUnitId={m.orgUnit.id} title={t("meetingsModule.room.kpiBoard")} />}
          <DecisionsPanel meeting={m} />
          <MeetingActionsPanel meeting={m} />
          <MinutesPanel key={m.status} meeting={m} />
        </div>
        <div className="space-y-4">
          <AttendancePanel meeting={m} onEditParticipants={() => setParticipantsOpen(true)} />
          <CarriedActionsPanel meetingId={m.id} />
          <AttachmentsPanel entityType="MEETING" entityId={m.id} readOnly={m.status === "CANCELLED"} />
        </div>
      </div>

      {editing && <EditMeetingDialog meeting={m} onClose={() => setEditing(false)} />}
      {participantsOpen && <ParticipantsDialog meeting={m} onClose={() => setParticipantsOpen(false)} />}
      {cancelOpen && <CancelMeetingDialog meeting={m} onClose={() => setCancelOpen(false)} />}
      <ConfirmDialog
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        onConfirm={() => transition.mutate("complete")}
        loading={transition.isPending && transition.variables === "complete"}
        danger={false}
        title={t("meetingsModule.room.complete")}
        message={unknownCount > 0 ? t("meetingsModule.room.completeMissing", { n: unknownCount }) : t("meetingsModule.room.completeConfirm")}
        confirmLabel={t("meetingsModule.room.complete")}
      />
    </>
  );
}
