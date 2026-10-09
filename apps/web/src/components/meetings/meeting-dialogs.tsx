"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MeetingDetail, MeetingParticipantRole } from "@lean/shared";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Button, DatePicker, Dialog, Field, Input, MultiPicker, OrgUnitSelect, Textarea, UserPicker, type PickerOption } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { dayKey, fmtTime, useTenantTz, zonedToIso } from "./meeting-bits";
import { detailKey } from "./meeting-room-panels";

function useRefresh(id: string) {
  const qc = useQueryClient();
  return (data?: MeetingDetail) => {
    if (data) qc.setQueryData(detailKey(id), data);
    qc.invalidateQueries({ queryKey: ["meetings"] });
  };
}

/** Toplantı bilgilerini (zaman, yer, organizatör, birim, misafirler) düzenler. */
export function EditMeetingDialog({ meeting, onClose }: { meeting: MeetingDetail; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const tz = useTenantTz();
  const refresh = useRefresh(meeting.id);
  const [title, setTitle] = useState(meeting.title);
  const [date, setDate] = useState(dayKey(meeting.startAt, tz));
  const [start, setStart] = useState(fmtTime(meeting.startAt, tz, "tr"));
  const [end, setEnd] = useState(fmtTime(meeting.endAt, tz, "tr"));
  const [location, setLocation] = useState(meeting.location ?? "");
  const [onlineUrl, setOnlineUrl] = useState(meeting.onlineUrl ?? "");
  const [organizerId, setOrganizerId] = useState<string | null>(meeting.organizer.id);
  const [orgUnitId, setOrgUnitId] = useState<string | null>(meeting.orgUnit?.id ?? null);
  const [guests, setGuests] = useState(meeting.guests.join(", "));

  const save = useMutation({
    mutationFn: () =>
      api.patch<MeetingDetail>(`/meetings/${meeting.id}`, {
        title: title.trim(),
        startAt: zonedToIso(date, start, tz),
        endAt: zonedToIso(date, end, tz),
        location: location.trim() || null,
        onlineUrl: onlineUrl.trim() || null,
        organizerId: organizerId ?? undefined,
        orgUnitId,
        guests: guests.split(",").map((g) => g.trim()).filter(Boolean),
      }),
    onSuccess: (data) => {
      refresh(data);
      toast.success(t("common.saved"));
      onClose();
    },
    onError: toast.error,
  });

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={t("meetingsModule.room.editMeeting")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!title.trim() || !date || !start || !end} loading={save.isPending} onClick={() => save.mutate()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("meetingsModule.titleField")} required className="sm:col-span-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t("meetingsModule.date")} required>
          <DatePicker value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("meetingsModule.startTime")} required>
          <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label={t("meetingsModule.endTime")} required>
          <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field label={t("meetingsModule.location")} className="sm:col-span-3">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label={t("meetingsModule.onlineUrl")} className="sm:col-span-3">
          <Input value={onlineUrl} onChange={(e) => setOnlineUrl(e.target.value)} placeholder="https://" />
        </Field>
        <Field label={t("meetingsModule.organizer")} className="sm:col-span-3 lg:col-span-2">
          <UserPicker value={organizerId} valueLabel={meeting.organizer.fullName} clearable={false} onChange={(id) => setOrganizerId(id)} />
        </Field>
        <Field label={t("meetingsModule.orgUnit")} className="sm:col-span-3 lg:col-span-1">
          <OrgUnitSelect value={orgUnitId} onChange={setOrgUnitId} />
        </Field>
        <Field label={t("meetingsModule.guests")} hint={t("meetingsModule.guestsHint")} className="sm:col-span-3">
          <Textarea rows={2} value={guests} onChange={(e) => setGuests(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

/** Katılımcı listesini düzenler (organizatör sabittir). */
export function ParticipantsDialog({ meeting, onClose }: { meeting: MeetingDetail; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const refresh = useRefresh(meeting.id);
  const roles = new Map<string, MeetingParticipantRole>(meeting.participants.map((p) => [p.userId, p.role]));
  const [selected, setSelected] = useState<PickerOption[]>(
    meeting.participants.filter((p) => p.role !== "ORGANIZER").map((p) => ({ id: p.userId, label: p.user.fullName })),
  );

  const save = useMutation({
    mutationFn: () =>
      api.put<MeetingDetail>(`/meetings/${meeting.id}/participants`, {
        participants: selected.map((s) => ({ userId: s.id, role: roles.get(s.id) ?? "PARTICIPANT" })),
      }),
    onSuccess: (data) => {
      refresh(data);
      toast.success(t("common.saved"));
      onClose();
    },
    onError: toast.error,
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("meetingsModule.room.editParticipants")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-500">
        {t("meetingsModule.organizer")}: <span className="font-medium text-slate-800">{meeting.organizer.fullName}</span>
      </p>
      <MultiPicker kind="user" selected={selected} onChange={setSelected} placeholder={t("meetingsModule.addParticipant")} />
    </Dialog>
  );
}

export function CancelMeetingDialog({ meeting, onClose }: { meeting: MeetingDetail; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const refresh = useRefresh(meeting.id);
  const [reason, setReason] = useState("");
  const cancel = useMutation({
    mutationFn: () => api.post<MeetingDetail>(`/meetings/${meeting.id}/cancel`, { reason: reason.trim() }),
    onSuccess: (data) => {
      refresh(data);
      onClose();
    },
    onError: toast.error,
  });
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={t("meetingsModule.room.cancelMeeting")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button variant="danger" disabled={!reason.trim()} loading={cancel.isPending} onClick={() => cancel.mutate()}>
            {t("meetingsModule.room.cancelMeeting")}
          </Button>
        </>
      }
    >
      <Field label={t("meetingsModule.room.cancelReason")} required>
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Field>
    </Dialog>
  );
}
