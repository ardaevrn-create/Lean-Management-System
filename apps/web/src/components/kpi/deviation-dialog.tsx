"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CheckCircle2, Circle, Plus } from "lucide-react";
import { periodLabel, type CreateKpiDeviationActionRequest, type KpiDeviationDetail } from "@lean/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { Badge, Button, DatePicker, Dialog, Field, Input, LoadingBlock, StatusBadge, Textarea, UserPicker } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { EntryStateBadge, StatusChip, targetText, ValueText } from "./kpi-bits";

function Step({ done, label, hint }: { done: boolean; label: string; hint?: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}
      <span className={cn(done ? "text-slate-700" : "text-slate-500")}>
        {label}
        {hint && <span className="ml-1 text-xs text-slate-400">{hint}</span>}
      </span>
    </li>
  );
}

/**
 * Hedef altı KPI dönemi için sapma açıklaması + karşı önlem aksiyonları + onay.
 * Sarı: açıklama yeterli. Kırmızı: açıklama ve en az bir aksiyon zorunlu.
 */
export function DeviationDialog({ kpiId, period, open, onClose }: { kpiId: string; period: string; open: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const key = ["kpi", "deviation", kpiId, period];
  const { data, isLoading } = useQuery({
    queryKey: key,
    enabled: open,
    queryFn: () => api.get<KpiDeviationDetail>("/kpi/deviations/detail", { kpiId, period }),
  });

  const [explanation, setExplanation] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [aTitle, setATitle] = useState("");
  const [aOwner, setAOwner] = useState<string | null>(user?.id ?? null);
  const [aOwnerLabel, setAOwnerLabel] = useState<string | null>(user?.fullName ?? null);
  const [aDue, setADue] = useState("");

  const loadedId = data ? `${data.kpi.id}:${data.period}:${data.deviation?.id ?? "new"}` : null;
  useEffect(() => {
    if (!data) return;
    setExplanation(data.deviation?.explanation ?? "");
    setRootCause(data.deviation?.rootCause ?? "");
    setNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedId]);

  const refresh = (d?: KpiDeviationDetail) => {
    if (d) qc.setQueryData(key, d);
    qc.invalidateQueries({ queryKey: ["kpi"] });
    qc.invalidateQueries({ queryKey: ["actions"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const save = useMutation({
    mutationFn: () => api.put<KpiDeviationDetail>("/kpi/deviations", { kpiId, period, explanation: explanation.trim(), rootCause: rootCause.trim() || null }),
    onSuccess: (d) => {
      refresh(d);
      toast.success(t("kpiModule.deviation.saved"));
    },
    onError: toast.error,
  });
  const addAction = useMutation({
    mutationFn: (body: CreateKpiDeviationActionRequest) => api.post(`/kpi/deviations/${data!.deviation!.id}/actions`, body),
    onSuccess: async () => {
      setATitle("");
      setADue("");
      setAdding(false);
      toast.success(t("kpiModule.deviation.actionAdded"));
      refresh(await api.get<KpiDeviationDetail>("/kpi/deviations/detail", { kpiId, period }));
    },
    onError: toast.error,
  });
  const decide = useMutation({
    mutationFn: (approve: boolean) => api.post<KpiDeviationDetail>(`/kpi/deviations/${data!.deviation!.id}/decide`, { approve, note: note.trim() || undefined }),
    onSuccess: (d, approve) => {
      refresh(d);
      toast.success(t(approve ? "kpiModule.deviation.approved" : "kpiModule.deviation.rejected"));
    },
    onError: toast.error,
  });

  const dev = data?.deviation ?? null;
  const explained = !!dev && dev.approvalStatus !== "REJECTED" && dev.explanation.trim().length > 0;
  const actionsOk = !data?.needsActions || (data?.actionCount ?? 0) >= 1;
  const dirty = !dev || dev.explanation !== explanation.trim() || (dev.rootCause ?? "") !== rootCause.trim();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {t("kpiModule.deviation.title")}
          {data && <EntryStateBadge state={data.entryState} />}
        </span>
      }
      footer={
        <>
          {data && (
            <Link
              href={`/problems?${new URLSearchParams({
                new: "1",
                source: "KPI_DEVIATION",
                sourceId: data.deviation?.id ?? `${data.kpi.id}:${data.period}`,
                sourceLabel: `KPI ${data.kpi.code} ${data.period}: ${data.kpi.name}`,
                orgUnitId: data.kpi.orgUnit.id,
              })}`}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t("kpiModule.deviation.openProblem")}
            </Link>
          )}
          <Button variant="outline" onClick={onClose}>{t("common.close")}</Button>
        </>
      }
    >
      {isLoading || !data ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/kpi/${data.kpi.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                {data.kpi.code} — {data.kpi.name}
              </Link>
              <StatusChip status={data.status} />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
              <span>{periodLabel(data.period, locale)}</span>
              <span>
                {t("kpiModule.actual")}: <ValueText value={data.value} kpi={data.kpi} locale={locale} />
              </span>
              <span>
                {t("kpiModule.target")}: {targetText(data.target, data.targetMax, data.kpi, locale)} {data.kpi.unit}
              </span>
            </div>
          </div>

          <ul className="space-y-1.5">
            <Step done={explained} label={t("kpiModule.deviation.reqExplanation")} />
            {data.needsActions && (
              <Step done={actionsOk} label={t("kpiModule.deviation.reqAction")} hint={t("kpiModule.deviation.actionCount", { count: data.actionCount })} />
            )}
            <Step done={dev?.approvalStatus === "APPROVED"} label={t("kpiModule.deviation.reqApproval")} />
          </ul>

          {dev?.approvalStatus === "REJECTED" && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">{t("kpiModule.deviation.rejectedNotice")}</p>
                {dev.decisionNote && <p className="mt-0.5">{dev.decisionNote}</p>}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Field label={t("kpiModule.deviation.explanation")} required hint={t("kpiModule.deviation.explanationHint")}>
              <Textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={3} />
            </Field>
            <Field label={t("kpiModule.deviation.rootCause")}>
              <Textarea value={rootCause} onChange={(e) => setRootCause(e.target.value)} rows={2} />
            </Field>
            <Button loading={save.isPending} disabled={!explanation.trim() || !dirty} onClick={() => save.mutate()}>
              <Check className="h-4 w-4" />
              {t("kpiModule.deviation.saveExplanation")}
            </Button>
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900">{t("kpiModule.deviation.actions")}</h4>
              <Button size="sm" variant="outline" disabled={!dev} onClick={() => setAdding((a) => !a)}>
                <Plus className="h-4 w-4" />
                {t("kpiModule.deviation.addAction")}
              </Button>
            </div>
            {!dev && <p className="text-xs text-slate-500">{t("kpiModule.deviation.saveFirst")}</p>}
            {data.needsActions && data.actionCount === 0 && dev && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-red-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t("kpiModule.deviation.actionRequired")}
              </p>
            )}
            {data.actions.length === 0 && dev && !adding && <p className="text-sm text-slate-500">{t("kpiModule.deviation.noActions")}</p>}
            <ul className="divide-y divide-slate-100">
              {data.actions.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <Link href={`/actions/${a.id}`} className="text-sm font-medium text-slate-900 hover:text-brand-700">
                      {a.code} {a.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {a.owner.fullName} · {formatDate(a.dueDate, locale)}
                    </p>
                  </div>
                  <StatusBadge status={a.status} overdue={a.isOverdue} />
                </li>
              ))}
            </ul>
            {adding && dev && (
              <div className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
                <Field label={t("kpiModule.deviation.actionTitle")} required className="sm:col-span-2">
                  <Input value={aTitle} onChange={(e) => setATitle(e.target.value)} autoFocus />
                </Field>
                <Field label={t("kpiModule.deviation.actionOwner")} required>
                  <UserPicker
                    value={aOwner}
                    valueLabel={aOwnerLabel}
                    clearable={false}
                    onChange={(id, o) => {
                      setAOwner(id);
                      setAOwnerLabel(o?.label ?? null);
                    }}
                  />
                </Field>
                <Field label={t("kpiModule.deviation.actionDue")} required>
                  <DatePicker value={aDue} onChange={(e) => setADue(e.target.value)} />
                </Field>
                <div className="flex justify-end gap-2 sm:col-span-2">
                  <Button variant="outline" size="sm" onClick={() => setAdding(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button
                    size="sm"
                    loading={addAction.isPending}
                    disabled={!aTitle.trim() || !aOwner || !aDue}
                    onClick={() => addAction.mutate({ title: aTitle.trim(), ownerId: aOwner!, dueDate: aDue, priority: data.status === "RED" ? "HIGH" : "MEDIUM" })}
                  >
                    {t("common.create")}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {dev && dev.approvalStatus === "PENDING" && data.canApprove && (
            <div className="space-y-2 border-t border-slate-100 pt-4">
              <h4 className="text-sm font-semibold text-slate-900">{t("kpiModule.deviation.decision")}</h4>
              <Field label={t("kpiModule.deviation.decisionNote")} hint={t("kpiModule.deviation.decisionNoteHint")}>
                <Input value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button loading={decide.isPending && decide.variables === true} disabled={data.entryState !== "PENDING_APPROVAL"} onClick={() => decide.mutate(true)}>
                  {t("kpiModule.deviation.approve")}
                </Button>
                <Button variant="danger" loading={decide.isPending && decide.variables === false} disabled={!note.trim()} onClick={() => decide.mutate(false)}>
                  {t("kpiModule.deviation.reject")}
                </Button>
              </div>
              {data.entryState !== "PENDING_APPROVAL" && <p className="text-xs text-amber-700">{t("kpiModule.deviation.approveBlocked")}</p>}
            </div>
          )}
          {dev && dev.approvalStatus !== "PENDING" && dev.decidedBy && (
            <p className="text-xs text-slate-500">
              <Badge tone={dev.approvalStatus === "APPROVED" ? "green" : "red"}>{t(`kpiModule.approval.${dev.approvalStatus}`)}</Badge>{" "}
              {dev.decidedBy.fullName} · {formatDate(dev.decidedAt, locale)}
              {dev.decisionNote ? ` — ${dev.decisionNote}` : ""}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
