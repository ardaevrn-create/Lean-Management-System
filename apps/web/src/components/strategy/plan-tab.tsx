"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import {
  STRATEGY_PERSPECTIVES, SWOT_TYPES,
  type StrategicObjectiveDto, type StrategyPerspective, type StrategyPlanDetail, type SwotItemDto, type SwotType,
} from "@lean/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import {
  Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, Dialog, EmptyState, Field, Input, LoadingBlock, Select, Textarea, UserPicker, useToast,
} from "@/components/ui";
import { HOSHIN_KEY } from "./strategy-bits";

const SWOT_STYLE: Record<SwotType, string> = {
  STRENGTH: "border-emerald-200 bg-emerald-50/60",
  WEAKNESS: "border-amber-200 bg-amber-50/60",
  OPPORTUNITY: "border-blue-200 bg-blue-50/60",
  THREAT: "border-red-200 bg-red-50/60",
};

function Dots({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${n}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cn("h-1.5 w-1.5 rounded-full", i <= n ? "bg-slate-700" : "bg-slate-300")} />
      ))}
    </span>
  );
}

export function PlanTab({ planId, onSelectPlan }: { planId: string | null; onSelectPlan: (id: string) => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canView = hasPermission("strategy.view");
  const { data: plan, isLoading } = useQuery({
    queryKey: [...HOSHIN_KEY, "strategy-plan", planId],
    enabled: !!planId && canView,
    queryFn: () => api.get<StrategyPlanDetail>(`/strategy/plans/${planId}`),
  });
  const canManage = !!plan?.can.manage;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: HOSHIN_KEY });
  };

  const [planDialog, setPlanDialog] = useState<"create" | "edit" | null>(null);
  const [swotDialog, setSwotDialog] = useState<{ item?: SwotItemDto; type: SwotType } | null>(null);
  const [objDialog, setObjDialog] = useState<{ item?: StrategicObjectiveDto } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "plan" | "swot" | "objective"; id: string } | null>(null);

  const [vision, setVision] = useState("");
  const [mission, setMission] = useState("");
  const [values, setValues] = useState("");
  useEffect(() => {
    if (plan) {
      setVision(plan.vision ?? "");
      setMission(plan.mission ?? "");
      setValues(plan.values.join("\n"));
    }
  }, [plan]);

  const saveText = useMutation({
    mutationFn: () => api.patch(`/strategy/plans/${planId}`, { vision, mission, values: values.split("\n").map((v) => v.trim()).filter(Boolean) }),
    onSuccess: () => {
      toast.success(t("common.saved"));
      refresh();
    },
    onError: toast.error,
  });
  const activate = useMutation({
    mutationFn: () => api.post(`/strategy/plans/${planId}/activate`),
    onSuccess: () => {
      toast.success(t("strategyModule.plan.activated"));
      refresh();
    },
    onError: toast.error,
  });
  const newVersion = useMutation({
    mutationFn: () => api.post<StrategyPlanDetail>(`/strategy/plans/${planId}/new-version`),
    onSuccess: (p) => {
      toast.success(t("strategyModule.plan.versionCreated"));
      refresh();
      onSelectPlan(p.id);
    },
    onError: toast.error,
  });
  const remove = useMutation({
    mutationFn: (c: { kind: "plan" | "swot" | "objective"; id: string }) =>
      api.del(c.kind === "plan" ? `/strategy/plans/${c.id}` : c.kind === "swot" ? `/strategy/swot/${c.id}` : `/strategy/objectives/${c.id}`),
    onSuccess: (_, c) => {
      setConfirm(null);
      refresh();
      if (c.kind === "plan") onSelectPlan("");
    },
    onError: toast.error,
  });

  if (!canView) return <EmptyState title={t("strategyModule.plan.noAccess")} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {plan && (
            <>
              <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>
              <Badge tone={plan.status === "ACTIVE" ? "green" : plan.status === "DRAFT" ? "gray" : "muted"}>{t(`strategyModule.plan.status.${plan.status}`)}</Badge>
              <Badge tone="blue">v{plan.version}</Badge>
              <span className="text-sm text-slate-500">{plan.startYear}–{plan.endYear}</span>
              {plan.approvedAt && (
                <span className="text-xs text-slate-500">
                  {t("strategyModule.plan.approvedBy", { name: plan.approvedBy?.fullName ?? "-", date: formatDate(plan.approvedAt, locale) })}
                </span>
              )}
            </>
          )}
        </div>
        {hasPermission("strategy.manage") && (
          <div className="flex flex-wrap gap-2">
            {plan && plan.status !== "ACTIVE" && (
              <Button variant="outline" size="sm" loading={activate.isPending} onClick={() => activate.mutate()}>
                <CheckCircle2 className="h-4 w-4" />
                {t("strategyModule.plan.activate")}
              </Button>
            )}
            {plan && (
              <>
                <Button variant="outline" size="sm" loading={newVersion.isPending} onClick={() => newVersion.mutate()}>
                  <Copy className="h-4 w-4" />
                  {t("strategyModule.plan.newVersion")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPlanDialog("edit")}>
                  <Pencil className="h-4 w-4" />
                  {t("common.edit")}
                </Button>
                {plan.status === "DRAFT" && plan.goalCount === 0 && (
                  <Button variant="outline" size="sm" onClick={() => setConfirm({ kind: "plan", id: plan.id })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
            <Button size="sm" onClick={() => setPlanDialog("create")}>
              <Plus className="h-4 w-4" />
              {t("strategyModule.plan.create")}
            </Button>
          </div>
        )}
      </div>

      {!planId ? (
        <EmptyState title={t("strategyModule.plan.none")} />
      ) : isLoading || !plan ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title={t("strategyModule.plan.vision")} />
              <CardBody>
                <Textarea rows={5} value={vision} onChange={(e) => setVision(e.target.value)} disabled={!canManage} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title={t("strategyModule.plan.mission")} />
              <CardBody>
                <Textarea rows={5} value={mission} onChange={(e) => setMission(e.target.value)} disabled={!canManage} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title={t("strategyModule.plan.values")} />
              <CardBody>
                <Textarea rows={5} value={values} onChange={(e) => setValues(e.target.value)} disabled={!canManage} placeholder={t("strategyModule.plan.valuesHint")} />
              </CardBody>
            </Card>
          </div>
          {canManage && (
            <div className="flex justify-end">
              <Button loading={saveText.isPending} onClick={() => saveText.mutate()}>
                {t("common.save")}
              </Button>
            </div>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{t("strategyModule.swot.title")}</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {SWOT_TYPES.map((type) => (
                <div key={type} className={cn("rounded-xl border p-3", SWOT_STYLE[type])}>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-800">{t(`strategyModule.swot.${type}`)}</h4>
                    {canManage && (
                      <Button variant="ghost" size="sm" onClick={() => setSwotDialog({ type })}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <ul className="space-y-1.5">
                    {plan.swot.filter((s) => s.type === type).map((s) => (
                      <li key={s.id} className="group flex items-start justify-between gap-2 rounded-md bg-white/80 px-2.5 py-1.5 text-sm">
                        <span className="min-w-0 flex-1 text-slate-800">{s.text}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <Dots n={s.impact} />
                          {canManage && (
                            <>
                              <button className="text-slate-400 hover:text-slate-700" onClick={() => setSwotDialog({ item: s, type })} aria-label={t("common.edit")}>
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button className="text-slate-400 hover:text-red-600" onClick={() => setConfirm({ kind: "swot", id: s.id })} aria-label={t("common.delete")}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </span>
                      </li>
                    ))}
                    {plan.swot.filter((s) => s.type === type).length === 0 && <li className="text-xs text-slate-400">{t("strategyModule.swot.empty")}</li>}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t("strategyModule.objectives.title")}</h3>
              {canManage && (
                <Button variant="outline" size="sm" onClick={() => setObjDialog({})}>
                  <Plus className="h-4 w-4" />
                  {t("strategyModule.objectives.add")}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {([...STRATEGY_PERSPECTIVES, null] as (StrategyPerspective | null)[]).map((p) => {
                const items = plan.objectives.filter((o) => o.perspective === p);
                if (!items.length && p === null) return null;
                return (
                  <Card key={p ?? "none"}>
                    <CardHeader title={p ? t(`strategyModule.perspective.${p}`) : t("strategyModule.perspective.NONE")} />
                    <ul className="divide-y divide-slate-100">
                      {items.map((o) => (
                        <li key={o.id} className="flex items-start justify-between gap-2 px-4 py-2.5">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900">
                              <span className="mr-1.5 font-mono text-brand-700">{o.code}</span>
                              {o.title}
                            </p>
                            {o.description && <p className="text-xs text-slate-500">{o.description}</p>}
                            <p className="mt-0.5 text-xs text-slate-500">
                              {o.owner?.fullName ?? "–"} · {t("strategyModule.objectives.goalCount", { n: o.goalCount })}
                            </p>
                          </div>
                          {canManage && (
                            <span className="flex shrink-0 gap-2">
                              <button className="text-slate-400 hover:text-slate-700" onClick={() => setObjDialog({ item: o })} aria-label={t("common.edit")}>
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button className="text-slate-400 hover:text-red-600" onClick={() => setConfirm({ kind: "objective", id: o.id })} aria-label={t("common.delete")}>
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </span>
                          )}
                        </li>
                      ))}
                      {items.length === 0 && <li className="px-4 py-3 text-xs text-slate-400">{t("strategyModule.objectives.empty")}</li>}
                    </ul>
                  </Card>
                );
              })}
            </div>
          </section>
        </>
      )}

      {planDialog && <PlanDialog mode={planDialog} plan={plan} onClose={() => setPlanDialog(null)} onSaved={(id) => { refresh(); if (planDialog === "create") onSelectPlan(id); }} />}
      {swotDialog && planId && <SwotDialog planId={planId} state={swotDialog} onClose={() => setSwotDialog(null)} onSaved={refresh} />}
      {objDialog && planId && <ObjectiveDialog planId={planId} item={objDialog.item} onClose={() => setObjDialog(null)} onSaved={refresh} />}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && remove.mutate(confirm)}
        loading={remove.isPending}
        title={t("common.delete")}
        message={t("strategyModule.confirmDelete")}
      />
    </div>
  );
}

function PlanDialog({ mode, plan, onClose, onSaved }: { mode: "create" | "edit"; plan?: StrategyPlanDetail; onClose: () => void; onSaved: (id: string) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const thisYear = new Date().getFullYear();
  const [name, setName] = useState(mode === "edit" ? (plan?.name ?? "") : `${thisYear}–${thisYear + 4} ${t("strategyModule.plan.defaultName")}`);
  const [startYear, setStartYear] = useState(mode === "edit" ? (plan?.startYear ?? thisYear) : thisYear);
  const [endYear, setEndYear] = useState(mode === "edit" ? (plan?.endYear ?? thisYear + 4) : thisYear + 4);
  const save = useMutation({
    mutationFn: () => (mode === "create" ? api.post<StrategyPlanDetail>("/strategy/plans", { name, startYear, endYear }) : api.patch<StrategyPlanDetail>(`/strategy/plans/${plan!.id}`, { name, startYear, endYear })),
    onSuccess: (p) => {
      toast.success(t("common.saved"));
      onSaved(p.id);
      onClose();
    },
    onError: toast.error,
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={mode === "create" ? t("strategyModule.plan.create") : t("strategyModule.plan.edit")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>{t("common.save")}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t("common.name")} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("strategyModule.plan.startYear")}>
            <Input type="number" value={startYear} onChange={(e) => setStartYear(Number(e.target.value))} />
          </Field>
          <Field label={t("strategyModule.plan.endYear")}>
            <Input type="number" value={endYear} onChange={(e) => setEndYear(Number(e.target.value))} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

function SwotDialog({ planId, state, onClose, onSaved }: { planId: string; state: { item?: SwotItemDto; type: SwotType }; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [type, setType] = useState<SwotType>(state.item?.type ?? state.type);
  const [text, setText] = useState(state.item?.text ?? "");
  const [impact, setImpact] = useState(state.item?.impact ?? 3);
  const save = useMutation({
    mutationFn: () => (state.item ? api.patch(`/strategy/swot/${state.item.id}`, { type, text, impact }) : api.post(`/strategy/plans/${planId}/swot`, { type, text, impact })),
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: toast.error,
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={t("strategyModule.swot.item")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button loading={save.isPending} disabled={!text.trim()} onClick={() => save.mutate()}>{t("common.save")}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t("common.type")}>
          <Select value={type} onChange={(e) => setType(e.target.value as SwotType)}>
            {SWOT_TYPES.map((s) => (
              <option key={s} value={s}>{t(`strategyModule.swot.${s}`)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("common.description")} required>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Field label={t("strategyModule.swot.impact")}>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setImpact(n)} className={cn("h-8 w-8 rounded-full border text-sm", n <= impact ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 text-slate-500")}>
                {n}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

function ObjectiveDialog({ planId, item, onClose, onSaved }: { planId: string; item?: StrategicObjectiveDto; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [code, setCode] = useState(item?.code ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [perspective, setPerspective] = useState<StrategyPerspective | "">(item?.perspective ?? "");
  const [ownerId, setOwnerId] = useState<string | null>(item?.owner?.id ?? null);
  const save = useMutation({
    mutationFn: () => {
      const body = { code: code || undefined, title, description: description || null, perspective: perspective || null, ownerId };
      return item ? api.patch(`/strategy/objectives/${item.id}`, body) : api.post(`/strategy/plans/${planId}/objectives`, body);
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: toast.error,
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={t("strategyModule.objectives.item")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button loading={save.isPending} disabled={!title.trim()} onClick={() => save.mutate()}>{t("common.save")}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("common.code")} hint={t("strategyModule.autoCode")}>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="SA1" />
          </Field>
          <Field label={t("strategyModule.objectives.perspective")} className="col-span-2">
            <Select value={perspective} onChange={(e) => setPerspective(e.target.value as StrategyPerspective | "")}>
              <option value="">{t("strategyModule.perspective.NONE")}</option>
              {STRATEGY_PERSPECTIVES.map((p) => (
                <option key={p} value={p}>{t(`strategyModule.perspective.${p}`)}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t("strategyModule.field.title")} required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t("common.description")}>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label={t("strategyModule.field.owner")}>
          <UserPicker value={ownerId} valueLabel={item?.owner?.fullName} onChange={(id) => setOwnerId(id)} />
        </Field>
      </div>
    </Dialog>
  );
}
