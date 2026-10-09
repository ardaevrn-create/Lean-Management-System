"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { periodLabel, type KpiDeviationListItem } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, CardBody, EmptyState, LoadingBlock, OrgUnitSelect, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { DeviationDialog } from "./deviation-dialog";
import { EntryStateBadge, StatusChip, targetText, ValueText } from "./kpi-bits";

type State = "required" | "pending" | "all";

/** Sapmalar: açıklama/aksiyon bekleyen dönemler ve onay bekleyen açıklamalar. */
export function DeviationsTab() {
  const { t, locale } = useI18n();
  const [state, setState] = useState<State>("required");
  const [orgUnitId, setOrgUnitId] = useState<string | null>(null);
  const [open, setOpen] = useState<KpiDeviationListItem | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["kpi", "deviations", state, orgUnitId],
    queryFn: () => api.get<KpiDeviationListItem[]>("/kpi/deviations", { state, orgUnitId: orgUnitId ?? undefined }),
    placeholderData: (p) => p,
  });

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(["required", "pending", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setState(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                state === s ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50",
              )}
            >
              {t(`kpiModule.deviations.state_${s}`)}
            </button>
          ))}
        </div>
        <div className="sm:w-60">
          <OrgUnitSelect value={orgUnitId} onChange={setOrgUnitId} placeholder={t("kpiModule.allUnits")} />
        </div>
      </div>
      {state === "required" && <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">{t("kpiModule.deviations.ruleHint")}</p>}

      {isLoading || !data ? (
        <LoadingBlock />
      ) : data.length === 0 ? (
        <EmptyState title={t(`kpiModule.deviations.empty_${state}`)} />
      ) : (
        <CardBody className="p-0">
          <Table>
            <THead>
              <tr>
                <TH>KPI</TH>
                <TH>{t("kpiModule.period")}</TH>
                <TH>{t("kpiModule.actual")}</TH>
                <TH>{t("kpiModule.target")}</TH>
                <TH>{t("common.status")}</TH>
                <TH>{t("kpiModule.deviation.explanation")}</TH>
                <TH>{t("kpiModule.deviations.actions")}</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {data.map((d) => (
                <TR key={`${d.kpi.id}-${d.period}`}>
                  <TD>
                    <Link href={`/kpi/${d.kpi.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {d.kpi.name}
                    </Link>
                    <div className="font-mono text-xs text-slate-500">
                      {d.kpi.code} · {d.kpi.orgUnit.name}
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap">{periodLabel(d.period, locale)}</TD>
                  <TD className="whitespace-nowrap">
                    <ValueText value={d.value} kpi={d.kpi} locale={locale} />
                  </TD>
                  <TD className="whitespace-nowrap">{targetText(d.target, d.targetMax, d.kpi, locale)}</TD>
                  <TD>
                    <div className="flex flex-col items-start gap-1">
                      <StatusChip status={d.status} />
                      <EntryStateBadge state={d.entryState} />
                    </div>
                  </TD>
                  <TD className="max-w-xs">
                    {d.deviation ? <p className="line-clamp-2 text-sm text-slate-700">{d.deviation.explanation}</p> : <span className="text-slate-400">–</span>}
                  </TD>
                  <TD>
                    {d.needsActions || d.actionCount > 0 ? (
                      <Badge tone={d.needsActions && d.actionCount === 0 ? "red" : "gray"}>{d.actionCount}</Badge>
                    ) : (
                      <span className="text-slate-400">–</span>
                    )}
                  </TD>
                  <TD className="text-right">
                    <Button
                      size="sm"
                      variant={d.entryState === "DEVIATION_REQUIRED" ? "primary" : d.entryState === "PENDING_APPROVAL" && d.canApprove ? "primary" : "outline"}
                      onClick={() => setOpen(d)}
                    >
                      {d.entryState === "DEVIATION_REQUIRED"
                        ? t("kpiModule.deviations.explain")
                        : d.entryState === "PENDING_APPROVAL" && d.canApprove
                          ? t("kpiModule.deviations.review")
                          : t("kpiModule.deviations.open")}
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardBody>
      )}
      {open && <DeviationDialog open kpiId={open.kpi.id} period={open.period} onClose={() => setOpen(null)} />}
    </Card>
  );
}
