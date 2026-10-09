"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  KPI_AGGREGATIONS, KPI_CATEGORIES, KPI_DIRECTIONS, KPI_FREQUENCIES, currentPeriod, formulaRefs, isValidPeriod, parseFormula,
  type KpiAggregation, type KpiCategory, type KpiDefinitionDetail, type KpiDefinitionRequest, type KpiDirection, type KpiFrequency,
} from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button, Checkbox, Dialog, Field, Input, OrgUnitSelect, Select, Textarea, UserPicker } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

interface FormState {
  code: string;
  name: string;
  description: string;
  category: KpiCategory;
  unit: string;
  decimals: string;
  direction: KpiDirection;
  frequency: KpiFrequency;
  aggregation: KpiAggregation;
  warningTolerancePct: string;
  entryDueDays: string;
  orgUnitId: string | null;
  ownerId: string | null;
  ownerLabel: string | null;
  dataEntryUserId: string | null;
  dataEntryLabel: string | null;
  formula: string;
  startPeriod: string;
  isActive: boolean;
}

function initial(k?: KpiDefinitionDetail): FormState {
  return {
    code: k?.code ?? "",
    name: k?.name ?? "",
    description: k?.description ?? "",
    category: k?.category ?? "OTHER",
    unit: k?.unit ?? "",
    decimals: String(k?.decimals ?? 2),
    direction: k?.direction ?? "HIGHER_BETTER",
    frequency: k?.frequency ?? "MONTHLY",
    aggregation: k?.aggregation ?? "AVERAGE",
    warningTolerancePct: String(k?.warningTolerancePct ?? 5),
    entryDueDays: String(k?.entryDueDays ?? 5),
    orgUnitId: k?.orgUnit.id ?? null,
    ownerId: k?.owner.id ?? null,
    ownerLabel: k?.owner.fullName ?? null,
    dataEntryUserId: k?.dataEntryUser?.id ?? null,
    dataEntryLabel: k?.dataEntryUser?.fullName ?? null,
    formula: k?.formula ?? "",
    startPeriod: k?.startPeriod ?? "",
    isActive: k?.isActive ?? true,
  };
}

/** KPI oluşturma / düzenleme penceresi. */
export function KpiFormDialog({ open, onClose, kpi, onSaved }: { open: boolean; onClose: () => void; kpi?: KpiDefinitionDetail; onSaved?: (k: KpiDefinitionDetail) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState<FormState>(() => initial(kpi));
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setF((s) => ({ ...s, [key]: value }));
  const editing = !!kpi;

  let formulaError: string | null = null;
  let refs: string[] = [];
  if (f.formula.trim()) {
    try {
      refs = formulaRefs(parseFormula(f.formula));
    } catch (e) {
      formulaError = (e as Error).message;
    }
  }
  const startError = f.startPeriod.trim() && !isValidPeriod(f.startPeriod.trim(), f.frequency);

  const save = useMutation({
    mutationFn: () => {
      const body: KpiDefinitionRequest = {
        code: f.code.trim().toUpperCase(),
        name: f.name.trim(),
        description: f.description.trim() || null,
        category: f.category,
        unit: f.unit.trim(),
        decimals: Number(f.decimals) || 0,
        direction: f.direction,
        frequency: f.frequency,
        aggregation: f.aggregation,
        warningTolerancePct: Number(f.warningTolerancePct.replace(",", ".")) || 0,
        entryDueDays: Number(f.entryDueDays) || 0,
        orgUnitId: f.orgUnitId!,
        ownerId: f.ownerId!,
        dataEntryUserId: f.dataEntryUserId,
        formula: f.formula.trim() || null,
        startPeriod: f.startPeriod.trim() || null,
        isActive: f.isActive,
      };
      if (!editing) return api.post<KpiDefinitionDetail>("/kpi/definitions", body);
      const { code: _code, ...patch } = body;
      void _code;
      return api.patch<KpiDefinitionDetail>(`/kpi/definitions/${kpi.id}`, patch);
    },
    onSuccess: (k) => {
      qc.invalidateQueries({ queryKey: ["kpi"] });
      toast.success(t("common.saved"));
      onSaved?.(k);
      onClose();
    },
    onError: toast.error,
  });

  const valid = f.code.trim().length >= 2 && f.name.trim() && f.orgUnitId && f.ownerId && !formulaError && !startError;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title={editing ? t("kpiModule.form.editTitle") : t("kpiModule.form.newTitle")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t("kpiModule.code")} required hint={t("kpiModule.form.codeHint")}>
          <Input value={f.code} disabled={editing} onChange={(e) => set("code", e.target.value.toUpperCase())} maxLength={40} autoFocus={!editing} />
        </Field>
        <Field label={t("kpiModule.name")} required className="sm:col-span-1 lg:col-span-2">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label={t("common.description")} className="sm:col-span-2 lg:col-span-3">
          <Textarea rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field label={t("kpiModule.category")}>
          <Select value={f.category} onChange={(e) => set("category", e.target.value as KpiCategory)}>
            {KPI_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`kpiModule.category_${c}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("kpiModule.unit")} hint={t("kpiModule.form.unitHint")}>
          <Input value={f.unit} maxLength={20} onChange={(e) => set("unit", e.target.value)} />
        </Field>
        <Field label={t("kpiModule.form.decimals")}>
          <Input type="number" min={0} max={6} value={f.decimals} onChange={(e) => set("decimals", e.target.value)} />
        </Field>
        <Field label={t("kpiModule.direction")}>
          <Select value={f.direction} onChange={(e) => set("direction", e.target.value as KpiDirection)}>
            {KPI_DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {t(`kpiModule.direction_${d}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("kpiModule.frequencyLabel")} hint={editing ? t("kpiModule.form.frequencyLocked") : undefined}>
          <Select value={f.frequency} onChange={(e) => set("frequency", e.target.value as KpiFrequency)}>
            {KPI_FREQUENCIES.map((x) => (
              <option key={x} value={x}>
                {t(`kpiModule.frequency.${x}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("kpiModule.aggregation")} hint={t("kpiModule.form.aggregationHint")}>
          <Select value={f.aggregation} onChange={(e) => set("aggregation", e.target.value as KpiAggregation)}>
            {KPI_AGGREGATIONS.map((x) => (
              <option key={x} value={x}>
                {t(`kpiModule.aggregation_${x}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("kpiModule.form.tolerance")} hint={t("kpiModule.form.toleranceHint")}>
          <Input inputMode="decimal" value={f.warningTolerancePct} onChange={(e) => set("warningTolerancePct", e.target.value)} />
        </Field>
        <Field label={t("kpiModule.form.dueDays")} hint={t("kpiModule.form.dueDaysHint")}>
          <Input type="number" min={0} max={90} value={f.entryDueDays} onChange={(e) => set("entryDueDays", e.target.value)} />
        </Field>
        <Field label={t("kpiModule.orgUnit")} required>
          <OrgUnitSelect value={f.orgUnitId} onChange={(id) => set("orgUnitId", id)} />
        </Field>
        <Field label={t("kpiModule.owner")} required>
          <UserPicker
            value={f.ownerId}
            valueLabel={f.ownerLabel}
            clearable={false}
            onChange={(id, o) => setF((s) => ({ ...s, ownerId: id, ownerLabel: o?.label ?? null }))}
          />
        </Field>
        <Field label={t("kpiModule.dataEntryUser")} hint={t("kpiModule.form.dataEntryHint")}>
          <UserPicker
            value={f.dataEntryUserId}
            valueLabel={f.dataEntryLabel}
            onChange={(id, o) => setF((s) => ({ ...s, dataEntryUserId: id, dataEntryLabel: o?.label ?? null }))}
          />
        </Field>
        <Field
          label={t("kpiModule.form.startPeriod")}
          error={startError ? t("kpiModule.form.startPeriodInvalid", { example: currentPeriod(f.frequency) }) : undefined}
          hint={t("kpiModule.form.startPeriodHint", { example: currentPeriod(f.frequency) })}
        >
          <Input value={f.startPeriod} placeholder={currentPeriod(f.frequency)} onChange={(e) => set("startPeriod", e.target.value)} />
        </Field>
        <Field
          label={t("kpiModule.formula")}
          className="sm:col-span-2"
          error={formulaError}
          hint={refs.length ? t("kpiModule.form.formulaRefs", { refs: refs.join(", ") }) : t("kpiModule.form.formulaHint")}
        >
          <Input value={f.formula} placeholder="({HURDA_ADET} / {URETIM_ADET}) * 100" className="font-mono" onChange={(e) => set("formula", e.target.value)} />
        </Field>
        {editing && (
          <div className="flex items-end">
            <Checkbox label={t("common.active")} checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} />
          </div>
        )}
      </div>
    </Dialog>
  );
}
