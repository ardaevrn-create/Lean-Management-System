"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowRight, ArrowUp, Trophy } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AUDIT_TEMPLATE_TYPES, TAG_CATEGORIES, TAG_COLORS, type AuditAreaStat, type AuditStats, type AuditTemplateType } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Card, CardBody, CardHeader, DatePicker, EmptyState, Field, LoadingBlock, OrgUnitSelect, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { A, ScoreBadge, fmtPct } from "./audit-bits";

const PALETTE = ["#4f46e5", "#059669", "#d97706", "#dc2626", "#0891b2", "#7c3aed", "#be185d", "#65a30d"];

function Kpi({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "red" | "green" | "amber" }) {
  return (
    <Card>
      <CardBody>
        <p className={cn("text-2xl font-semibold tabular-nums", tone === "red" ? "text-red-600" : tone === "green" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : "text-slate-900")}>{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </CardBody>
    </Card>
  );
}

function Delta({ cur, prev }: { cur: number | null; prev: number | null }) {
  if (cur === null || prev === null) return <span className="text-slate-400">–</span>;
  const d = Math.round((cur - prev) * 10) / 10;
  if (d === 0) return <ArrowRight className="h-4 w-4 text-slate-400" />;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", d > 0 ? "text-emerald-600" : "text-red-600")}>
      {d > 0 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
      {Math.abs(d)}
    </span>
  );
}

export function ReportsTab() {
  const { t, locale } = useI18n();
  const [orgUnitId, setOrgUnitId] = useState<string | null>(null);
  const [type, setType] = useState<AuditTemplateType | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [radarArea, setRadarArea] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["audits", "stats", orgUnitId, type, from, to],
    queryFn: () => api.get<AuditStats>("/audits/stats", { orgUnitId: orgUnitId ?? undefined, templateType: type || undefined, from: from || undefined, to: to || undefined }),
  });

  const scored = useMemo(() => (data?.areas ?? []).filter((a) => a.latestScore !== null).sort((a, b) => b.latestScore! - a.latestScore!), [data]);
  useEffect(() => {
    if (scored.length && !scored.some((a) => a.areaId === radarArea)) setRadarArea(scored[0].areaId);
  }, [scored, radarArea]);

  // Trend: ay bazında birleştirilmiş satırlar, alan başına bir çizgi
  const trend = useMemo(() => {
    const rows = new Map<string, Record<string, number | string>>();
    for (const a of scored) {
      for (const p of a.trend) {
        const key = p.date.slice(0, 7);
        rows.set(key, { ...(rows.get(key) ?? { month: key }), [a.areaId]: p.scorePct });
      }
    }
    return [...rows.values()].sort((x, y) => String(x.month).localeCompare(String(y.month)));
  }, [scored]);

  const radar = useMemo(() => {
    const area = scored.find((a) => a.areaId === radarArea);
    if (!area) return [];
    const overall = new Map((data?.sectionAverages ?? []).map((s) => [s.title, s.scorePct]));
    return area.sectionAverages.map((s) => ({ section: s.title.replace(/\s*\(.*\)$/, ""), area: s.scorePct, overall: overall.get(s.title) ?? null }));
  }, [scored, radarArea, data]);

  const tagBars = useMemo(
    () => TAG_CATEGORIES.map((c) => ({ name: t(`${A}.tagCategory.${c}`), value: data?.tags.byCategory[c] ?? 0 })),
    [data, t],
  );

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t(`${A}.common.orgUnit`)}>
            <OrgUnitSelect value={orgUnitId} onChange={setOrgUnitId} placeholder={t(`${A}.common.all`)} />
          </Field>
          <Field label={t(`${A}.reports.templateType`)}>
            <Select value={type} onChange={(e) => setType(e.target.value as AuditTemplateType | "")}>
              <option value="">{t(`${A}.all.allTypes`)}</option>
              {AUDIT_TEMPLATE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {t(`${A}.templateType.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t(`${A}.common.from`)}>
            <DatePicker value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={t(`${A}.common.to`)}>
            <DatePicker value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      </Card>

      {isLoading || !data ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={t(`${A}.reports.completion`)} value={data.compliance.completionRate === null ? "–" : fmtPct(data.compliance.completionRate)} tone={data.compliance.completionRate !== null && data.compliance.completionRate >= 80 ? "green" : "amber"} />
            <Kpi label={t(`${A}.reports.overdueAudits`)} value={data.compliance.overdue} tone={data.compliance.overdue ? "red" : undefined} />
            <Kpi label={t(`${A}.reports.openActions`)} value={data.findings.openActions} tone={data.findings.overdueActions ? "amber" : undefined} />
            <Kpi label={t(`${A}.reports.openTags`)} value={data.tags.open} tone={data.tags.overdue ? "red" : undefined} />
          </div>

          {scored.length === 0 ? (
            <Card>
              <EmptyState title={t(`${A}.reports.noData`)} />
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader title={t(`${A}.reports.ranking`)} />
                  <Table>
                    <THead>
                      <tr>
                        <TH>{t(`${A}.reports.rank`)}</TH>
                        <TH>{t(`${A}.common.area`)}</TH>
                        <TH>{t(`${A}.reports.latest`)}</TH>
                        <TH>{t(`${A}.reports.change`)}</TH>
                        <TH>{t(`${A}.reports.average`)}</TH>
                        <TH>{t(`${A}.reports.count`)}</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {scored.map((a, i) => (
                        <TR key={a.areaId}>
                          <TD className="tabular-nums">
                            {i === 0 ? <Trophy className="h-4 w-4 text-amber-500" /> : i + 1}
                          </TD>
                          <TD className="font-medium text-slate-900">{a.name}</TD>
                          <TD>
                            <ScoreBadge pct={a.latestScore} />
                          </TD>
                          <TD>
                            <Delta cur={a.latestScore} prev={a.previousScore} />
                          </TD>
                          <TD className="tabular-nums">{fmtPct(a.average)}</TD>
                          <TD className="tabular-nums">{a.auditCount}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                  <div className="grid grid-cols-2 gap-3 border-t border-slate-100 p-3 text-xs">
                    <div>
                      <p className="mb-1 font-semibold text-emerald-700">{t(`${A}.reports.best`)}</p>
                      {data.best.map((a: AuditAreaStat) => (
                        <p key={a.areaId} className="truncate text-slate-600">
                          {a.name} <span className="font-medium">{fmtPct(a.latestScore)}</span>
                        </p>
                      ))}
                    </div>
                    <div>
                      <p className="mb-1 font-semibold text-red-700">{t(`${A}.reports.worst`)}</p>
                      {data.worst.map((a: AuditAreaStat) => (
                        <p key={a.areaId} className="truncate text-slate-600">
                          {a.name} <span className="font-medium">{fmtPct(a.latestScore)}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                </Card>

                <Card>
                  <CardHeader title={t(`${A}.reports.trend`)} />
                  <CardBody>
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v) => (typeof v === "number" ? `%${v}` : String(v))} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          {scored.map((a, i) => (
                            <Line key={a.areaId} dataKey={a.areaId} name={a.name} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardBody>
                </Card>
              </div>

              <Card>
                <CardHeader
                  title={t(`${A}.reports.radar`)}
                  actions={
                    <Select value={radarArea} onChange={(e) => setRadarArea(e.target.value)} className="h-8 w-56 text-xs" aria-label={t(`${A}.reports.radarArea`)}>
                      {scored.map((a) => (
                        <option key={a.areaId} value={a.areaId}>
                          {a.name}
                        </option>
                      ))}
                    </Select>
                  }
                />
                <CardBody>
                  <p className="mb-2 text-xs text-slate-500">{t(`${A}.reports.radarHint`)}</p>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radar} outerRadius="72%">
                        <PolarGrid />
                        <PolarAngleAxis dataKey="section" tick={{ fontSize: 11 }} />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                        <Radar name={scored.find((a) => a.areaId === radarArea)?.name} dataKey="area" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.35} />
                        <Radar name={t(`${A}.common.all`)} dataKey="overall" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.1} strokeDasharray="4 3" />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Tooltip formatter={(v) => (typeof v === "number" ? `%${v}` : String(v))} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </CardBody>
              </Card>
            </>
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title={t(`${A}.reports.missed`)} />
              {data.missed.length === 0 ? (
                <EmptyState title={t(`${A}.reports.noMissed`)} className="py-8" />
              ) : (
                <Table>
                  <THead>
                    <tr>
                      <TH>{t(`${A}.all.number`)}</TH>
                      <TH>{t(`${A}.common.area`)}</TH>
                      <TH>{t(`${A}.common.auditor`)}</TH>
                      <TH>{t(`${A}.common.dueDate`)}</TH>
                      <TH>{t(`${A}.reports.daysLate`)}</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {data.missed.map((m) => (
                      <TR key={m.auditId}>
                        <TD className="font-mono text-xs">
                          <Link href={`/audits/${m.auditId}`} className="text-brand-700 hover:underline">
                            {m.code}
                          </Link>
                        </TD>
                        <TD>{m.areaName}</TD>
                        <TD>{m.auditorName}</TD>
                        <TD className="whitespace-nowrap">{new Date(m.dueDate).toLocaleDateString(locale === "en" ? "en-GB" : "tr-TR")}</TD>
                        <TD className="font-medium tabular-nums text-red-600">{m.daysOverdue}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
              <div className="grid grid-cols-3 gap-2 border-t border-slate-100 p-3 text-center text-xs text-slate-500">
                <div>
                  <p className="text-base font-semibold text-slate-900">{data.compliance.planned}</p>
                  {t(`${A}.reports.planned`)}
                </div>
                <div>
                  <p className="text-base font-semibold text-emerald-600">{data.compliance.completed}</p>
                  {t(`${A}.reports.completed`)}
                </div>
                <div>
                  <p className="text-base font-semibold text-red-600">{data.compliance.overdue}</p>
                  {t(`${A}.reports.overdueShort`)}
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title={t(`${A}.reports.tagsTitle`)} />
              <CardBody className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-lg font-semibold">{data.tags.avgClosureDays === null ? "–" : t(`${A}.reports.days`, { n: data.tags.avgClosureDays })}</p>
                    <p className="text-xs text-slate-500">{t(`${A}.reports.avgClosure`)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-lg font-semibold text-red-600">{data.tags.overdue}</p>
                    <p className="text-xs text-slate-500">{t(`${A}.reports.overdueTags`)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-lg font-semibold">{data.tags.closed}</p>
                    <p className="text-xs text-slate-500">{t(`${A}.reports.closedTags`)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-lg font-semibold">{data.findings.withoutAction}</p>
                    <p className="text-xs text-slate-500">{t(`${A}.reports.findingsNoAction`)}</p>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-600">{t(`${A}.reports.byColor`)}</p>
                  <div className="flex gap-3">
                    {TAG_COLORS.map((c) => (
                      <div key={c} className={cn("flex flex-1 items-center gap-2 rounded-lg px-3 py-2", c === "RED" ? "bg-red-50 text-red-800" : "bg-blue-50 text-blue-800")}>
                        <span className={cn("h-3 w-3 rounded-full", c === "RED" ? "bg-red-500" : "bg-blue-500")} />
                        <span className="text-sm">{t(`${A}.tagColorShort.${c}`)}</span>
                        <span className="ml-auto text-lg font-semibold tabular-nums">{data.tags.byColor[c]}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-600">{t(`${A}.reports.byCategory`)}</p>
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={tagBars} layout="vertical" margin={{ left: 12, right: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#6366f1" radius={[0, 3, 3, 0]} barSize={14} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

