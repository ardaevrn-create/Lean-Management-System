"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowLeft, Camera, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CloudOff, ExternalLink, Flag, Loader2, MessageSquare, Play,
  Printer, Trash2, XCircle,
} from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { PRIORITIES, auditScaleMax, type ActionDetail, type AttachmentItem, type AuditAnswerItem, type AuditDetail, type AuditScaleType, type Priority } from "@lean/shared";
import { API_URL, ApiError, api, tokens } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAutosave } from "@/components/meetings/use-autosave";
import { Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, DatePicker, Dialog, Field, Input, LoadingBlock, Select, Textarea, UserPicker } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { A, AuditStatusBadge, ScoreBadge, addDaysStr, fmtDay, fmtPct, liveScore, scoreHex } from "./audit-bits";
import { enqueue, isNetworkError, readQueue, writeQueue, type AnswerPatch } from "./audit-queue";
import { uploadPhotos } from "./tags-tab";

/* ------------------------------ Fotoğraflar ------------------------------ */

/** Yetkili dosya indirme (token gerektirdiği için <img src> kullanılamaz); küçük resim için blob URL üretir. */
function AuthImage({ attachmentId, alt, className }: { attachmentId: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    fetch(`${API_URL}/attachments/${attachmentId}/download`, { headers: { Authorization: `Bearer ${tokens.access ?? ""}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("download"))))
      .then((b) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(b);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentId]);
  if (!url) return <div className={cn("animate-pulse rounded-lg bg-slate-200", className)} />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className={cn("rounded-lg object-cover", className)} />
    </a>
  );
}

function AnswerPhotos({ answerId, readOnly, onChanged }: { answerId: string; readOnly?: boolean; onChanged: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const key = ["attachments", "AUDIT_ANSWER", answerId];
  const { data } = useQuery({ queryKey: key, queryFn: () => api.get<AttachmentItem[]>("/attachments", { entityType: "AUDIT_ANSWER", entityId: answerId }) });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/attachments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      onChanged();
    },
    onError: toast.error,
  });
  if (!data?.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {data.map((a) => (
        <li key={a.id} className="relative">
          <AuthImage attachmentId={a.id} alt={a.fileName} className="h-16 w-16" />
          {!readOnly && (
            <button
              type="button"
              onClick={() => remove.mutate(a.id)}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 text-red-500 shadow ring-1 ring-slate-200"
              aria-label={t("common.delete")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------ Puan butonları ------------------------------ */

function scoreStyle(i: number, max: number, selected: boolean): string {
  const ratio = max ? i / max : 0;
  const tone = ratio <= 0.25 ? "red" : ratio < 0.75 ? "amber" : "green";
  if (!selected) return "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100";
  return tone === "red" ? "border-red-600 bg-red-600 text-white" : tone === "amber" ? "border-amber-500 bg-amber-500 text-white" : "border-emerald-600 bg-emerald-600 text-white";
}

function ScoreButtons({ scale, value, onChange, disabled }: { scale: AuditScaleType; value: number | null; onChange: (v: number) => void; disabled?: boolean }) {
  const { t } = useI18n();
  const max = auditScaleMax(scale);
  const options = Array.from({ length: max + 1 }, (_, i) => i);
  return (
    <div className={cn("grid gap-2", scale === "YES_NO" ? "grid-cols-2" : max === 5 ? "grid-cols-6" : "grid-cols-5")} role="radiogroup">
      {options.map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          disabled={disabled}
          onClick={() => onChange(i)}
          className={cn(
            "flex h-14 select-none items-center justify-center rounded-xl border-2 text-xl font-semibold transition-colors disabled:opacity-60",
            scoreStyle(i, max, value === i),
          )}
        >
          {scale === "YES_NO" ? (i === 1 ? t(`${A}.audit.yes`) : t(`${A}.audit.no`)) : i}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Bulgu için aksiyon ------------------------------ */

function FindingActionDialog({ audit, answer, onClose }: { audit: AuditDetail; answer: AuditAnswerItem | null; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState<string | null>(null);
  const [due, setDue] = useState(addDaysStr(14));
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const create = useMutation({
    mutationFn: () =>
      api.post<ActionDetail>(`/audits/${audit.id}/answers/${answer!.id}/action`, { title: title.trim() || undefined, ownerId: owner || undefined, dueDate: due, priority }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audits", "detail", audit.id] });
      qc.invalidateQueries({ queryKey: ["audits", "actions", audit.id] });
      toast.success(t(`${A}.audit.actionCreated`));
      onClose();
    },
    onError: toast.error,
  });
  if (!answer) return null;
  return (
    <Dialog
      open
      onClose={onClose}
      title={t(`${A}.audit.actionTitle`)}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={create.isPending} disabled={!due} onClick={() => create.mutate()}>
            {t("common.create")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-700">{answer.questionText}</p>
        <Field label={t("actions.title")}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${audit.area.name}: ${answer.questionText.slice(0, 60)}`} />
        </Field>
        <Field label={t(`${A}.audit.actionOwner`)}>
          <UserPicker value={owner} onChange={(id) => setOwner(id)} placeholder={audit.responsible?.fullName} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t(`${A}.audit.actionDue`)} required>
            <DatePicker value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label={t(`${A}.audit.actionPriority`)}>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`priority.${p}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

function problemHref(audit: AuditDetail, a: AuditAnswerItem): string {
  const label = `${audit.code} ${audit.area.name} – ${a.questionText.slice(0, 60)}`;
  const q = new URLSearchParams({ new: "1", source: "AUDIT_FINDING", sourceId: audit.id, sourceLabel: label });
  if (audit.area.orgUnit?.id) q.set("orgUnitId", audit.area.orgUnit.id);
  return `/problems?${q.toString()}`;
}

/* ------------------------------ Salt okunur cevaplar & özet ------------------------------ */

function CompletedView({ audit }: { audit: AuditDetail }) {
  const { t, locale } = useI18n();
  const [action, setAction] = useState<AuditAnswerItem | null>(null);
  const qc = useQueryClient();
  const sectionData = audit.sectionScores.filter((s) => s.scorePct !== null).map((s) => ({ name: s.title.replace(/\s*\(.*\)$/, ""), pct: s.scorePct as number }));
  const findings = audit.answers.filter((a) => a.isFinding);
  const bySection = useMemo(() => {
    const m = new Map<string, AuditAnswerItem[]>();
    for (const a of audit.answers) m.set(a.sectionTitle, [...(m.get(a.sectionTitle) ?? []), a]);
    return [...m];
  }, [audit.answers]);
  const max = auditScaleMax(audit.scaleType);

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-col items-center gap-2 py-6 text-center sm:flex-row sm:text-left">
          <div className="flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-full border-8" style={{ borderColor: scoreHex(audit.scorePct) }}>
            <span className="text-2xl font-bold tabular-nums text-slate-900">{fmtPct(audit.scorePct)}</span>
          </div>
          <div className="sm:ml-4">
            <p className="flex items-center justify-center gap-2 text-lg font-semibold text-slate-900 sm:justify-start">
              {audit.status === "COMPLETED" && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
              {audit.status === "COMPLETED" ? t(`${A}.audit.completedTitle`) : t(`${A}.status.${audit.status}`)}
            </p>
            <p className="text-sm text-slate-500">
              {audit.area.name} · {audit.template.name}
              {audit.completedAt && ` · ${fmtDay(audit.completedAt, locale)}`}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <Link href={`/audits/${audit.id}/print`}>
                <Button variant="outline">
                  <Printer className="h-4 w-4" />
                  {t(`${A}.audit.print`)}
                </Button>
              </Link>
              <Link href="/audits">
                <Button variant="ghost">{t(`${A}.audit.toList`)}</Button>
              </Link>
            </div>
          </div>
        </CardBody>
      </Card>

      {sectionData.length > 0 && (
        <Card>
          <CardHeader title={t(`${A}.audit.sectionScores`)} />
          <CardBody>
            <div style={{ height: Math.max(160, sectionData.length * 44) }} className="w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectionData} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `%${v}`} />
                  <Bar dataKey="pct" radius={[0, 4, 4, 0]} barSize={20} isAnimationActive={false}>
                    {sectionData.map((d, i) => (
                      <Cell key={i} fill={scoreHex(d.pct)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title={t(`${A}.audit.findingsList`)} />
        {findings.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">{t(`${A}.audit.noFindings`)}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {findings.map((f) => (
              <li key={f.id} className="space-y-2 p-4">
                <p className="text-sm text-slate-900">{f.questionText}</p>
                {f.comment && <p className="text-xs text-slate-500">{f.comment}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="red">
                    {f.score}/{max}
                  </Badge>
                  {f.actionId ? (
                    <Link href={`/actions/${f.actionId}`}>
                      <Button size="sm" variant="secondary">
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t(`${A}.audit.viewAction`)}
                      </Button>
                    </Link>
                  ) : (
                    audit.can.createAction && (
                      <Button size="sm" onClick={() => setAction(f)}>
                        {t(`${A}.audit.openAction`)}
                      </Button>
                    )
                  )}
                  <Link href={problemHref(audit, f)}>
                    <Button size="sm" variant="outline">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {t(`${A}.audit.openProblem`)}
                    </Button>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={t(`${A}.audit.answersTitle`)} />
        <CardBody className="space-y-5">
          {bySection.map(([title, items]) => (
            <section key={title}>
              <h3 className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-800">
                {title}
                <ScoreBadge pct={audit.sectionScores.find((s) => s.title === title)?.scorePct} />
              </h3>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {items.map((a) => (
                  <li key={a.id} className="space-y-1.5 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-slate-800">{a.questionText}</p>
                      <Badge tone={a.score === null ? "gray" : a.score >= max ? "green" : a.score / max >= 0.5 ? "amber" : "red"} className="shrink-0">
                        {a.score === null ? t(`${A}.audit.unscored`) : audit.scaleType === "YES_NO" ? (a.score ? t(`${A}.audit.yes`) : t(`${A}.audit.no`)) : `${a.score}/${max}`}
                      </Badge>
                    </div>
                    {a.comment && <p className="text-xs text-slate-500">{a.comment}</p>}
                    {a.isFinding && <Badge tone="red">{t(`${A}.audit.finding`)}</Badge>}
                    <AnswerPhotos answerId={a.id} readOnly onChanged={() => undefined} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {audit.notes && (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-slate-800">{t(`${A}.audit.notes`)}</h3>
              <p className="whitespace-pre-wrap text-sm text-slate-600">{audit.notes}</p>
            </div>
          )}
        </CardBody>
      </Card>
      {action && (
        <FindingActionDialog
          audit={audit}
          answer={action}
          onClose={() => {
            setAction(null);
            qc.invalidateQueries({ queryKey: ["audits", "detail", audit.id] });
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------ Yönetim (atama/iptal) ------------------------------ */

function ManageDialog({ audit, open, onClose }: { audit: AuditDetail; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const [auditor, setAuditor] = useState<{ id: string; label: string } | null>({ id: audit.auditor.id, label: audit.auditor.fullName });
  const [due, setDue] = useState(audit.dueDate);
  const [reason, setReason] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const save = useMutation({
    mutationFn: () => api.patch(`/audits/${audit.id}`, { auditorId: auditor?.id, dueDate: due }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audits"] });
      toast.success(t(`${A}.defs.saved`));
      onClose();
    },
    onError: toast.error,
  });
  const cancel = useMutation({
    mutationFn: () => api.post(`/audits/${audit.id}/cancel`, { reason: reason || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audits"] });
      toast.success(t(`${A}.audit.cancelled`));
      router.push("/audits");
    },
    onError: toast.error,
  });
  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={t(`${A}.audit.manage`)}
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
        <div className="space-y-3">
          <Field label={t(`${A}.common.auditor`)}>
            <UserPicker value={auditor?.id} valueLabel={auditor?.label} clearable={false} onChange={(id, opt) => setAuditor(id && opt ? { id, label: opt.label } : null)} />
          </Field>
          <Field label={t(`${A}.common.dueDate`)}>
            <DatePicker value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <div className="border-t border-slate-100 pt-3">
            <Button variant="danger" size="sm" onClick={() => setConfirmCancel(true)}>
              <XCircle className="h-4 w-4" />
              {t(`${A}.audit.cancel`)}
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        size="sm"
        title={t(`${A}.audit.cancel`)}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmCancel(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
              {t(`${A}.audit.cancel`)}
            </Button>
          </>
        }
      >
        <Field label={t(`${A}.audit.cancelReason`)}>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Dialog>
    </>
  );
}

/* ------------------------------ Ana saha ekranı ------------------------------ */

type SyncState = "idle" | "saving" | "saved" | "offline" | "error";

function NotesField({ audit }: { audit: AuditDetail }) {
  const { t } = useI18n();
  const [value, setValue] = useState(audit.notes ?? "");
  useAutosave(value, audit.notes ?? "", (v) => api.patch(`/audits/${audit.id}`, { notes: v || null }));
  return (
    <Field label={t(`${A}.audit.notes`)}>
      <Textarea rows={3} value={value} onChange={(e) => setValue(e.target.value)} placeholder={t(`${A}.audit.notesPlaceholder`)} className="text-base" />
    </Field>
  );
}

export function FieldAudit({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const detailKey = useMemo(() => ["audits", "detail", id], [id]);
  const { data: audit, isLoading, error } = useQuery({ queryKey: detailKey, queryFn: () => api.get<AuditDetail>(`/audits/${id}`) });

  const [step, setStep] = useState(0);
  const [local, setLocal] = useState<Record<string, AnswerPatch>>({});
  const [sync, setSync] = useState<{ state: SyncState; queued: number }>({ state: "idle", queued: 0 });
  const [openGuidance, setOpenGuidance] = useState<Record<string, boolean>>({});
  const [openComment, setOpenComment] = useState<Record<string, boolean>>({});
  const [flagged, setFlagged] = useState<{ ids: Set<string>; kind: "incomplete" | "photo" | null }>({ ids: new Set(), kind: null });
  const [actionFor, setActionFor] = useState<AuditAnswerItem | null>(null);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [manage, setManage] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const pending = useRef<Record<string, AnswerPatch>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const loadedQueue = useRef(false);

  const refreshQueuedCount = useCallback(() => Object.keys(readQueue(id)).length, [id]);

  /** Tek bir cevap değişikliğini sunucuya yazar; ağ hatasında sıraya alır. */
  const flushOne = useCallback(
    async (answerId: string) => {
      const patch = pending.current[answerId];
      if (!patch) return;
      delete pending.current[answerId];
      setSync((s) => ({ ...s, state: "saving" }));
      try {
        await api.patch(`/audits/${id}/answers/${answerId}`, patch);
        const queued = refreshQueuedCount();
        setSync({ state: queued ? "offline" : Object.keys(pending.current).length ? "saving" : "saved", queued });
      } catch (e) {
        if (isNetworkError(e)) {
          const q = enqueue(id, answerId, patch);
          setSync({ state: "offline", queued: Object.keys(q).length });
        } else {
          setSync((s) => ({ ...s, state: "error" }));
          toast.error(e);
          qc.invalidateQueries({ queryKey: detailKey });
        }
      }
    },
    [id, qc, detailKey, toast, refreshQueuedCount],
  );

  /** Sıradaki (çevrimdışı kalmış) değişiklikleri yeniden dener. */
  const flushQueue = useCallback(async () => {
    const queue = readQueue(id);
    const ids = Object.keys(queue);
    if (!ids.length) return;
    setSync((s) => ({ ...s, state: "saving" }));
    for (const answerId of ids) {
      try {
        await api.patch(`/audits/${id}/answers/${answerId}`, queue[answerId]);
        const rest = readQueue(id);
        delete rest[answerId];
        writeQueue(id, rest);
      } catch (e) {
        if (isNetworkError(e)) {
          setSync({ state: "offline", queued: Object.keys(readQueue(id)).length });
          return;
        }
        // Sunucu reddetti (ör. denetim kapandı): bu değişikliği düşür
        const rest = readQueue(id);
        delete rest[answerId];
        writeQueue(id, rest);
      }
    }
    setSync({ state: "saved", queued: 0 });
    qc.invalidateQueries({ queryKey: detailKey });
  }, [id, qc, detailKey]);

  /** Bekleyen tüm değişiklikleri hemen gönderir. */
  const flushAll = useCallback(async () => {
    for (const [k, timer] of Object.entries(timers.current)) {
      clearTimeout(timer);
      delete timers.current[k];
    }
    await Promise.all(Object.keys(pending.current).map((k) => flushOne(k)));
    await flushQueue();
  }, [flushOne, flushQueue]);

  const change = useCallback(
    (answer: AuditAnswerItem, patch: AnswerPatch, delay: number) => {
      const max = auditScaleMax(audit?.scaleType ?? "ZERO_TO_FOUR");
      const next = { ...patch };
      // Tam puan verilince bulgu işareti kalkar (aksiyon açılmamışsa) — sunucu kuralıyla aynı
      if (patch.score !== undefined && patch.score !== null && patch.score >= max && !answer.actionId) next.isFinding = false;
      setLocal((cur) => ({ ...cur, [answer.id]: { ...cur[answer.id], ...next } }));
      pending.current[answer.id] = { ...pending.current[answer.id], ...next };
      clearTimeout(timers.current[answer.id]);
      timers.current[answer.id] = setTimeout(() => {
        delete timers.current[answer.id];
        void flushOne(answer.id);
      }, delay);
      setSync((s) => ({ ...s, state: s.queued ? "offline" : "saving" }));
    },
    [audit?.scaleType, flushOne],
  );

  // Açılışta: sıradaki değişiklikleri arayüze uygula ve gönder; 'online' olayında yeniden dene
  useEffect(() => {
    if (!audit || loadedQueue.current) return;
    loadedQueue.current = true;
    const queue = readQueue(id);
    if (Object.keys(queue).length) {
      setLocal((cur) => ({ ...queue, ...cur }));
      setSync({ state: "offline", queued: Object.keys(queue).length });
      void flushQueue();
    }
  }, [audit, id, flushQueue]);
  useEffect(() => {
    const onOnline = () => void flushQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flushQueue]);

  // Sayfadan ayrılırken bekleyenleri gönder
  useEffect(() => {
    const timersRef = timers.current;
    const pendingRef = pending.current;
    return () => {
      for (const k of Object.keys(timersRef)) {
        clearTimeout(timersRef[k]);
        delete timersRef[k];
      }
      for (const k of Object.keys(pendingRef)) void flushOne(k);
    };
  }, [flushOne]);

  const start = useMutation({
    mutationFn: () => api.post<AuditDetail>(`/audits/${id}/start`),
    onSuccess: (d) => {
      qc.setQueryData(detailKey, d);
      qc.invalidateQueries({ queryKey: ["audits", "list"] });
      toast.success(t(`${A}.audit.started`));
    },
    onError: toast.error,
  });

  const merged = useMemo<AuditAnswerItem[]>(() => (audit?.answers ?? []).map((a) => ({ ...a, ...local[a.id] })), [audit?.answers, local]);
  const sections = useMemo(() => {
    const m = new Map<string, AuditAnswerItem[]>();
    for (const a of merged) m.set(a.sectionTitle, [...(m.get(a.sectionTitle) ?? []), a]);
    return [...m];
  }, [merged]);
  const live = useMemo(() => (audit ? liveScore(merged, audit.scaleType) : { pct: null, sections: [] }), [audit, merged]);

  const complete = useMutation({
    mutationFn: async () => {
      await flushAll();
      if (Object.keys(readQueue(id)).length) throw new Error(t(`${A}.audit.offline`, { n: Object.keys(readQueue(id)).length }));
      return api.post<AuditDetail>(`/audits/${id}/complete`);
    },
    onSuccess: (d) => {
      qc.setQueryData(detailKey, d);
      qc.invalidateQueries({ queryKey: ["audits"] });
      setConfirmComplete(false);
      setShowSummary(true);
      setFlagged({ ids: new Set(), kind: null });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (e) => {
      setConfirmComplete(false);
      if (e instanceof ApiError && (e.code === "ANSWERS_INCOMPLETE" || e.code === "PHOTO_REQUIRED")) {
        const ids = ((e.details as { answerIds?: string[] } | undefined)?.answerIds ?? []) as string[];
        setFlagged({ ids: new Set(ids), kind: e.code === "PHOTO_REQUIRED" ? "photo" : "incomplete" });
        if (ids[0]) gotoAnswer(ids[0]);
      } else toast.error(e);
    },
  });

  const gotoAnswer = (answerId: string) => {
    const idx = sections.findIndex(([, items]) => items.some((a) => a.id === answerId));
    if (idx >= 0) setStep(idx);
    setTimeout(() => document.getElementById(`q-${answerId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };

  const onPhoto = async (answerId: string, files: FileList | null) => {
    if (!files?.length) return;
    try {
      await uploadPhotos("AUDIT_ANSWER", answerId, Array.from(files));
      qc.invalidateQueries({ queryKey: ["attachments", "AUDIT_ANSWER", answerId] });
      qc.invalidateQueries({ queryKey: detailKey });
      toast.success(t(`${A}.audit.photoUploaded`));
    } catch (e) {
      if (isNetworkError(e)) toast.error(t(`${A}.audit.photoOffline`));
      else toast.error(e);
    }
  };

  if (isLoading) return <LoadingBlock />;
  if (error || !audit) return <p className="py-12 text-center text-sm text-slate-500">{t(`${A}.audit.notFound`)}</p>;

  const total = merged.length;
  const done = merged.filter((a) => a.score !== null).length;
  const max = auditScaleMax(audit.scaleType);
  const editable = audit.status === "IN_PROGRESS" && audit.can.perform;
  const invalidNow = (a: AuditAnswerItem) => a.score === null || (a.photoRequiredBelow != null && a.score < a.photoRequiredBelow && a.photoCount === 0);

  const header = (
    <div className="mb-4">
      <Link href="/audits" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        {t(`${A}.audit.back`)}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{audit.area.name}</h1>
          <p className="text-sm text-slate-500">
            <span className="font-mono">{audit.code}</span> · {audit.template.name} ({t(`${A}.common.version`, { n: audit.templateVersion })})
            {audit.equipment && ` · ${audit.equipment.name}`}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {audit.auditor.fullName} · {t(`${A}.dueOn`, { date: fmtDay(audit.dueDate, locale) })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AuditStatusBadge status={audit.status} overdue={audit.isOverdue} />
          {audit.can.manage && (audit.status === "PLANNED" || audit.status === "IN_PROGRESS") && (
            <Button variant="outline" size="sm" onClick={() => setManage(true)}>
              {t(`${A}.audit.reassign`)}
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  /* ---- Planlı: başlat ---- */
  if (audit.status === "PLANNED") {
    return (
      <>
        {header}
        <Card>
          <CardBody className="space-y-4 py-8 text-center">
            <p className="mx-auto max-w-md text-sm text-slate-600">{t(`${A}.audit.startHint`)}</p>
            <Button size="lg" className="h-14 w-full max-w-sm text-lg" loading={start.isPending} onClick={() => start.mutate()}>
              <Play className="h-5 w-5" />
              {t(`${A}.audit.start`)}
            </Button>
          </CardBody>
        </Card>
        <ManageDialog audit={audit} open={manage} onClose={() => setManage(false)} />
      </>
    );
  }

  /* ---- Tamamlanan / iptal / yetkisiz görüntüleme ---- */
  if (audit.status === "COMPLETED" || audit.status === "CANCELLED" || !editable || showSummary) {
    return (
      <>
        {header}
        {audit.status === "CANCELLED" && <p className="mb-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">{t(`${A}.audit.cancelledBanner`)} {audit.cancelledReason}</p>}
        {audit.status === "IN_PROGRESS" && !editable && <p className="mb-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">{t(`${A}.audit.readOnly`)}</p>}
        <CompletedView audit={{ ...audit, answers: merged }} />
        <ManageDialog audit={audit} open={manage} onClose={() => setManage(false)} />
      </>
    );
  }

  /* ---- Devam eden denetim: saha ekranı ---- */
  const current = sections[Math.min(step, sections.length - 1)];
  const [sectionTitle, items] = current ?? ["", []];
  const syncText =
    sync.state === "offline" ? t(`${A}.audit.offline`, { n: sync.queued }) : sync.state === "saving" ? t(`${A}.audit.saving`) : sync.state === "error" ? t(`${A}.audit.saveError`) : t(`${A}.audit.saved`);

  return (
    <div className="pb-28">
      {header}

      {/* Yapışkan durum çubuğu: anlık skor, ilerleme, kayıt durumu */}
      <div className="sticky top-14 z-10 -mx-4 mb-4 border-b border-slate-200 bg-white px-4 py-2 sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums" style={{ color: scoreHex(live.pct) }}>
              {fmtPct(live.pct)}
            </span>
            <span className="text-xs text-slate-500">{t(`${A}.audit.liveScore`)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">{t(`${A}.audit.answered`, { done, total })}</p>
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium",
              sync.state === "offline" ? "bg-amber-100 text-amber-800" : sync.state === "error" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600",
            )}
            aria-live="polite"
          >
            {sync.state === "saving" ? <Loader2 className="h-3 w-3 animate-spin" /> : sync.state === "offline" ? <CloudOff className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
            <span className="hidden sm:inline">{syncText}</span>
          </span>
        </div>
        {sync.state === "offline" && <p className="mt-1 text-xs text-amber-700 sm:hidden">{syncText}</p>}
        {/* Bölüm adımları */}
        <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {sections.map(([title, list], i) => {
            const answered = list.filter((a) => a.score !== null).length;
            const allDone = answered === list.length;
            return (
              <button
                key={title}
                type="button"
                onClick={() => setStep(i)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                  i === step ? "border-brand-600 bg-brand-600 text-white" : allDone ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-white text-slate-600",
                )}
              >
                {allDone && i !== step && <CheckCircle2 className="h-3.5 w-3.5" />}
                {title.split(/[—-]/)[0].trim() || i + 1}
                <span className="opacity-70">
                  {answered}/{list.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {flagged.kind && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">{t(`${A}.audit.incompleteTitle`)}</p>
            <p>{flagged.kind === "photo" ? t(`${A}.audit.photoMissing`, { n: flagged.ids.size }) : t(`${A}.audit.incomplete`, { n: flagged.ids.size })}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => gotoAnswer([...flagged.ids][0])}>
            {t(`${A}.audit.goto`)}
          </Button>
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold text-slate-900">
        {sectionTitle}
        <span className="ml-2 text-xs font-normal text-slate-500">{t(`${A}.audit.section`, { n: Math.min(step, sections.length - 1) + 1, total: sections.length })}</span>
      </h2>

      <div className="space-y-4">
        {items.map((a, qi) => {
          const photoNeeded = a.photoRequiredBelow != null && a.score !== null && a.score < a.photoRequiredBelow;
          const photoMissing = photoNeeded && a.photoCount === 0;
          const isFlagged = flagged.ids.has(a.id) && invalidNow(a);
          const canFinding = a.score !== null && a.score < max;
          return (
            <Card key={a.id} className={cn("scroll-mt-48", isFlagged && "border-red-400 ring-2 ring-red-200")}>
              <div id={`q-${a.id}`} className="space-y-3 p-4">
                <div className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">{qi + 1}</span>
                  <p className="text-base font-medium leading-snug text-slate-900">{a.questionText}</p>
                </div>
                {a.guidance && (
                  <div>
                    <button type="button" className="flex items-center gap-1 text-xs font-medium text-brand-700" onClick={() => setOpenGuidance((c) => ({ ...c, [a.id]: !c[a.id] }))}>
                      <ChevronDown className={cn("h-4 w-4 transition-transform", openGuidance[a.id] && "rotate-180")} />
                      {t(`${A}.audit.guidance`)}
                    </button>
                    {openGuidance[a.id] && <p className="mt-1 rounded-lg bg-slate-50 p-2 text-sm text-slate-600">{a.guidance}</p>}
                  </div>
                )}
                <ScoreButtons scale={audit.scaleType} value={a.score} onChange={(v) => change(a, { score: v }, 150)} />

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 active:bg-slate-100">
                    <Camera className="h-5 w-5" />
                    {t(`${A}.audit.photo`)}
                    {a.photoCount > 0 && <Badge tone="blue">{a.photoCount}</Badge>}
                    <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => (void onPhoto(a.id, e.target.files), (e.target.value = ""))} />
                  </label>
                  <button
                    type="button"
                    onClick={() => setOpenComment((c) => ({ ...c, [a.id]: !c[a.id] }))}
                    className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 active:bg-slate-100"
                  >
                    <MessageSquare className="h-5 w-5" />
                    {a.comment ? t(`${A}.audit.comment`) : t(`${A}.audit.addComment`)}
                  </button>
                  {canFinding && (
                    <button
                      type="button"
                      onClick={() => change(a, { isFinding: !a.isFinding }, 0)}
                      disabled={!!a.actionId}
                      aria-pressed={a.isFinding}
                      className={cn(
                        "inline-flex h-11 items-center gap-2 rounded-xl border-2 px-4 text-sm font-medium",
                        a.isFinding ? "border-red-500 bg-red-50 text-red-700" : "border-slate-300 bg-white text-slate-600",
                      )}
                      title={t(`${A}.audit.findingHint`)}
                    >
                      <Flag className="h-5 w-5" />
                      {t(`${A}.audit.finding`)}
                    </button>
                  )}
                  {photoMissing && <Badge tone="red">{t(`${A}.audit.photoRequired`)}</Badge>}
                  {!photoMissing && a.photoRequiredBelow != null && a.score === null && <span className="text-xs text-slate-400">{t(`${A}.audit.photoRequired`)} (&lt; {a.photoRequiredBelow})</span>}
                </div>

                {(openComment[a.id] || a.comment) && (
                  <Textarea
                    rows={2}
                    defaultValue={a.comment ?? ""}
                    placeholder={t(`${A}.audit.commentPlaceholder`)}
                    className="text-base"
                    onChange={(e) => change(a, { comment: e.target.value || null }, 800)}
                  />
                )}
                <AnswerPhotos answerId={a.id} onChanged={() => qc.invalidateQueries({ queryKey: detailKey })} />

                {a.isFinding && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-2">
                    {a.actionId ? (
                      <Link href={`/actions/${a.actionId}`}>
                        <Button size="sm" variant="secondary">
                          <ExternalLink className="h-3.5 w-3.5" />
                          {t(`${A}.audit.viewAction`)}
                        </Button>
                      </Link>
                    ) : (
                      <Button size="sm" onClick={() => void flushAll().then(() => setActionFor(a))}>
                        {t(`${A}.audit.openAction`)}
                      </Button>
                    )}
                    <Link href={problemHref(audit, a)}>
                      <Button size="sm" variant="outline">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {t(`${A}.audit.openProblem`)}
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {step >= sections.length - 1 && (
        <div className="mt-4">
          <NotesField audit={audit} />
        </div>
      )}

      {/* Alt gezinme çubuğu */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <Button variant="outline" size="lg" disabled={step <= 0} onClick={() => (setStep((s) => Math.max(0, s - 1)), window.scrollTo({ top: 0 }))} className="flex-1">
            <ChevronLeft className="h-5 w-5" />
            {t(`${A}.audit.prev`)}
          </Button>
          {step < sections.length - 1 ? (
            <Button size="lg" className="flex-1" onClick={() => (setStep((s) => Math.min(sections.length - 1, s + 1)), window.scrollTo({ top: 0 }))}>
              {t(`${A}.audit.next`)}
              <ChevronRight className="h-5 w-5" />
            </Button>
          ) : (
            <Button size="lg" className="flex-1" loading={complete.isPending} onClick={() => setConfirmComplete(true)}>
              <CheckCircle2 className="h-5 w-5" />
              {t(`${A}.audit.complete`)}
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmComplete}
        onClose={() => setConfirmComplete(false)}
        onConfirm={() => complete.mutate()}
        loading={complete.isPending}
        danger={false}
        title={t(`${A}.audit.complete`)}
        message={`${t(`${A}.audit.completeConfirm`)} (${fmtPct(live.pct)}, ${t(`${A}.audit.answered`, { done, total })})`}
        confirmLabel={t(`${A}.audit.complete`)}
      />
      <FindingActionDialog
        audit={audit}
        answer={actionFor}
        onClose={() => {
          setActionFor(null);
        }}
      />
      <ManageDialog audit={audit} open={manage} onClose={() => setManage(false)} />
    </div>
  );
}
