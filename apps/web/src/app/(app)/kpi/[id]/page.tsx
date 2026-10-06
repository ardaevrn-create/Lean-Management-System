"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil } from "lucide-react";
import {
  addPeriods, currentPeriod, firstPeriodOfYear, lastPeriodOfYear, periodLabel,
  type KpiDefinitionDetail, type KpiRevisionItem, type KpiSeries, type KpiSeriesPoint, type KpiValueResult,
} from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, LoadingBlock, Select, StatusBadge, Table, TBody, TD, TH, THead, TR,
} from "@/components/ui";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { DeviationDialog } from "@/components/kpi/deviation-dialog";
import { EntryStateBadge, formatKpiValue, StatusChip, targetText, ValueText } from "@/components/kpi/kpi-bits";
import { KpiChart } from "@/components/kpi/kpi-chart";
import { KpiFormDialog } from "@/components/kpi/kpi-form-dialog";
import { TargetEditor } from "@/components/kpi/target-editor";
import { ValueDialog } from "@/components/kpi/value-dialog";

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <div className="text-sm font-medium text-slate-800">{children}</div>
    </div>
  );
}

export default function KpiDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useI18n();
  const [range, setRange] = useState<"last12" | "thisYear" | "lastYear">("last12");
  const [editing, setEditing] = useState(false);
  const [valueFor, setValueFor] = useState<KpiSeriesPoint | null>(null);
  const [devFor, setDevFor] = useState<string | null>(null);

  const { data: kpi, isLoading } = useQuery({ queryKey: ["kpi", "detail", id], queryFn: () => api.get<KpiDefinitionDetail>(`/kpi/definitions/${id}`) });

  const bounds = (() => {
    if (!kpi) return {};
    const year = Number(currentPeriod("YEARLY"));
    if (range === "thisYear") return { from: firstPeriodOfYear(kpi.frequency, year), to: lastPeriodOfYear(kpi.frequency, year) };
    if (range === "lastYear") return { from: firstPeriodOfYear(kpi.frequency, year - 1), to: lastPeriodOfYear(kpi.frequency, year - 1) };
    const cur = currentPeriod(kpi.frequency);
    return { from: addPeriods(cur, -11), to: cur };
  })();
  const series = useQuery({
    queryKey: ["kpi", "series", id, range],
    enabled: !!kpi,
    queryFn: () => api.get<KpiSeries>(`/kpi/definitions/${id}/series`, bounds),
  });
  const revisions = useQuery({ queryKey: ["kpi", "revisions", id], enabled: !!kpi, queryFn: () => api.get<KpiRevisionItem[]>(`/kpi/definitions/${id}/revisions`) });

  if (isLoading || !kpi) return <LoadingBlock />;
  const s = series.data;
  const actionsByDeviation = new Map<string, NonNullable<typeof s>["actions"]>();
  for (const a of s?.actions ?? []) if (a.sourceId) actionsByDeviation.set(a.sourceId, [...(actionsByDeviation.get(a.sourceId) ?? []), a]);
  const lastValued = s ? [...s.points].reverse().find((p) => p.value !== null) : undefined;
  const agg = s?.ytd;
  const prevAgg = s?.previousYearYtd;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/kpi?tab=list" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
          {t("kpiModule.title")}
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{kpi.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
              <span className="font-mono">{kpi.code}</span>
              <Badge>{t(`kpiModule.category_${kpi.category}`)}</Badge>
              <Badge tone="blue">{t(`kpiModule.frequency.${kpi.frequency}`)}</Badge>
              <Badge tone="gray">{t(`kpiModule.direction_${kpi.direction}`)}</Badge>
              {kpi.formula && <Badge tone="indigo">{t("kpiModule.calculated")}</Badge>}
              {!kpi.isActive && <Badge tone="muted">{t("common.inactive")}</Badge>}
            </div>
            {kpi.description && <p className="mt-2 max-w-3xl text-sm text-slate-600">{kpi.description}</p>}
          </div>
          {kpi.can.manage && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
              {t("common.edit")}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Info label={t("kpiModule.orgUnit")}>{kpi.orgUnit.name}</Info>
          <Info label={t("kpiModule.owner")}>{kpi.owner.fullName}</Info>
          <Info label={t("kpiModule.dataEntryUser")}>{kpi.dataEntryUser?.fullName ?? <span className="text-slate-400">{t("kpiModule.detail.sameAsOwner")}</span>}</Info>
          <Info label={t("kpiModule.unit")}>{kpi.unit || "–"}</Info>
          <Info label={t("kpiModule.form.tolerance")}>%{kpi.warningTolerancePct}</Info>
          <Info label={t("kpiModule.form.dueDays")}>{t("kpiModule.detail.dueDaysValue", { count: kpi.entryDueDays })}</Info>
          <Info label={t("kpiModule.aggregation")}>{t(`kpiModule.aggregation_${kpi.aggregation}`)}</Info>
          {kpi.formula && (
            <Info label={t("kpiModule.formula")}>
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{kpi.formula}</code>
            </Info>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody>
            <p className="text-xs text-slate-500">{t("kpiModule.detail.lastValue")}</p>
            <p className="mt-1 text-2xl font-semibold">
              <ValueText value={lastValued?.value ?? null} kpi={kpi} locale={locale} />
            </p>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              {lastValued && <StatusChip status={lastValued.status} />}
              {lastValued && periodLabel(lastValued.period, locale)}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-slate-500">{t("kpiModule.target")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{lastValued ? targetText(lastValued.target, lastValued.targetMax, kpi, locale) : "–"}</p>
            <p className="mt-1 text-xs text-slate-500">{kpi.unit}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-slate-500">{t("kpiModule.detail.ytd", { year: s?.year ?? "" })}</p>
            <p className="mt-1 text-2xl font-semibold">
              <ValueText value={agg?.value ?? null} kpi={kpi} locale={locale} />
            </p>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              {agg && agg.value !== null && <StatusChip status={agg.status} />}
              {agg?.target !== null && agg?.target !== undefined && <span>{t("kpiModule.target")}: {formatKpiValue(agg.target, kpi.decimals, locale)}</span>}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-slate-500">{t("kpiModule.detail.ytdPrev", { year: s ? s.year - 1 : "" })}</p>
            <p className="mt-1 text-2xl font-semibold">
              <ValueText value={prevAgg?.value ?? null} kpi={kpi} locale={locale} />
            </p>
            <p className="mt-1 text-xs text-slate-500">{prevAgg?.periods ? t("kpiModule.detail.periodsN", { count: prevAgg.periods }) : ""}</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={t("kpiModule.detail.trend")}
          actions={
            <Select className="w-44" value={range} onChange={(e) => setRange(e.target.value as typeof range)}>
              <option value="last12">{t("kpiModule.detail.last12")}</option>
              <option value="thisYear">{t("kpiModule.detail.thisYear")}</option>
              <option value="lastYear">{t("kpiModule.detail.lastYear")}</option>
            </Select>
          }
        />
        <CardBody>{!s ? <LoadingBlock /> : <KpiChart kpi={s.kpi} points={s.points} />}</CardBody>
      </Card>

      <Card>
        <CardHeader title={t("kpiModule.detail.periods")} />
        {!s ? (
          <LoadingBlock />
        ) : s.points.length === 0 ? (
          <EmptyState title={t("kpiModule.detail.noPeriods")} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t("kpiModule.period")}</TH>
                <TH>{t("kpiModule.target")}</TH>
                <TH>{t("kpiModule.actual")}</TH>
                <TH>{t("common.status")}</TH>
                <TH>{t("kpiModule.detail.entryState")}</TH>
                <TH>{t("kpiModule.deviation.explanation")}</TH>
                <TH>{t("kpiModule.detail.linkedActions")}</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {[...s.points].reverse().map((p) => {
                const acts = p.deviation ? (actionsByDeviation.get(p.deviation.id) ?? []) : [];
                const gap = p.status === "YELLOW" || p.status === "RED";
                return (
                  <TR key={p.period}>
                    <TD className="whitespace-nowrap font-medium">{periodLabel(p.period, locale)}</TD>
                    <TD className="whitespace-nowrap">{targetText(p.target, p.targetMax, kpi, locale)}</TD>
                    <TD className="whitespace-nowrap">
                      <ValueText value={p.value} kpi={kpi} locale={locale} />
                      {p.isLate && p.value !== null && <span className="ml-1 text-xs text-amber-600">({t("kpiModule.detail.late")})</span>}
                    </TD>
                    <TD>{p.value !== null ? <StatusChip status={p.status} /> : <span className="text-slate-300">–</span>}</TD>
                    <TD>
                      <EntryStateBadge state={p.entryState} />
                    </TD>
                    <TD className="max-w-xs">
                      {p.deviation ? (
                        <div>
                          <p className="line-clamp-2 text-sm text-slate-700">{p.deviation.explanation}</p>
                          <Badge tone={p.deviation.approvalStatus === "APPROVED" ? "green" : p.deviation.approvalStatus === "REJECTED" ? "red" : "blue"} className="mt-1">
                            {t(`kpiModule.approval.${p.deviation.approvalStatus}`)}
                          </Badge>
                        </div>
                      ) : p.note ? (
                        <span className="text-xs text-slate-500">{p.note}</span>
                      ) : (
                        <span className="text-slate-300">–</span>
                      )}
                    </TD>
                    <TD>
                      {acts.length ? (
                        <ul className="space-y-1">
                          {acts.map((a) => (
                            <li key={a.id} className="flex items-center gap-1.5">
                              <Link href={`/actions/${a.id}`} className="text-xs font-medium text-brand-700 hover:underline">
                                {a.code}
                              </Link>
                              <StatusBadge status={a.status} overdue={a.isOverdue} />
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-slate-300">–</span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-right">
                      {gap && (
                        <Button size="sm" variant="outline" className="mr-1.5" onClick={() => setDevFor(p.period)}>
                          {t("kpiModule.detail.explanation")}
                        </Button>
                      )}
                      {kpi.can.enter && (
                        <Button size="sm" variant="ghost" onClick={() => setValueFor(p)}>
                          {p.value === null ? t("kpiModule.detail.enter") : t("common.edit")}
                        </Button>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {kpi.can.manage && <TargetEditor kpi={kpi} />}

      <Card>
        <CardHeader title={t("kpiModule.detail.revisions")} />
        {!revisions.data ? (
          <LoadingBlock />
        ) : revisions.data.length === 0 ? (
          <EmptyState title={t("kpiModule.detail.noRevisions")} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t("kpiModule.period")}</TH>
                <TH>{t("kpiModule.detail.oldValue")}</TH>
                <TH>{t("kpiModule.detail.newValue")}</TH>
                <TH>{t("kpiModule.value.reason")}</TH>
                <TH>{t("kpiModule.detail.changedBy")}</TH>
                <TH>{t("kpiModule.detail.changedAt")}</TH>
              </tr>
            </THead>
            <TBody>
              {revisions.data.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap">{periodLabel(r.period, locale)}</TD>
                  <TD className="tabular-nums">{formatKpiValue(r.oldValue, kpi.decimals, locale)}</TD>
                  <TD className="font-medium tabular-nums">{formatKpiValue(r.newValue, kpi.decimals, locale)}</TD>
                  <TD>{r.reason}</TD>
                  <TD className="whitespace-nowrap">{r.changedBy.fullName}</TD>
                  <TD className="whitespace-nowrap">{formatDateTime(r.createdAt, locale)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <AttachmentsPanel entityType="KPI" entityId={kpi.id} />
      <p className="text-xs text-slate-400">
        {t("kpiModule.detail.createdAt")}: {formatDate(kpi.createdAt, locale)}
      </p>

      {editing && <KpiFormDialog open kpi={kpi} onClose={() => setEditing(false)} />}
      {valueFor && (
        <ValueDialog
          kpi={kpi}
          period={valueFor.period}
          value={valueFor.value}
          note={valueFor.note}
          target={valueFor.target}
          targetMax={valueFor.targetMax}
          onClose={() => setValueFor(null)}
          onSaved={(r: KpiValueResult) => r.entryState === "DEVIATION_REQUIRED" && setDevFor(r.period)}
        />
      )}
      {devFor && <DeviationDialog open kpiId={kpi.id} period={devFor} onClose={() => setDevFor(null)} />}
    </div>
  );
}
