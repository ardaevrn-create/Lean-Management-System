"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { HOSHIN_LEVELS, type BowlingResponse, type HoshinLevel, type StrategyPlanBrief } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button, Card, Checkbox, EmptyState, Field, LoadingBlock, OrgUnitSelect, Select, useToast } from "@/components/ui";
import { BowlingTable } from "./bowling-table";
import { BOWLING_BG, HOSHIN_KEY } from "./strategy-bits";

export function BowlingTab({ plan, year }: { plan: StrategyPlanBrief; year: number }) {
  const { t } = useI18n();
  const toast = useToast();
  const [orgUnitId, setOrgUnitId] = useState<string | null>(null);
  const [level, setLevel] = useState<HoshinLevel | "">("");
  const [measuredOnly, setMeasuredOnly] = useState(false);
  const query = { planId: plan.id, year, orgUnitId, level: level || undefined, measuredOnly: measuredOnly || undefined };
  const { data, isLoading } = useQuery({
    queryKey: [...HOSHIN_KEY, "bowling", query],
    queryFn: () => api.get<BowlingResponse>("/hoshin/bowling", query),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t("strategyModule.field.orgUnit")} className="w-56">
            <OrgUnitSelect value={orgUnitId} onChange={setOrgUnitId} placeholder={t("common.all")} />
          </Field>
          <Field label={t("strategyModule.field.level")} className="w-44">
            <Select value={level} onChange={(e) => setLevel(e.target.value as HoshinLevel | "")}>
              <option value="">{t("common.all")}</option>
              {HOSHIN_LEVELS.filter((l) => l !== "BREAKTHROUGH").map((l) => (
                <option key={l} value={l}>{t(`strategyModule.level.${l}`)}</option>
              ))}
            </Select>
          </Field>
          <Checkbox checked={measuredOnly} onChange={(e) => setMeasuredOnly(e.target.checked)} label={t("strategyModule.bowling.measuredOnly")} className="pb-2" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex">
            {(["GREEN", "YELLOW", "RED", "NO_DATA"] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1">
                <span className={`h-3 w-3 rounded ${BOWLING_BG[s].split(" ")[0]}`} />
                {t(`strategyModule.color.${s}`)}
              </span>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => api.download("/hoshin/bowling/export", `hoshin-bowling-${year}.xlsx`, query).catch(toast.error)}>
            <Download className="h-4 w-4" />
            {t("common.exportExcel")}
          </Button>
        </div>
      </div>
      <p className="text-xs text-slate-500">{t("strategyModule.bowling.hint")}</p>
      <Card>
        {isLoading || !data ? <LoadingBlock /> : data.rows.length === 0 ? <EmptyState title={t("strategyModule.bowling.empty")} /> : <BowlingTable rows={data.rows} year={year} />}
      </Card>
    </div>
  );
}
