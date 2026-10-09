"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { periodLabel, type KpiComplianceResponse, type KpiComplianceRow, type KpiMissingResponse } from "@lean/shared";
import { api, type QueryParams } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { Badge, Button, Card, CardBody, CardHeader, DatePicker, EmptyState, Field, LoadingBlock, OrgUnitSelect, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { RateBar } from "./kpi-bits";

function Stat({ label, value, tone }: { label: string; value: number | string; tone: "gray" | "green" | "amber" | "red" }) {
  const tones = { gray: "text-slate-900", green: "text-emerald-600", amber: "text-amber-600", red: "text-red-600" };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className={cn("text-2xl font-semibold tabular-nums", tones[tone])}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function ComplianceTable({ rows, kind }: { rows: KpiComplianceRow[]; kind: "orgUnit" | "person" }) {
  const { t } = useI18n();
  if (!rows.length) return <EmptyState title={t("kpiModule.missing.noCompliance")} />;
  return (
    <Table>
      <THead>
        <tr>
          <TH>{kind === "orgUnit" ? t("kpiModule.orgUnit") : t("kpiModule.missing.person")}</TH>
          <TH className="text-right">{t("kpiModule.missing.expected")}</TH>
          <TH className="text-right">{t("kpiModule.missing.onTime")}</TH>
          <TH className="text-right">{t("kpiModule.missing.late")}</TH>
          <TH className="text-right">{t("kpiModule.missing.missingCol")}</TH>
          <TH className="min-w-44">{t("kpiModule.missing.compliance")}</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.orgUnit?.id ?? r.user?.id}>
            <TD className="font-medium text-slate-900">{kind === "orgUnit" ? r.orgUnit?.name : r.user?.fullName}</TD>
            <TD className="text-right tabular-nums">{r.expected}</TD>
            <TD className="text-right tabular-nums text-emerald-700">{r.onTime}</TD>
            <TD className="text-right tabular-nums text-amber-700">{r.late}</TD>
            <TD className={cn("text-right tabular-nums", r.missing > 0 && "font-semibold text-red-600")}>{r.missing}</TD>
            <TD>
              <RateBar value={r.complianceRate} />
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

/** Eksik veri raporu + uyum oranları: eksik giriş kim/hangi KPI/hangi dönem/kaç gün gecikmiş. */
export function MissingTab() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [orgUnitId, setOrgUnitId] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [view, setView] = useState<"orgUnit" | "person">("orgUnit");
  const params: QueryParams = { orgUnitId: orgUnitId ?? undefined, from: from || undefined, to: to || undefined };

  const missing = useQuery({ queryKey: ["kpi", "missing", params], queryFn: () => api.get<KpiMissingResponse>("/kpi/missing", params), placeholderData: (p) => p });
  const compliance = useQuery({ queryKey: ["kpi", "compliance", params], queryFn: () => api.get<KpiComplianceResponse>("/kpi/compliance", params), placeholderData: (p) => p });
  const total = missing.data?.total ?? 0;
  const o = compliance.data?.overall;

  return (
    <div className="space-y-4">
      {missing.data &&
        (total > 0 ? (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">{t("kpiModule.missing.bannerTitle", { count: total })}</p>
              <p className="text-sm">{t("kpiModule.missing.bannerText")}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <p className="font-medium">{t("kpiModule.missing.allEntered")}</p>
          </div>
        ))}

      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("kpiModule.orgUnit")}>
            <OrgUnitSelect value={orgUnitId} onChange={setOrgUnitId} placeholder={t("kpiModule.allUnits")} />
          </Field>
          <Field label={t("kpiModule.missing.dueFrom")}>
            <DatePicker value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={t("kpiModule.missing.dueTo")}>
            <DatePicker value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={() => api.download("/kpi/missing/export", "kpi-eksik-veriler.xlsx", params).catch(toast.error)}>
              <Download className="h-4 w-4" />
              {t("kpiModule.missing.exportMissing")}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("kpiModule.missing.complianceTitle")}
          actions={
            <div className="flex items-center gap-2">
              <div className="flex overflow-hidden rounded-lg border border-slate-300 text-xs">
                {(["orgUnit", "person"] as const).map((k) => (
                  <button key={k} onClick={() => setView(k)} className={cn("px-3 py-1.5", view === k ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}>
                    {k === "orgUnit" ? t("kpiModule.missing.byUnit") : t("kpiModule.missing.byPerson")}
                  </button>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={() => api.download("/kpi/compliance/export", "kpi-uyum.xlsx", { ...params, by: view }).catch(toast.error)}>
                <Download className="h-4 w-4" />
              </Button>
            </div>
          }
        />
        {!compliance.data || !o ? (
          <LoadingBlock />
        ) : (
          <>
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-lg border border-slate-200 bg-white p-3 lg:col-span-1">
                <p className="text-3xl font-semibold tabular-nums text-slate-900">{o.complianceRate === null ? "–" : `%${o.complianceRate}`}</p>
                <p className="mb-2 text-xs text-slate-500">{t("kpiModule.missing.compliance")}</p>
                <RateBar value={o.complianceRate} />
              </div>
              <Stat label={t("kpiModule.missing.expected")} value={o.expected} tone="gray" />
              <Stat label={t("kpiModule.missing.onTime")} value={o.onTime} tone="green" />
              <Stat label={t("kpiModule.missing.late")} value={o.late} tone="amber" />
              <Stat label={t("kpiModule.missing.missingCol")} value={o.missing} tone={o.missing ? "red" : "gray"} />
            </div>
            <ComplianceTable rows={view === "orgUnit" ? compliance.data.byOrgUnit : compliance.data.byPerson} kind={view} />
          </>
        )}
      </Card>

      <Card>
        <CardHeader title={t("kpiModule.missing.listTitle", { count: total })} />
        {!missing.data ? (
          <LoadingBlock />
        ) : missing.data.items.length === 0 ? (
          <EmptyState title={t("kpiModule.missing.empty")} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>KPI</TH>
                <TH>{t("kpiModule.orgUnit")}</TH>
                <TH>{t("kpiModule.period")}</TH>
                <TH>{t("kpiModule.missing.dueDate")}</TH>
                <TH>{t("kpiModule.missing.daysLate")}</TH>
                <TH>{t("kpiModule.missing.responsible")}</TH>
              </tr>
            </THead>
            <TBody>
              {missing.data.items.map((m) => (
                <TR key={`${m.kpi.id}-${m.period}`}>
                  <TD>
                    <Link href={`/kpi/${m.kpi.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {m.kpi.name}
                    </Link>
                    <div className="font-mono text-xs text-slate-500">{m.kpi.code}</div>
                  </TD>
                  <TD className="whitespace-nowrap">{m.orgUnit.name}</TD>
                  <TD className="whitespace-nowrap">{periodLabel(m.period, locale)}</TD>
                  <TD className="whitespace-nowrap">{formatDate(m.dueDate, locale)}</TD>
                  <TD>
                    <Badge tone={m.daysLate >= 7 ? "red" : "amber"} className="font-semibold">
                      {t("kpiModule.missing.daysLateN", { count: m.daysLate })}
                    </Badge>
                  </TD>
                  <TD className="whitespace-nowrap">{m.responsible.fullName}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
