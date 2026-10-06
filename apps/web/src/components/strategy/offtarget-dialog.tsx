"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { PRIORITIES, periodLabel, type OffTargetDetail, type Priority } from "@lean/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { Badge, Button, DatePicker, Dialog, Field, Input, LoadingBlock, PriorityBadge, Select, StatusBadge, Textarea, UserPicker, useToast } from "@/components/ui";
import { BOWLING_SOFT, fmtNum, HOSHIN_KEY } from "./strategy-bits";

/** Hedef altı ay: açıklama + karşı önlemler (KPI bağlıysa KPI sapmasına bağlantı, elle takipte aksiyon formu). */
export function OffTargetDialog({ goalId, period, unit, goalLabel, onClose }: { goalId: string; period: string; unit: string; goalLabel: string; onClose: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const key = [...HOSHIN_KEY, "off-target", goalId, period];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => api.get<OffTargetDetail>(`/hoshin/goals/${goalId}/off-target`, { period }) });
  const [explanation, setExplanation] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(user?.id ?? null);
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");

  const add = useMutation({
    mutationFn: () =>
      api.post<OffTargetDetail>(`/hoshin/goals/${goalId}/countermeasure`, {
        period, title, ownerId, dueDate, priority, explanation: (explanation ?? data?.comment ?? "").trim() || undefined,
      }),
    onSuccess: (res) => {
      qc.setQueryData(key, res);
      qc.invalidateQueries({ queryKey: HOSHIN_KEY });
      qc.invalidateQueries({ queryKey: ["actions"] });
      toast.success(t("strategyModule.offTarget.created"));
      setTitle("");
      setDueDate("");
    },
    onError: toast.error,
  });
  const saveComment = useMutation({
    mutationFn: () => api.put(`/hoshin/goals/${goalId}/monthly`, { year: data!.year, months: [{ month: data!.month, comment: (explanation ?? "").trim() || null }] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HOSHIN_KEY });
      toast.success(t("common.saved"));
    },
    onError: toast.error,
  });

  return (
    <Dialog open onClose={onClose} size="lg" title={`${goalLabel} · ${periodLabel(period)}`}>
      {isLoading || !data ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${BOWLING_SOFT[data.status]}`}>{t(`strategyModule.color.${data.status}`)}</span>
            <span className="text-slate-600">{t("strategyModule.bowling.plan")}: <b>{fmtNum(data.plan, unit)}</b></span>
            <span className="text-slate-600">{t("strategyModule.bowling.actual")}: <b>{fmtNum(data.actual, unit)}</b></span>
            {data.source === "KPI" && data.kpi && (
              <Link href={`/kpi/${data.kpi.id}`} className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />
                {data.kpi.code}
              </Link>
            )}
          </div>

          {data.source === "KPI" ? (
            <section>
              <h4 className="mb-1 text-sm font-semibold text-slate-800">{t("strategyModule.offTarget.kpiDeviation")}</h4>
              {data.kpiDeviation ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="text-slate-800">{data.kpiDeviation.explanation}</p>
                  {data.kpiDeviation.rootCause && <p className="mt-1 text-xs text-slate-500">{t("strategyModule.offTarget.rootCause")}: {data.kpiDeviation.rootCause}</p>}
                  <div className="mt-2 flex items-center gap-2">
                    <Badge tone={data.kpiDeviation.approvalStatus === "APPROVED" ? "green" : data.kpiDeviation.approvalStatus === "REJECTED" ? "red" : "amber"}>
                      {data.kpiDeviation.approvalStatus}
                    </Badge>
                    <Link href={`/kpi?tab=deviations`} className="text-xs text-brand-700 hover:underline">{t("strategyModule.offTarget.openKpi")}</Link>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  {t("strategyModule.offTarget.noDeviation")}{" "}
                  <Link href="/kpi?tab=deviations" className="text-brand-700 hover:underline">{t("strategyModule.offTarget.openKpi")}</Link>
                </p>
              )}
            </section>
          ) : (
            <section>
              <h4 className="mb-1 text-sm font-semibold text-slate-800">{t("strategyModule.offTarget.explanation")}</h4>
              <Textarea
                rows={3}
                disabled={!data.canEdit}
                value={explanation ?? data.comment ?? ""}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder={t("strategyModule.offTarget.explanationHint")}
              />
              {data.canEdit && explanation !== null && explanation !== (data.comment ?? "") && (
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="outline" loading={saveComment.isPending} onClick={() => saveComment.mutate()}>{t("common.save")}</Button>
                </div>
              )}
            </section>
          )}

          <section>
            <h4 className="mb-1 text-sm font-semibold text-slate-800">{t("strategyModule.offTarget.actions")}</h4>
            {data.actions.length === 0 ? (
              <p className="text-sm text-slate-500">{t("strategyModule.offTarget.noActions")}</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {data.actions.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <Link href={`/actions/${a.id}`} className="min-w-0 flex-1 truncate font-medium text-brand-700 hover:underline">
                      <span className="mr-1.5 font-mono text-xs text-slate-500">{a.code}</span>
                      {a.title}
                    </Link>
                    <span className="text-xs text-slate-500">{a.owner.fullName} · {formatDate(a.dueDate, locale)}</span>
                    <PriorityBadge priority={a.priority} />
                    <StatusBadge status={a.status} overdue={a.isOverdue} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.source !== "KPI" && data.canEdit && (
            <section className="rounded-lg border border-dashed border-slate-300 p-3">
              <h4 className="mb-2 text-sm font-semibold text-slate-800">{t("strategyModule.offTarget.addCountermeasure")}</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t("strategyModule.offTarget.actionTitle")} className="sm:col-span-2">
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </Field>
                <Field label={t("strategyModule.field.owner")}>
                  <UserPicker value={ownerId} valueLabel={user?.fullName} clearable={false} onChange={(id) => setOwnerId(id)} />
                </Field>
                <Field label={t("strategyModule.offTarget.dueDate")}>
                  <DatePicker value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </Field>
                <Field label={t("strategyModule.offTarget.priority")}>
                  <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>{t(`priority.${p}`)}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="mt-3 flex justify-end">
                <Button loading={add.isPending} disabled={!title.trim() || !ownerId || !dueDate} onClick={() => add.mutate()}>
                  {t("strategyModule.offTarget.createAction")}
                </Button>
              </div>
            </section>
          )}
        </div>
      )}
    </Dialog>
  );
}
