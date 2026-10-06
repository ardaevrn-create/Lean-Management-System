"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HOSHIN_DIRECTIONS, KPI_AGGREGATIONS, childLevelOptions,
  type HoshinDirection, type HoshinGoalDetail, type HoshinGoalRow, type HoshinLevel, type KpiAggregation, type KpiListItem, type Paginated,
  type StrategyPlanBrief, type StrategyPlanDetail,
} from "@lean/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { toDateInput } from "@/lib/utils";
import { Button, Checkbox, DatePicker, Dialog, Field, Input, OrgUnitSelect, Select, Textarea, UserPicker, useToast } from "@/components/ui";
import { HOSHIN_KEY } from "./strategy-bits";

export interface ParentRef {
  id: string;
  code: string;
  title: string;
  level: HoshinLevel;
  year: number | null;
}

/** Hedef oluştur (üst hedef verilirse seviye otomatik türetilir) veya düzenle. */
export function GoalDialog({
  plan, year, parent, goal, onClose, onSaved,
}: {
  plan: StrategyPlanBrief;
  year: number;
  parent?: ParentRef | null;
  goal?: HoshinGoalRow | HoshinGoalDetail;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const editing = !!goal;
  const levels = childLevelOptions(parent?.level ?? null);
  const [level, setLevel] = useState<HoshinLevel>(goal?.level ?? levels[0]);
  const [title, setTitle] = useState(goal?.title ?? "");
  const [code, setCode] = useState(goal?.code ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [goalYear, setGoalYear] = useState<number>(goal?.year ?? parent?.year ?? year);
  const [objectiveId, setObjectiveId] = useState(goal?.objective?.id ?? "");
  const [orgUnitId, setOrgUnitId] = useState<string | null>(goal?.orgUnit?.id ?? null);
  const [ownerId, setOwnerId] = useState<string | null>(goal?.owner?.id ?? null);
  const [kpiId, setKpiId] = useState(goal?.kpi?.id ?? "");
  const [unit, setUnit] = useState(goal?.unit ?? "");
  const [baseline, setBaseline] = useState(goal?.baseline?.toString() ?? "");
  const [target, setTarget] = useState(goal?.targetValue?.toString() ?? "");
  const [direction, setDirection] = useState<HoshinDirection>(goal?.direction ?? "HIGHER_BETTER");
  const [aggregation, setAggregation] = useState<KpiAggregation>(goal?.aggregation ?? "LAST");
  const [weight, setWeight] = useState(goal?.weight?.toString() ?? "1");
  const [startDate, setStartDate] = useState(toDateInput(goal?.startDate));
  const [endDate, setEndDate] = useState(toDateInput(goal?.endDate));
  const [propose, setPropose] = useState(!!parent && !editing);

  const kpis = useQuery({
    queryKey: ["kpi", "definitions", "picker"],
    queryFn: () => api.get<Paginated<KpiListItem>>("/kpi/definitions", { pageSize: 200, sort: "code:asc" }),
    staleTime: 60_000,
  });
  const objectives = useQuery({
    queryKey: [...HOSHIN_KEY, "strategy-plan", plan.id],
    enabled: hasPermission("strategy.view"),
    queryFn: () => api.get<StrategyPlanDetail>(`/strategy/plans/${plan.id}`),
  });
  const linked = kpis.data?.items.find((k) => k.id === kpiId);
  const needsYear = level !== "BREAKTHROUGH";

  const save = useMutation({
    mutationFn: () => {
      const num = (s: string) => (s.trim() === "" ? null : Number(s));
      const common = {
        title, code: code || undefined, description: description || null, year: needsYear ? goalYear : level === "BREAKTHROUGH" ? goalYear : null,
        objectiveId: objectiveId || null, orgUnitId, ownerId, kpiId: kpiId || null, unit, baseline: num(baseline), targetValue: num(target),
        direction, aggregation: kpiId ? undefined : aggregation, weight: Number(weight) || 1, startDate: startDate || null, endDate: endDate || null,
      };
      return editing
        ? api.patch<HoshinGoalDetail>(`/hoshin/goals/${goal!.id}`, { ...common, code: code || undefined })
        : api.post<HoshinGoalDetail>("/hoshin/goals", { ...common, planId: plan.id, parentId: parent?.id ?? null, level, propose: propose && !!parent && !!ownerId });
    },
    onSuccess: (g) => {
      qc.invalidateQueries({ queryKey: HOSHIN_KEY });
      toast.success(t("common.saved"));
      onSaved?.(g.id);
      onClose();
    },
    onError: toast.error,
  });

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={editing ? t("strategyModule.goal.edit") : parent ? t("strategyModule.goal.addChild", { code: parent.code }) : t("strategyModule.goal.add")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button loading={save.isPending} disabled={!title.trim()} onClick={() => save.mutate()}>{t("common.save")}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {!editing && (
          <Field label={t("strategyModule.field.level")}>
            <Select value={level} onChange={(e) => setLevel(e.target.value as HoshinLevel)} disabled={levels.length < 2}>
              {levels.map((l) => (
                <option key={l} value={l}>{t(`strategyModule.level.${l}`)}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t("common.code")} hint={t("strategyModule.autoCode")}>
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label={t("strategyModule.field.title")} required className="sm:col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t("common.description")} className="sm:col-span-2">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label={level === "BREAKTHROUGH" ? t("strategyModule.field.targetYear") : t("strategyModule.field.year")}>
          <Input type="number" min={plan.startYear} max={plan.endYear} value={goalYear} onChange={(e) => setGoalYear(Number(e.target.value))} />
        </Field>
        {(level === "BREAKTHROUGH" || level === "ANNUAL") && (
          <Field label={t("strategyModule.field.objective")}>
            <Select value={objectiveId} onChange={(e) => setObjectiveId(e.target.value)} disabled={!hasPermission("strategy.view")}>
              <option value="">{t("common.select")}</option>
              {objectives.data?.objectives.map((o) => (
                <option key={o.id} value={o.id}>{o.code} — {o.title}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t("strategyModule.field.owner")}>
          <UserPicker value={ownerId} valueLabel={goal?.owner?.fullName} onChange={(id) => setOwnerId(id)} />
        </Field>
        <Field label={t("strategyModule.field.orgUnit")}>
          <OrgUnitSelect value={orgUnitId} onChange={setOrgUnitId} />
        </Field>
        <Field label={t("strategyModule.field.kpi")} hint={linked ? t("strategyModule.field.kpiHint") : undefined} className="sm:col-span-2">
          <Select
            value={kpiId}
            onChange={(e) => {
              setKpiId(e.target.value);
              const k = kpis.data?.items.find((x) => x.id === e.target.value);
              if (k) {
                setUnit(k.unit);
                setDirection(k.direction === "LOWER_BETTER" ? "LOWER_BETTER" : "HIGHER_BETTER");
                setAggregation(k.aggregation);
              }
            }}
          >
            <option value="">{t("strategyModule.field.noKpi")}</option>
            {kpis.data?.items.map((k) => (
              <option key={k.id} value={k.id}>{k.code} — {k.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("strategyModule.field.baseline")}>
          <Input type="number" step="any" value={baseline} onChange={(e) => setBaseline(e.target.value)} />
        </Field>
        <Field label={t("strategyModule.field.target")}>
          <Input type="number" step="any" value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        <Field label={t("strategyModule.field.unit")}>
          <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
        </Field>
        <Field label={t("strategyModule.field.weight")}>
          <Input type="number" step="any" min={0} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </Field>
        <Field label={t("strategyModule.field.direction")}>
          <Select value={direction} onChange={(e) => setDirection(e.target.value as HoshinDirection)} disabled={!!kpiId}>
            {HOSHIN_DIRECTIONS.map((d) => (
              <option key={d} value={d}>{t(`strategyModule.direction.${d}`)}</option>
            ))}
          </Select>
        </Field>
        {!kpiId && (
          <Field label={t("strategyModule.field.aggregation")} hint={t("strategyModule.field.aggregationHint")}>
            <Select value={aggregation} onChange={(e) => setAggregation(e.target.value as KpiAggregation)}>
              {KPI_AGGREGATIONS.map((a) => (
                <option key={a} value={a}>{t(`strategyModule.aggregation.${a}`)}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t("strategyModule.field.startDate")}>
          <DatePicker value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label={t("strategyModule.field.endDate")}>
          <DatePicker value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        {!editing && parent && (
          <div className="sm:col-span-2">
            <Checkbox checked={propose} onChange={(e) => setPropose(e.target.checked)} disabled={!ownerId} label={t("strategyModule.goal.startCatchball")} />
            <p className="mt-1 text-xs text-slate-500">{t("strategyModule.goal.startCatchballHint")}</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
