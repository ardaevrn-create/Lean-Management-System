"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, CheckCircle2, Loader2, Plus, Trash2, Users } from "lucide-react";
import type { ActionListItem, MeetingAgendaItemDto, MeetingAttendance, MeetingCarriedAction, MeetingDetail } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, Spinner, StatusBadge, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { DueDateCell } from "@/components/action-bits";
import { AttendanceBadge, fmtDate, useTenantTz } from "./meeting-bits";
import { MeetingActionDialog } from "./meeting-action-dialog";
import { useAutosave, type SaveState } from "./use-autosave";

export const detailKey = (id: string) => ["meetings", "detail", id];

function SaveIndicator({ state }: { state: SaveState }) {
  const { t } = useI18n();
  if (state === "idle") return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", state === "error" ? "text-red-600" : "text-slate-400")}>
      {state === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
      {state === "saved" && <Check className="h-3 w-3" />}
      {t(`meetingsModule.room.save.${state}`)}
    </span>
  );
}

/* ------------------------------ Katılım ------------------------------ */

const ATT_OPTIONS: { value: MeetingAttendance; active: string }[] = [
  { value: "PRESENT", active: "border-emerald-600 bg-emerald-600 text-white" },
  { value: "LATE", active: "border-amber-500 bg-amber-500 text-white" },
  { value: "EXCUSED", active: "border-blue-500 bg-blue-500 text-white" },
  { value: "ABSENT", active: "border-red-600 bg-red-600 text-white" },
];

export function AttendancePanel({ meeting, onEditParticipants }: { meeting: MeetingDetail; onEditParticipants: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const canEdit = meeting.can.edit;
  const key = detailKey(meeting.id);

  const save = useMutation({
    mutationFn: (items: { userId: string; attendance: MeetingAttendance }[]) => api.patch<MeetingDetail>(`/meetings/${meeting.id}/attendance`, { items }),
    onMutate: async (items) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<MeetingDetail>(key);
      if (prev) {
        const map = new Map(items.map((i) => [i.userId, i.attendance]));
        qc.setQueryData<MeetingDetail>(key, { ...prev, participants: prev.participants.map((p) => (map.has(p.userId) ? { ...p, attendance: map.get(p.userId)! } : p)) });
      }
      return { prev };
    },
    onSuccess: (data) => qc.setQueryData(key, data),
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(e);
    },
  });

  const unknown = meeting.participants.filter((p) => p.attendance === "UNKNOWN");
  const counts = {
    present: meeting.participants.filter((p) => p.attendance === "PRESENT" || p.attendance === "LATE").length,
    total: meeting.participants.length,
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Users className="h-4 w-4 text-brand-600" />
            {t("meetingsModule.room.attendance")}
            <Badge tone="gray">
              {counts.present}/{counts.total}
            </Badge>
            {meeting.attendanceRate !== null && <Badge tone="green">%{meeting.attendanceRate}</Badge>}
          </span>
        }
        actions={
          canEdit && (
            <Button variant="ghost" size="sm" onClick={onEditParticipants}>
              {t("meetingsModule.room.editParticipants")}
            </Button>
          )
        }
      />
      <CardBody className="space-y-2">
        {canEdit && unknown.length > 0 && (
          <Button variant="outline" size="sm" className="w-full" loading={save.isPending} onClick={() => save.mutate(unknown.map((p) => ({ userId: p.userId, attendance: "PRESENT" as const })))}>
            <CheckCircle2 className="h-4 w-4" />
            {t("meetingsModule.room.markAllPresent", { n: unknown.length })}
          </Button>
        )}
        <ul className="divide-y divide-slate-100">
          {meeting.participants.map((p) => (
            <li key={p.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{p.user.fullName}</p>
                <p className="text-xs text-slate-500">{t(`meetingsModule.roles.${p.role}`)}</p>
              </div>
              {canEdit ? (
                <div className="flex gap-1">
                  {ATT_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => save.mutate([{ userId: p.userId, attendance: p.attendance === o.value ? "UNKNOWN" : o.value }])}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                        p.attendance === o.value ? o.active : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
                      )}
                    >
                      {t(`meetingsModule.attendance.${o.value}`)}
                    </button>
                  ))}
                </div>
              ) : (
                <AttendanceBadge attendance={p.attendance} />
              )}
            </li>
          ))}
        </ul>
        {meeting.guests.length > 0 && (
          <p className="border-t border-slate-100 pt-2 text-xs text-slate-500">
            {t("meetingsModule.guests")}: {meeting.guests.join(", ")}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/* ------------------------------ Gündem ------------------------------ */

function AgendaRow({
  meeting, item, index, last, onMove, onRemove,
}: {
  meeting: MeetingDetail;
  item: MeetingAgendaItemDto;
  index: number;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const canEdit = meeting.can.edit;
  const [text, setText] = useState(item.discussion ?? "");
  const state = useAutosave(
    text,
    item.discussion ?? "",
    (v) => api.patch(`/meetings/${meeting.id}/agenda/${item.id}`, { discussion: v }),
    canEdit,
  );

  const toggle = useMutation({
    mutationFn: (isCompleted: boolean) => api.patch(`/meetings/${meeting.id}/agenda/${item.id}`, { isCompleted }),
    onSuccess: () => qc.invalidateQueries({ queryKey: detailKey(meeting.id) }),
    onError: toast.error,
  });

  return (
    <li className={cn("rounded-xl border p-3 sm:p-4", item.isCompleted ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200")}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => toggle.mutate(!item.isCompleted)}
          aria-label={t("meetingsModule.room.toggleDone")}
          className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:cursor-default",
            item.isCompleted ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 hover:border-emerald-500",
          )}
        >
          {item.isCompleted && <Check className="h-3.5 w-3.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs text-slate-400">{index + 1}.</span>
            <h4 className={cn("text-base font-semibold text-slate-900", item.isCompleted && "text-slate-500 line-through decoration-slate-300")}>{item.title}</h4>
            {item.durationMin && <span className="text-xs text-slate-400">{t("meetingsModule.minutes", { n: item.durationMin })}</span>}
            {item.presenter && <span className="text-xs text-slate-500">· {item.presenter.fullName}</span>}
          </div>
          {item.description && <p className="mt-0.5 text-sm text-slate-500">{item.description}</p>}
        </div>
        {canEdit && (
          <div className="flex shrink-0 gap-0.5">
            <button className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" disabled={index === 0} onClick={() => onMove(-1)} aria-label={t("meetingsModule.room.moveUp")}>
              <ArrowUp className="h-4 w-4" />
            </button>
            <button className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" disabled={last} onClick={() => onMove(1)} aria-label={t("meetingsModule.room.moveDown")}>
              <ArrowDown className="h-4 w-4" />
            </button>
            <button className="rounded p-1 text-red-400 hover:bg-red-50" onClick={onRemove} aria-label={t("common.delete")}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      <div className="mt-3 pl-9">
        {canEdit ? (
          <>
            <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("meetingsModule.room.discussionPlaceholder")} className="text-base sm:text-sm" />
            <div className="mt-1 h-4 text-right">
              <SaveIndicator state={state} />
            </div>
          </>
        ) : item.discussion ? (
          <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{item.discussion}</p>
        ) : null}
      </div>
    </li>
  );
}

export function AgendaPanel({ meeting }: { meeting: MeetingDetail }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [newTitle, setNewTitle] = useState("");
  const canEdit = meeting.can.edit;

  const save = useMutation({
    mutationFn: (items: MeetingAgendaItemDto[]) =>
      api.put(`/meetings/${meeting.id}/agenda`, {
        items: items.map((a) => ({ id: a.id.startsWith("new-") ? undefined : a.id, title: a.title, description: a.description, presenterId: a.presenter?.id ?? null, durationMin: a.durationMin })),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: detailKey(meeting.id) }),
    onError: toast.error,
  });

  const move = (i: number, dir: -1 | 1) => {
    const next = [...meeting.agenda];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    save.mutate(next);
  };
  const add = () => {
    if (!newTitle.trim()) return;
    save.mutate([...meeting.agenda, { id: `new-${Date.now()}`, sortOrder: meeting.agenda.length, title: newTitle.trim(), description: null, presenter: null, durationMin: null, discussion: null, isCompleted: false }]);
    setNewTitle("");
  };
  const done = meeting.agenda.filter((a) => a.isCompleted).length;

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            {t("meetingsModule.agenda")}
            <Badge tone="gray">
              {done}/{meeting.agenda.length}
            </Badge>
          </span>
        }
      />
      <CardBody className="space-y-3">
        {meeting.agenda.length === 0 && <p className="text-sm text-slate-500">{t("meetingsModule.noAgenda")}</p>}
        <ul className="space-y-3">
          {meeting.agenda.map((a, i) => (
            <AgendaRow
              key={a.id}
              meeting={meeting}
              item={a}
              index={i}
              last={i === meeting.agenda.length - 1}
              onMove={(d) => move(i, d)}
              onRemove={() => save.mutate(meeting.agenda.filter((x) => x.id !== a.id))}
            />
          ))}
        </ul>
        {canEdit && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={t("meetingsModule.room.newAgendaItem")} />
            <Button type="submit" variant="outline" disabled={!newTitle.trim()} loading={save.isPending}>
              <Plus className="h-4 w-4" />
              {t("meetingsModule.addAgendaItem")}
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

/* ------------------------------ Kararlar ------------------------------ */

export function DecisionsPanel({ meeting }: { meeting: MeetingDetail }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const canEdit = meeting.can.edit;
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: detailKey(meeting.id) });

  const add = useMutation({
    mutationFn: (v: string) => api.post(`/meetings/${meeting.id}/decisions`, { text: v }),
    onSuccess: () => {
      setText("");
      refresh();
    },
    onError: toast.error,
  });
  const update = useMutation({
    mutationFn: (v: { id: string; text: string }) => api.patch(`/meetings/${meeting.id}/decisions/${v.id}`, { text: v.text }),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError: toast.error,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/meetings/${meeting.id}/decisions/${id}`),
    onSuccess: refresh,
    onError: toast.error,
  });

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            {t("meetingsModule.room.decisions")}
            <Badge tone="gray">{meeting.decisions.length}</Badge>
          </span>
        }
      />
      <CardBody className="space-y-3">
        {meeting.decisions.length === 0 && <p className="text-sm text-slate-500">{t("meetingsModule.room.noDecisions")}</p>}
        <ol className="space-y-2">
          {meeting.decisions.map((d, i) => {
            const agendaItem = meeting.agenda.find((a) => a.id === d.agendaItemId);
            return (
              <li key={d.id} className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  {editing?.id === d.id ? (
                    <div className="flex gap-2">
                      <Input autoFocus value={editing.text} onChange={(e) => setEditing({ id: d.id, text: e.target.value })} onKeyDown={(e) => e.key === "Enter" && editing.text.trim() && update.mutate(editing)} />
                      <Button size="sm" loading={update.isPending} disabled={!editing.text.trim()} onClick={() => update.mutate(editing)}>
                        {t("common.save")}
                      </Button>
                    </div>
                  ) : (
                    <p
                      className={cn("whitespace-pre-wrap text-base text-slate-800 sm:text-sm", canEdit && "cursor-text")}
                      onClick={() => canEdit && setEditing({ id: d.id, text: d.text })}
                    >
                      {d.text}
                    </p>
                  )}
                  {agendaItem && <p className="mt-0.5 text-xs text-slate-400">{agendaItem.title}</p>}
                </div>
                {canEdit && (
                  <button className="rounded p-1 text-red-400 hover:bg-red-50" onClick={() => remove.mutate(d.id)} aria-label={t("common.delete")}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        {canEdit && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) add.mutate(text.trim());
            }}
          >
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("meetingsModule.room.newDecision")} />
            <Button type="submit" variant="outline" disabled={!text.trim()} loading={add.isPending}>
              <Plus className="h-4 w-4" />
              {t("meetingsModule.room.addDecision")}
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

/* ------------------------------ Tutanak özeti ------------------------------ */

export function MinutesPanel({ meeting }: { meeting: MeetingDetail }) {
  const { t } = useI18n();
  const canEdit = meeting.can.edit;
  const [text, setText] = useState(meeting.summary ?? "");
  const state = useAutosave(text, meeting.summary ?? "", (v) => api.patch(`/meetings/${meeting.id}`, { summary: v }), canEdit);
  return (
    <Card>
      <CardHeader title={t("meetingsModule.room.minutes")} actions={<SaveIndicator state={state} />} />
      <CardBody>
        {canEdit ? (
          <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("meetingsModule.room.minutesPlaceholder")} className="text-base sm:text-sm" />
        ) : meeting.summary ? (
          <p className="whitespace-pre-wrap text-sm text-slate-700">{meeting.summary}</p>
        ) : (
          <p className="text-sm text-slate-500">{t("meetingsModule.room.noMinutes")}</p>
        )}
      </CardBody>
    </Card>
  );
}

/* ------------------------------ Aksiyonlar ------------------------------ */

function ActionLine({ a, meetingLabel }: { a: ActionListItem; meetingLabel?: string }) {
  const { t } = useI18n();
  return (
    <li className={cn("rounded-lg border p-3", a.isOverdue ? "border-red-300 bg-red-50/60" : "border-slate-200")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/actions/${a.id}`} className="min-w-0 flex-1 text-sm font-medium text-slate-900 hover:text-brand-700">
          <span className="mr-1.5 font-mono text-xs text-slate-500">{a.code}</span>
          {a.title}
        </Link>
        <StatusBadge status={a.status} overdue={a.isOverdue} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-end justify-between gap-2 text-xs text-slate-500">
        <span>
          {a.owner.fullName}
          {meetingLabel && <span className="ml-1.5 text-slate-400">· {meetingLabel}</span>}
        </span>
        <span className={cn("text-right", a.isOverdue && "font-medium text-red-600")}>
          <DueDateCell action={a} />
        </span>
      </div>
      {a.isOverdue && <span className="sr-only">{t("actions.overdue")}</span>}
    </li>
  );
}

export function MeetingActionsPanel({ meeting }: { meeting: MeetingDetail }) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["meetings", "actions", meeting.id],
    queryFn: () => api.get<ActionListItem[]>(`/meetings/${meeting.id}/actions`),
  });
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            {t("meetingsModule.room.meetingActions")}
            <Badge tone="gray">{data?.length ?? 0}</Badge>
          </span>
        }
        actions={
          meeting.can.edit && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" />
              {t("meetingsModule.room.addAction")}
            </Button>
          )
        }
      />
      <CardBody>
        {isLoading ? (
          <Spinner />
        ) : data && data.length > 0 ? (
          <ul className="space-y-2">
            {data.map((a) => (
              <ActionLine key={a.id} a={a} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">{t("meetingsModule.room.noMeetingActions")}</p>
        )}
      </CardBody>
      {adding && <MeetingActionDialog meetingId={meeting.id} open onClose={() => setAdding(false)} />}
    </Card>
  );
}

export function CarriedActionsPanel({ meetingId }: { meetingId: string }) {
  const { t, locale } = useI18n();
  const tz = useTenantTz();
  const { data, isLoading } = useQuery({
    queryKey: ["meetings", "carried", meetingId],
    queryFn: () => api.get<MeetingCarriedAction[]>(`/meetings/${meetingId}/carried-actions`),
  });
  const open = data?.filter((a) => !a.closedSinceLast) ?? [];
  const closed = data?.filter((a) => a.closedSinceLast) ?? [];
  const overdue = open.filter((a) => a.isOverdue).length;
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            {t("meetingsModule.room.carried")}
            <Badge tone={overdue > 0 ? "red" : "gray"}>{open.length}</Badge>
          </span>
        }
      />
      <CardBody className="space-y-3">
        {isLoading ? (
          <Spinner />
        ) : !data || data.length === 0 ? (
          <EmptyState title={t("meetingsModule.room.noCarried")} className="py-6" />
        ) : (
          <>
            <ul className="space-y-2">
              {open.map((a) => (
                <ActionLine key={a.id} a={a} meetingLabel={`${a.meeting.code} · ${fmtDate(a.meeting.startAt, tz, locale)}`} />
              ))}
            </ul>
            {closed.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">{t("meetingsModule.room.closedSince")}</p>
                <ul className="space-y-2 opacity-80">
                  {closed.map((a) => (
                    <ActionLine key={a.id} a={a} meetingLabel={`${a.meeting.code} · ${fmtDate(a.meeting.startAt, tz, locale)}`} />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
