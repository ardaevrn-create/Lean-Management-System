"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CalendarClock, MessageSquare, X } from "lucide-react";
import type { ActionComment, ActionDetail, ActionHistoryEntry, ActionStatus, DueDateRequest } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  Badge, Button, Card, CardBody, CardHeader, DatePicker, Dialog, Field, LoadingBlock, PriorityBadge, StatusBadge, Textarea,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { DueDateCell, ProgressBar } from "@/components/action-bits";

const TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  OPEN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["DONE", "OPEN", "CANCELLED"],
  DONE: ["VERIFIED", "IN_PROGRESS"],
  VERIFIED: [],
  CANCELLED: ["OPEN"],
};

export default function ActionDetailPage() {
  const { id } = (useParams<{ id: string }>() as { id: string });
  const { t, locale } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const key = ["actions", "detail", id];
  const { data: a, isLoading } = useQuery({ queryKey: key, queryFn: () => api.get<ActionDetail>(`/actions/${id}`) });

  const [noteFor, setNoteFor] = useState<ActionStatus | null>(null);
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [ddOpen, setDdOpen] = useState(false);
  const [ddDate, setDdDate] = useState("");
  const [ddReason, setDdReason] = useState("");
  const [progress, setProgress] = useState<number | null>(null);

  const done = (msg?: string) => () => {
    qc.invalidateQueries({ queryKey: ["actions"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    if (msg) toast.success(msg);
  };

  const changeStatus = useMutation({
    mutationFn: (v: { status: ActionStatus; note?: string }) => api.post<ActionDetail>(`/actions/${id}/status`, v),
    onSuccess: () => {
      done(t("actions.statusChanged"))();
      setNoteFor(null);
      setNote("");
    },
    onError: toast.error,
  });
  const saveProgress = useMutation({
    mutationFn: (p: number) => api.patch<ActionDetail>(`/actions/${id}`, { progress: p }),
    onSuccess: () => {
      done(t("common.saved"))();
      setProgress(null);
    },
    onError: toast.error,
  });
  const addComment = useMutation({
    mutationFn: (body: string) => api.post<ActionComment>(`/actions/${id}/comments`, { body }),
    onSuccess: () => {
      done()();
      setComment("");
    },
    onError: toast.error,
  });
  const requestDue = useMutation({
    mutationFn: (v: { newDueDate: string; reason: string }) => api.post<DueDateRequest>(`/actions/${id}/due-date-requests`, v),
    onSuccess: () => {
      done(t("actions.dueRequestSent"))();
      setDdOpen(false);
      setDdDate("");
      setDdReason("");
    },
    onError: toast.error,
  });
  const decide = useMutation({
    mutationFn: (v: { requestId: string; approve: boolean }) =>
      api.post<DueDateRequest>(`/actions/due-date-requests/${v.requestId}/decide`, { approve: v.approve }),
    onSuccess: done(t("common.saved")),
    onError: toast.error,
  });

  if (isLoading || !a) return <LoadingBlock />;

  const active = a.status === "OPEN" || a.status === "IN_PROGRESS";
  const canStatus = (s: ActionStatus) => (s === "VERIFIED" ? a.can.verify : a.can.changeStatus || a.can.verify);
  const transitions = TRANSITIONS[a.status].filter(canStatus);
  const pending = a.dueDateRequests.filter((r) => r.status === "PENDING");
  const shownProgress = progress ?? a.progress;

  const onTransition = (s: ActionStatus) => (s === "DONE" ? setNoteFor(s) : changeStatus.mutate({ status: s }));

  return (
    <>
      <Link href="/actions" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        {t("actions.backToList")}
      </Link>

      <Card className="mb-6">
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-slate-500">{a.code}</span>
                <StatusBadge status={a.status} overdue={a.isOverdue} />
                <PriorityBadge priority={a.priority} />
                {a.sourceType !== "MANUAL" && <Badge tone="indigo">{t(`actionSource.${a.sourceType}`)}</Badge>}
              </div>
              <h1 className="text-xl font-semibold text-slate-900">{a.title}</h1>
              {a.sourceLabel && <p className="text-sm text-slate-500">{a.sourceLabel}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {transitions.map((s) => (
                <Button
                  key={s}
                  variant={s === "VERIFIED" || s === "DONE" || s === "IN_PROGRESS" ? "primary" : s === "CANCELLED" ? "outline" : "secondary"}
                  loading={changeStatus.isPending && changeStatus.variables?.status === s}
                  onClick={() => onTransition(s)}
                >
                  {t(`actions.to.${s}`)}
                </Button>
              ))}
            </div>
          </div>

          <dl className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-500">{t("actions.owner")}</dt>
              <dd className="text-sm font-medium">{a.owner.fullName}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t("actions.dueDate")}</dt>
              <dd className="text-sm font-medium">
                <DueDateCell action={a} />
                {a.originalDueDate.slice(0, 10) !== a.dueDate.slice(0, 10) && (
                  <span className="text-xs text-slate-400">{t("actions.originalDue", { date: formatDate(a.originalDueDate, locale) })}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t("actions.orgUnit")}</dt>
              <dd className="text-sm font-medium">{a.orgUnit?.name ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t("actions.createdBy")}</dt>
              <dd className="text-sm font-medium">
                {a.createdBy.fullName} <span className="text-xs font-normal text-slate-400">{formatDate(a.createdAt, locale)}</span>
              </dd>
            </div>
          </dl>

          <div className="border-t border-slate-100 pt-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-slate-500">{t("actions.progress")}</span>
              <span className="text-sm font-medium tabular-nums">{shownProgress}%</span>
            </div>
            {a.can.edit || a.can.changeStatus ? (
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={shownProgress}
                  disabled={!active}
                  onChange={(e) => setProgress(Number(e.target.value))}
                  onMouseUp={() => progress !== null && progress !== a.progress && saveProgress.mutate(progress)}
                  onTouchEnd={() => progress !== null && progress !== a.progress && saveProgress.mutate(progress)}
                  onKeyUp={() => progress !== null && progress !== a.progress && saveProgress.mutate(progress)}
                  className="h-2 w-full cursor-pointer accent-brand-600 disabled:opacity-50"
                />
              </div>
            ) : (
              <ProgressBar value={a.progress} />
            )}
          </div>

          {a.description && (
            <div className="border-t border-slate-100 pt-4">
              <p className="mb-1 text-xs text-slate-500">{t("actions.description")}</p>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{a.description}</p>
            </div>
          )}
          {a.completionNote && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <p className="mb-0.5 text-xs font-medium">{t("actions.completionNote")}</p>
              {a.completionNote}
            </div>
          )}
          <div className="border-t border-slate-100 pt-4">
            <p className="mb-1 text-xs text-slate-500">{t("actions.supporters")}</p>
            {a.supporters.length === 0 ? (
              <span className="text-sm text-slate-400">-</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {a.supporters.map((s) => (
                  <Badge key={s.id} tone="gray">
                    {s.fullName}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Termin değişikliği talepleri */}
          <Card>
            <CardHeader
              title={t("actions.dueRequests")}
              actions={
                active && (
                  <Button size="sm" variant="outline" onClick={() => setDdOpen(true)}>
                    <CalendarClock className="h-4 w-4" />
                    {t("actions.requestDueChange")}
                  </Button>
                )
              }
            />
            <CardBody className="space-y-3">
              {a.dueDateRequests.length === 0 && <p className="text-sm text-slate-500">{t("actions.noDueRequests")}</p>}
              {a.dueDateRequests.map((r) => (
                <div key={r.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm">
                      <span className="font-medium">{formatDate(r.newDueDate, locale)}</span>
                      <span className="text-slate-500"> · {r.requestedBy.fullName}</span>
                    </div>
                    <Badge tone={r.status === "APPROVED" ? "green" : r.status === "REJECTED" ? "red" : "amber"}>{t(`actions.dueStatus.${r.status}`)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{r.reason}</p>
                  {r.status === "PENDING" && a.can.decideDueDate && (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" loading={decide.isPending} onClick={() => decide.mutate({ requestId: r.id, approve: true })}>
                        <Check className="h-4 w-4" />
                        {t("actions.approve")}
                      </Button>
                      <Button size="sm" variant="outline" loading={decide.isPending} onClick={() => decide.mutate({ requestId: r.id, approve: false })}>
                        <X className="h-4 w-4" />
                        {t("actions.reject")}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {pending.length > 0 && !a.can.decideDueDate && <p className="text-xs text-slate-500">{t("actions.awaitingDecision")}</p>}
            </CardBody>
          </Card>

          {/* Yorumlar */}
          <Card>
            <CardHeader title={t("actions.comments")} />
            <CardBody className="space-y-4">
              {a.comments.length === 0 && <p className="text-sm text-slate-500">{t("actions.noComments")}</p>}
              {a.comments.map((c) => (
                <div key={c.id} className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                    {c.user.fullName.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1 rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{c.user.fullName}</span> · {formatDateTime(c.createdAt, locale)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{c.body}</p>
                  </div>
                </div>
              ))}
              <div className="flex gap-2 border-t border-slate-100 pt-4">
                <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("actions.commentPlaceholder")} />
                <Button disabled={!comment.trim()} loading={addComment.isPending} onClick={() => addComment.mutate(comment.trim())}>
                  <MessageSquare className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("actions.send")}</span>
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <AttachmentsPanel entityType="ACTION" entityId={a.id} />
          <Card>
            <CardHeader title={t("actions.history")} />
            <CardBody>
              <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                {[...a.history].reverse().map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-brand-500 ring-4 ring-white" />
                    <p className="text-sm text-slate-800">{historyText(h, t)}</p>
                    {h.note && <p className="text-xs text-slate-500">{h.note}</p>}
                    <p className="text-xs text-slate-400">
                      {h.user?.fullName ?? "-"} · {formatDateTime(h.createdAt, locale)}
                    </p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* DONE notu */}
      <Dialog
        open={!!noteFor}
        onClose={() => setNoteFor(null)}
        title={t("actions.completeTitle")}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setNoteFor(null)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={!note.trim()} loading={changeStatus.isPending} onClick={() => noteFor && changeStatus.mutate({ status: noteFor, note: note.trim() })}>
              {t("actions.to.DONE")}
            </Button>
          </>
        }
      >
        <Field label={t("actions.completionNote")} required hint={t("actions.completionNoteHint")}>
          <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        </Field>
      </Dialog>

      {/* Termin değişikliği talebi */}
      <Dialog
        open={ddOpen}
        onClose={() => setDdOpen(false)}
        title={t("actions.requestDueChange")}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDdOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={!ddDate || !ddReason.trim()} loading={requestDue.isPending} onClick={() => requestDue.mutate({ newDueDate: ddDate, reason: ddReason.trim() })}>
              {t("actions.send")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t("actions.newDueDate")} required>
            <DatePicker value={ddDate} onChange={(e) => setDdDate(e.target.value)} />
          </Field>
          <Field label={t("actions.reason")} required>
            <Textarea value={ddReason} onChange={(e) => setDdReason(e.target.value)} />
          </Field>
        </div>
      </Dialog>
    </>
  );
}

function historyText(h: ActionHistoryEntry, t: (k: string, v?: Record<string, string | number>) => string): string {
  const tr = (v: string | null) => (v ? t(`actionStatus.${v}`) : "-");
  switch (h.type) {
    case "CREATED":
      return t("actions.hist.CREATED");
    case "STATUS_CHANGED":
      return t("actions.hist.STATUS_CHANGED", { from: tr(h.fromValue), to: tr(h.toValue) });
    case "DUE_DATE_CHANGED":
      return t("actions.hist.DUE_DATE_CHANGED", { from: formatDate(h.fromValue), to: formatDate(h.toValue) });
    case "PROGRESS":
      return t("actions.hist.PROGRESS", { from: h.fromValue ?? "0", to: h.toValue ?? "0" });
    case "OWNER_CHANGED":
      return t("actions.hist.OWNER_CHANGED", { from: h.fromValue ?? "-", to: h.toValue ?? "-" });
    default:
      return t("actions.hist.UPDATED");
  }
}
