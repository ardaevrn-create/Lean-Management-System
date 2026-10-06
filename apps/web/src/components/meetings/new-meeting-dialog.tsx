"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MAX_SERIES_MEETINGS, SERIES_FREQUENCIES, type MeetingDetail, type MeetingTypeItem, type SeriesFrequency } from "@lean/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button, Checkbox, DatePicker, Dialog, Field, Input, MultiPicker, OrgUnitSelect, Select, UserPicker, type PickerOption } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useTenantTz, zonedToIso } from "./meeting-bits";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export function NewMeetingDialog({ open, onClose, defaultTypeId }: { open: boolean; onClose: () => void; defaultTypeId?: string }) {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const { user } = useAuth();
  const tz = useTenantTz();

  const [typeId, setTypeId] = useState(defaultTypeId ?? "");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState("");
  const [location, setLocation] = useState("");
  const [onlineUrl, setOnlineUrl] = useState("");
  const [organizerId, setOrganizerId] = useState<string | null>(user?.id ?? null);
  const [organizerLabel, setOrganizerLabel] = useState<string | null>(user?.fullName ?? null);
  const [orgUnitId, setOrgUnitId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<PickerOption[]>([]);
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<SeriesFrequency>("WEEKLY");
  const [until, setUntil] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [skipWeekends, setSkipWeekends] = useState(true);

  const { data: types } = useQuery({ queryKey: ["meetings", "types"], queryFn: () => api.get<MeetingTypeItem[]>("/meetings/types"), enabled: open });
  const type = types?.find((x) => x.id === typeId);

  // Tip seçilince varsayılanları doldur
  useEffect(() => {
    if (!type) return;
    setDuration(String(type.defaultDurationMin));
    setLocation(type.defaultLocation ?? "");
    setOrgUnitId(type.orgUnit?.id ?? null);
    const people = new Map<string, PickerOption>();
    for (const m of type.members) people.set(m.user.id, { id: m.user.id, label: m.user.fullName });
    if (type.facilitator) people.set(type.facilitator.id, { id: type.facilitator.id, label: type.facilitator.fullName });
    if (user) people.delete(user.id);
    setParticipants([...people.values()]);
    if (type.frequency === "DAILY") setFrequency("DAILY");
    else if (type.frequency !== "ADHOC") setFrequency(type.frequency);
  }, [type, user]);

  const reset = () => {
    setTitle("");
    setDate("");
    setUntil("");
    setRecurring(false);
    setWeekdays([]);
  };

  const create = useMutation({
    mutationFn: async () => {
      const base = {
        typeId: typeId || undefined,
        title: title.trim() || undefined,
        durationMin: duration ? Number(duration) : undefined,
        location: location.trim() || undefined,
        onlineUrl: onlineUrl.trim() || undefined,
        organizerId: organizerId ?? undefined,
        orgUnitId: orgUnitId ?? undefined,
        participantIds: participants.map((p) => p.id),
      };
      if (recurring) {
        const res = await api.post<{ seriesId: string; count: number; meetings: { id: string }[] }>("/meetings/series", {
          ...base,
          firstDate: date,
          untilDate: until,
          time,
          frequency,
          weekdays: frequency === "WEEKLY" || frequency === "BIWEEKLY" ? (weekdays.length ? weekdays : undefined) : undefined,
          skipWeekends: frequency === "DAILY" ? skipWeekends : undefined,
        });
        return { kind: "series" as const, count: res.count, id: res.meetings[0]?.id };
      }
      const res = await api.post<MeetingDetail>("/meetings", { ...base, startAt: zonedToIso(date, time, tz) });
      return { kind: "single" as const, count: 1, id: res.id };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(r.kind === "series" ? t("meetingsModule.seriesCreated", { count: r.count }) : t("meetingsModule.created"));
      reset();
      onClose();
      if (r.kind === "single" && r.id) router.push(`/meetings/${r.id}`);
    },
    onError: toast.error,
  });

  const valid = (title.trim() || typeId) && date && time && (!recurring || until >= date) && (!recurring || until);
  const toggleDay = (d: number) => setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("meetingsModule.newMeeting")}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!valid} loading={create.isPending} onClick={() => create.mutate()}>
            {recurring ? t("meetingsModule.createSeries") : t("common.create")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("meetingsModule.type")} className="sm:col-span-2">
          <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">{t("meetingsModule.noType")}</option>
            {types?.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("meetingsModule.titleField")} required={!typeId} className="sm:col-span-2" hint={type ? t("meetingsModule.titleHint") : undefined}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type?.name} />
        </Field>
        <Field label={recurring ? t("meetingsModule.firstDate") : t("meetingsModule.date")} required>
          <DatePicker value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("meetingsModule.time")} required>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label={t("meetingsModule.duration")}>
          <Input type="number" min={5} max={1440} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="60" />
        </Field>
        <Field label={t("meetingsModule.location")}>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label={t("meetingsModule.onlineUrl")} className="sm:col-span-2">
          <Input value={onlineUrl} onChange={(e) => setOnlineUrl(e.target.value)} placeholder="https://" />
        </Field>
        <Field label={t("meetingsModule.organizer")}>
          <UserPicker
            value={organizerId}
            valueLabel={organizerLabel}
            clearable={false}
            onChange={(id, o) => {
              setOrganizerId(id);
              setOrganizerLabel(o?.label ?? null);
            }}
          />
        </Field>
        <Field label={t("meetingsModule.orgUnit")}>
          <OrgUnitSelect value={orgUnitId} onChange={setOrgUnitId} />
        </Field>
        <Field label={t("meetingsModule.participants")} className="sm:col-span-2">
          <MultiPicker kind="user" selected={participants} onChange={setParticipants} placeholder={t("meetingsModule.addParticipant")} />
        </Field>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
          <Checkbox label={t("meetingsModule.recurring")} checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
          {recurring && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label={t("meetingsModule.frequency")}>
                <Select value={frequency} onChange={(e) => setFrequency(e.target.value as SeriesFrequency)}>
                  {SERIES_FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {t(`meetingsModule.frequencies.${f}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("meetingsModule.untilDate")} required hint={t("meetingsModule.seriesLimit", { max: MAX_SERIES_MEETINGS })}>
                <DatePicker value={until} min={date} onChange={(e) => setUntil(e.target.value)} />
              </Field>
              {(frequency === "WEEKLY" || frequency === "BIWEEKLY") && (
                <Field label={t("meetingsModule.weekdays")} className="sm:col-span-2" hint={t("meetingsModule.weekdaysHint")}>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(d)}
                        className={cn(
                          "h-8 min-w-10 rounded-lg border px-2 text-xs font-medium",
                          weekdays.includes(d) ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
                        )}
                      >
                        {t(`meetingsModule.weekdayShort.${d}`)}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
              {frequency === "DAILY" && <Checkbox label={t("meetingsModule.skipWeekends")} checked={skipWeekends} onChange={(e) => setSkipWeekends(e.target.checked)} />}
              {frequency === "MONTHLY" && <p className="text-xs text-slate-500 sm:col-span-2">{t("meetingsModule.monthlyHint")}</p>}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
