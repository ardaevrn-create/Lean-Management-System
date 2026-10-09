"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pencil, Plus, Power, Wand2 } from "lucide-react";
import {
  AUDIT_PLAN_FREQUENCIES, AUDITOR_ASSIGN_MODES, PERMISSIONS,
  type AuditListItem, type AuditorAssignMode, type AuditPlanFrequency, type AuditPlanGenerateResult, type AuditPlanItem, type Paginated,
} from "@lean/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, CardBody, CardHeader, Checkbox, ConfirmDialog, DatePicker, Dialog, EmptyState, Field, Input, LoadingBlock, MultiPicker, Select, UserPicker, type PickerOption } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { A, fmtDay, todayStr, useAreas, useTemplates } from "./audit-bits";

/* ------------------------------ Plan formu ------------------------------ */

function PlanDialog({ plan, onClose }: { plan: AuditPlanItem | "new" | null; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const editing = plan && plan !== "new" ? plan : null;
  const { data: templates } = useTemplates(false, !!plan);
  const { data: areas } = useAreas();

  const [name, setName] = useState(editing?.name ?? "");
  const [templateId, setTemplateId] = useState(editing?.template.id ?? "");
  const [frequency, setFrequency] = useState<AuditPlanFrequency>(editing?.frequency ?? "MONTHLY");
  const [areaIds, setAreaIds] = useState<string[]>(editing?.areas.map((a) => a.id) ?? []);
  const [mode, setMode] = useState<AuditorAssignMode>(editing?.assignMode ?? "ROTATION");
  const [fixed, setFixed] = useState<PickerOption | null>(editing?.fixedAuditor ? { id: editing.fixedAuditor.id, label: editing.fixedAuditor.fullName } : null);
  const [auditors, setAuditors] = useState<PickerOption[]>(editing?.auditors.map((u) => ({ id: u.id, label: u.fullName })) ?? []);
  const [cross, setCross] = useState(editing?.crossAudit ?? false);
  const [startDate, setStartDate] = useState(editing?.startDate ?? todayStr());
  const [endDate, setEndDate] = useState(editing?.endDate ?? "");

  const save = useMutation({
    mutationFn: () => {
      if (!areaIds.length) throw new Error(t(`${A}.plans.needAreas`));
      if (mode === "ROTATION" && !auditors.length) throw new Error(t(`${A}.plans.needAuditors`));
      const body = {
        name, templateId, frequency, areaIds, assignMode: mode, crossAudit: cross, startDate, endDate: endDate || null,
        fixedAuditorId: mode === "FIXED" ? fixed?.id ?? null : null,
        auditorIds: mode === "ROTATION" ? auditors.map((a) => a.id) : [],
      };
      return editing ? api.patch(`/audits/plans/${editing.id}`, body) : api.post("/audits/plans", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audits", "plans"] });
      toast.success(t(`${A}.plans.saved`));
      onClose();
    },
    onError: toast.error,
  });

  const toggleArea = (id: string) => setAreaIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <Dialog
      open={!!plan}
      onClose={onClose}
      size="lg"
      title={editing ? t(`${A}.plans.editPlan`) : t(`${A}.plans.newPlan`)}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!name.trim() || !templateId || !startDate} loading={save.isPending} onClick={() => save.mutate()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t(`${A}.plans.name`)} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t(`${A}.common.template`)} required>
            <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">{t(`${A}.common.selectTemplate`)}</option>
              {templates?.map((tp) => (
                <option key={tp.id} value={tp.id}>
                  {tp.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t(`${A}.plans.frequency`)}>
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value as AuditPlanFrequency)}>
              {AUDIT_PLAN_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {t(`${A}.frequency.${f}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t(`${A}.plans.start`)} required>
            <DatePicker value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label={t(`${A}.plans.end`)}>
            <DatePicker value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <Field label={t(`${A}.plans.areas`)} required>
          <div className="grid grid-cols-1 gap-1 rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
            {areas?.map((a) => (
              <Checkbox key={a.id} label={a.name} checked={areaIds.includes(a.id)} onChange={() => toggleArea(a.id)} />
            ))}
          </div>
        </Field>
        <Field label={t(`${A}.plans.assign`)}>
          <Select value={mode} onChange={(e) => setMode(e.target.value as AuditorAssignMode)}>
            {AUDITOR_ASSIGN_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`${A}.assignMode.${m}`)}
              </option>
            ))}
          </Select>
        </Field>
        {mode === "FIXED" ? (
          <Field label={t(`${A}.plans.fixedAuditor`)} required>
            <UserPicker value={fixed?.id} valueLabel={fixed?.label} onChange={(id, opt) => setFixed(id ? opt : null)} />
          </Field>
        ) : (
          <>
            <Field label={t(`${A}.plans.rotationAuditors`)} required>
              <MultiPicker kind="user" selected={auditors} onChange={setAuditors} />
            </Field>
            <Field hint={t(`${A}.plans.crossAuditHint`)}>
              <Checkbox label={t(`${A}.plans.crossAudit`)} checked={cross} onChange={(e) => setCross(e.target.checked)} />
            </Field>
          </>
        )}
      </div>
    </Dialog>
  );
}

/* ------------------------------ Takvim ------------------------------ */

const pad = (n: number) => String(n).padStart(2, "0");

function AuditCalendar() {
  const { t, locale } = useI18n();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const first = `${y}-${pad(m + 1)}-01`;
  const last = `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`;
  const { data, isLoading } = useQuery({
    queryKey: ["audits", "calendar", first],
    queryFn: () => api.get<Paginated<AuditListItem>>("/audits", { view: "all", from: first, to: last, pageSize: 500, sort: "dueDate:asc" }),
  });
  const byDay = useMemo(() => {
    const map = new Map<string, AuditListItem[]>();
    for (const a of data?.items ?? []) map.set(a.dueDate, [...(map.get(a.dueDate) ?? []), a]);
    return map;
  }, [data]);

  const offset = (new Date(y, m, 1).getDay() + 6) % 7; // Pazartesi başlangıç
  const days = new Date(y, m + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => (i >= offset && i < offset + days ? i - offset + 1 : null));
  const today = todayStr();
  const title = cursor.toLocaleDateString(locale === "en" ? "en-GB" : "tr-TR", { month: "long", year: "numeric" });

  return (
    <Card>
      <CardHeader
        title={t(`${A}.plans.calendar`)}
        actions={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date(y, m - 1, 1))} aria-label={t("common.prev")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-32 text-center text-sm font-medium capitalize">{title}</span>
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date(y, m + 1, 1))} aria-label={t("common.next")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />
      {isLoading ? (
        <LoadingBlock />
      ) : (
        <CardBody className="p-2 sm:p-3">
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 text-xs">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-slate-50 py-1.5 text-center font-medium text-slate-500">
                {t(`${A}.plans.weekdays.${i}`)}
              </div>
            ))}
            {cells.map((day, i) => {
              const key = day ? `${y}-${pad(m + 1)}-${pad(day)}` : "";
              const items = day ? (byDay.get(key) ?? []) : [];
              return (
                <div key={i} className={cn("min-h-16 bg-white p-1 sm:min-h-24", !day && "bg-slate-50", key === today && "ring-2 ring-inset ring-brand-500")}>
                  {day && <div className="mb-0.5 text-right text-[11px] text-slate-400">{day}</div>}
                  <div className="space-y-0.5">
                    {items.slice(0, 3).map((a) => (
                      <Link
                        key={a.id}
                        href={`/audits/${a.id}`}
                        title={`${a.area.name} — ${a.auditor.fullName}`}
                        className={cn(
                          "block truncate rounded px-1 py-0.5 text-[10px] leading-tight sm:text-[11px]",
                          a.status === "COMPLETED" ? "bg-emerald-50 text-emerald-800" : a.isOverdue ? "bg-red-50 text-red-700" : a.status === "CANCELLED" ? "bg-slate-100 text-slate-400 line-through" : "bg-blue-50 text-blue-800",
                        )}
                      >
                        {a.area.name}
                      </Link>
                    ))}
                    {items.length > 3 && <div className="px-1 text-[10px] text-slate-500">{t(`${A}.plans.moreCount`, { n: items.length - 3 })}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          {!data?.items.length && <p className="mt-3 text-center text-sm text-slate-500">{t(`${A}.plans.noAuditsInMonth`)}</p>}
        </CardBody>
      )}
    </Card>
  );
}

/* ------------------------------ Sekme ------------------------------ */

export function PlansTab() {
  const { t, locale } = useI18n();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const canManage = hasPermission(PERMISSIONS.AUDIT_MANAGE);
  const [editing, setEditing] = useState<AuditPlanItem | "new" | null>(null);
  const [toDeactivate, setToDeactivate] = useState<AuditPlanItem | null>(null);
  const [until, setUntil] = useState(todayStr());

  const { data: plans, isLoading } = useQuery({ queryKey: ["audits", "plans"], queryFn: () => api.get<AuditPlanItem[]>("/audits/plans") });

  const generate = useMutation({
    mutationFn: (id: string) => api.post<AuditPlanGenerateResult>(`/audits/plans/${id}/generate`, undefined, { until }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["audits"] });
      toast.success(t(`${A}.plans.generated`, { created: r.created, existing: r.existing }) + (r.skipped.length ? ` ${t(`${A}.plans.generatedSkipped`, { n: r.skipped.length })}` : ""));
    },
    onError: toast.error,
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => api.del(`/audits/plans/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audits", "plans"] });
      setToDeactivate(null);
    },
    onError: toast.error,
  });

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <Field label={t(`${A}.plans.generateUntil`)}>
            <DatePicker value={until} onChange={(e) => setUntil(e.target.value)} className="w-44" />
          </Field>
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            {t(`${A}.plans.newPlan`)}
          </Button>
        </div>
      )}
      {isLoading ? (
        <LoadingBlock />
      ) : !plans?.length ? (
        <Card>
          <EmptyState title={t(`${A}.plans.empty`)} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {plans.map((p) => (
            <Card key={p.id} className={cn(!p.isActive && "opacity-60")}>
              <CardBody className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-slate-900">{p.name}</h3>
                    <p className="text-xs text-slate-500">
                      {p.template.name} · {t(`${A}.frequency.${p.frequency}`)} · {fmtDay(p.startDate, locale)}
                      {p.endDate && ` → ${fmtDay(p.endDate, locale)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {!p.isActive && <Badge tone="muted">{t(`${A}.plans.inactive`)}</Badge>}
                    <Badge tone="blue">{t(`${A}.plans.planned`, { n: p.plannedCount })}</Badge>
                    <Badge tone="green">{t(`${A}.plans.completed`, { n: p.completedCount })}</Badge>
                  </div>
                </div>
                <p className="text-xs text-slate-600">
                  <span className="font-medium">{t(`${A}.plans.areas`)}:</span> {p.areas.map((a) => a.name).join(", ")}
                </p>
                <p className="text-xs text-slate-600">
                  <span className="font-medium">{t(`${A}.assignMode.${p.assignMode}`)}:</span>{" "}
                  {p.assignMode === "FIXED" ? p.fixedAuditor?.fullName : p.auditors.map((u) => u.fullName).join(" → ")}
                  {p.crossAudit && <Badge tone="indigo" className="ml-2">{t(`${A}.plans.crossAudit`)}</Badge>}
                </p>
                {canManage && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" disabled={!p.isActive} loading={generate.isPending && generate.variables === p.id} onClick={() => generate.mutate(p.id)}>
                      <Wand2 className="h-3.5 w-3.5" />
                      {t(`${A}.plans.generate`)}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                      {t("common.edit")}
                    </Button>
                    {p.isActive && (
                      <Button size="sm" variant="ghost" onClick={() => setToDeactivate(p)}>
                        <Power className="h-3.5 w-3.5" />
                        {t(`${A}.plans.deactivate`)}
                      </Button>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
      <AuditCalendar />
      {editing && <PlanDialog key={editing === "new" ? "new" : editing.id} plan={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!toDeactivate}
        onClose={() => setToDeactivate(null)}
        onConfirm={() => toDeactivate && deactivate.mutate(toDeactivate.id)}
        loading={deactivate.isPending}
        title={t(`${A}.plans.deactivate`)}
        message={t(`${A}.plans.deactivateConfirm`)}
        confirmLabel={t(`${A}.plans.deactivate`)}
      />
    </div>
  );
}
