"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { currentPeriod, firstPeriodOfYear, lastPeriodOfYear, periodLabel, periodsOfYear, type KpiBrief, type KpiTargetItem } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button, Card, CardBody, CardHeader, Field, Input, LoadingBlock, Select } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { parseDecimal } from "./kpi-bits";

type Row = { target: string; max: string };
const toStr = (n: number | null | undefined, locale: string) => (n === null || n === undefined ? "" : String(n).replace(".", locale === "en" ? "." : ","));

function Editor({ kpi, year, targets }: { kpi: KpiBrief; year: number; targets: KpiTargetItem[] }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const periods = periodsOfYear(kpi.frequency, year);
  const existing = new Map(targets.map((x) => [x.period, x]));
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(periods.map((p) => [p, { target: toStr(existing.get(p)?.target, locale), max: toStr(existing.get(p)?.targetMax, locale) }])),
  );
  const [all, setAll] = useState("");
  const [allMax, setAllMax] = useState("");
  const range = kpi.direction === "RANGE";

  const apply = () => {
    const v = parseDecimal(all);
    if (v === null) return;
    const m = parseDecimal(allMax);
    setRows(Object.fromEntries(periods.map((p) => [p, { target: toStr(v, locale), max: m === null ? rows[p].max : toStr(m, locale) }])));
  };

  const save = useMutation({
    mutationFn: () =>
      api.put(`/kpi/definitions/${kpi.id}/targets`, {
        targets: periods
          .map((p) => {
            const target = parseDecimal(rows[p].target);
            const had = existing.has(p);
            if (target === null) return had ? { period: p, target: null } : null;
            return { period: p, target, targetMax: range ? parseDecimal(rows[p].max) : null };
          })
          .filter(Boolean),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kpi"] });
      toast.success(t("kpiModule.targets.saved"));
    },
    onError: toast.error,
  });

  return (
    <>
      <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label={range ? t("kpiModule.targets.allMin") : t("kpiModule.targets.all")} hint={t("kpiModule.targets.allHint", { count: periods.length })}>
          <Input inputMode="decimal" value={all} onChange={(e) => setAll(e.target.value)} />
        </Field>
        {range ? (
          <Field label={t("kpiModule.targets.allMax")}>
            <Input inputMode="decimal" value={allMax} onChange={(e) => setAllMax(e.target.value)} />
          </Field>
        ) : (
          <div />
        )}
        <Button variant="outline" disabled={parseDecimal(all) === null} onClick={apply}>
          {t("kpiModule.targets.apply")}
        </Button>
      </div>
      <div className="grid max-h-80 gap-2 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-3">
        {periods.map((p) => (
          <div key={p} className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-slate-500">{periodLabel(p, locale)}</span>
            <Input inputMode="decimal" value={rows[p].target} placeholder={range ? t("kpiModule.detail.targetMin") : t("kpiModule.target")} onChange={(e) => setRows((r) => ({ ...r, [p]: { ...r[p], target: e.target.value } }))} />
            {range && <Input inputMode="decimal" value={rows[p].max} placeholder={t("kpiModule.detail.targetMax")} onChange={(e) => setRows((r) => ({ ...r, [p]: { ...r[p], max: e.target.value } }))} />}
          </div>
        ))}
      </div>
      <div className="flex justify-end border-t border-slate-100 p-3">
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          {t("common.save")}
        </Button>
      </div>
    </>
  );
}

/** Yıllık hedef düzenleyici: tüm dönemlere aynı hedef ya da dönem bazında. */
export function TargetEditor({ kpi }: { kpi: KpiBrief }) {
  const { t } = useI18n();
  const thisYear = Number(currentPeriod("YEARLY"));
  const [year, setYear] = useState(thisYear);
  const { data, isLoading } = useQuery({
    queryKey: ["kpi", "targets", kpi.id, year],
    queryFn: () => api.get<KpiTargetItem[]>(`/kpi/definitions/${kpi.id}/targets`, { from: firstPeriodOfYear(kpi.frequency, year), to: lastPeriodOfYear(kpi.frequency, year) }),
  });
  return (
    <Card>
      <CardHeader
        title={t("kpiModule.targets.title")}
        actions={
          <Select className="w-28" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        }
      />
      <CardBody className="p-0">{isLoading || !data ? <LoadingBlock /> : <Editor key={`${year}-${data.length}-${data.map((x) => x.target).join(",")}`} kpi={kpi} year={year} targets={data} />}</CardBody>
    </Card>
  );
}
