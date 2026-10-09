"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SuggestionStats } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Card, CardBody, CardHeader, DatePicker, EmptyState, Field, LoadingBlock, OrgUnitSelect, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { money, sKey, Stat } from "./bits";

const pct = (v: number | null) => (v === null ? "—" : `%${v}`);

/** Öneri & kaizen istatistikleri (M7-08). */
export function StatsTab() {
  const { t, locale } = useI18n();
  const [orgUnitId, setOrgUnitId] = useState<string | null>(null);
  const [from, setFrom] = useState(() => new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState("");
  const params = { orgUnitId, from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined, to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined };
  const { data, isLoading } = useQuery({
    queryKey: sKey("stats", params),
    queryFn: () => api.get<SuggestionStats>("/suggestions/stats", params),
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-3">
          <Field label={t("suggestionsModule.form.area")}>
            <OrgUnitSelect value={orgUnitId} onChange={setOrgUnitId} placeholder={t("suggestionsModule.allUnits")} />
          </Field>
          <Field label={t("suggestionsModule.stats.from")}>
            <DatePicker value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={t("suggestionsModule.stats.to")}>
            <DatePicker value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      {isLoading || !data ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t("suggestionsModule.stats.total")} value={data.total} />
            <Stat label={t("suggestionsModule.stats.participation")} value={pct(data.participationPct)} hint={t("suggestionsModule.stats.ofEmployees", { n: data.activeEmployees })} />
            <Stat label={t("suggestionsModule.stats.perEmployee")} value={data.perEmployee ?? "—"} />
            <Stat label={t("suggestionsModule.stats.acceptance")} value={pct(data.acceptanceRate)} />
            <Stat label={t("suggestionsModule.stats.implementation")} value={pct(data.implementationRate)} />
            <Stat label={t("suggestionsModule.stats.daysToDecision")} value={data.avgDaysToDecision ?? "—"} />
            <Stat label={t("suggestionsModule.stats.daysToImpl")} value={data.avgDaysToImplementation ?? "—"} />
            <Stat label={t("suggestionsModule.stats.kaizenSaving")} value={money(data.kaizen.totalAnnualSaving, locale)} hint={`${t("suggestionsModule.kaizen.financeOk")}: ${money(data.kaizen.approvedAnnualSaving, locale)}`} />
          </div>

          {data.total === 0 ? (
            <Card><EmptyState title={t("suggestionsModule.stats.empty")} /></Card>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader title={t("suggestionsModule.stats.trend")} />
                  <CardBody>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.monthlyTrend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="submitted" name={t("suggestionsModule.stats.submitted")} stroke="#4f46e5" strokeWidth={2} dot />
                          <Line type="monotone" dataKey="accepted" name={t("suggestionsModule.stats.accepted")} stroke="#10b981" strokeWidth={2} dot />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader title={t("suggestionsModule.stats.byCategory")} />
                  <CardBody>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.byCategory.map((c) => ({ name: t(`suggestionsModule.category.${c.category}`), count: c.count }))} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Bar dataKey="count" name={t("suggestionsModule.stats.total")} fill="#4f46e5" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardBody>
                </Card>
              </div>

              <Card>
                <CardHeader title={t("suggestionsModule.stats.byUnit")} />
                <Table>
                  <THead>
                    <tr>
                      <TH>{t("suggestionsModule.form.area")}</TH>
                      <TH className="text-right">{t("suggestionsModule.stats.total")}</TH>
                      <TH className="text-right">{t("suggestionsModule.stats.employees")}</TH>
                      <TH className="text-right">{t("suggestionsModule.stats.perEmployee")}</TH>
                      <TH>{t("suggestionsModule.stats.participation")}</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {data.byOrgUnit.map((u) => (
                      <TR key={u.orgUnitId ?? "none"}>
                        <TD className="font-medium text-slate-900">{u.name}</TD>
                        <TD className="text-right tabular-nums">{u.count}</TD>
                        <TD className="text-right tabular-nums">{u.employees}</TD>
                        <TD className="text-right tabular-nums">{u.perEmployee ?? "—"}</TD>
                        <TD>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
                              <div className="h-full rounded-full bg-brand-500" style={{ width: `${u.participationPct ?? 0}%` }} />
                            </div>
                            <span className="text-xs tabular-nums text-slate-500">{pct(u.participationPct)}</span>
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader title={t("suggestionsModule.stats.top")} />
                  <Table>
                    <THead>
                      <tr><TH>{t("suggestionsModule.owner")}</TH><TH className="text-right">{t("suggestionsModule.stats.total")}</TH><TH className="text-right">{t("suggestionsModule.stats.accepted")}</TH></tr>
                    </THead>
                    <TBody>
                      {data.topContributors.map((c) => (
                        <TR key={c.userId}>
                          <TD className="font-medium text-slate-900">{c.fullName}</TD>
                          <TD className="text-right tabular-nums">{c.count}</TD>
                          <TD className="text-right tabular-nums">{c.accepted}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </Card>
                <Card>
                  <CardHeader title={t("suggestionsModule.stats.kaizenByUnit")} />
                  <Table>
                    <THead>
                      <tr><TH>{t("suggestionsModule.form.area")}</TH><TH className="text-right">{t("suggestionsModule.stats.kaizenCount")}</TH><TH className="text-right">{t("suggestionsModule.kaizen.annualSaving")}</TH></tr>
                    </THead>
                    <TBody>
                      {data.kaizen.byOrgUnit.length === 0 && (
                        <TR><TD colSpan={3} className="text-center text-slate-400">—</TD></TR>
                      )}
                      {data.kaizen.byOrgUnit.map((u) => (
                        <TR key={u.orgUnitId ?? "none"}>
                          <TD className="font-medium text-slate-900">{u.name}</TD>
                          <TD className="text-right tabular-nums">{u.count}</TD>
                          <TD className="text-right tabular-nums">{money(u.annualSaving, locale)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                  <p className="px-4 py-2 text-xs text-slate-500">
                    {Object.entries(data.kaizen.byType).map(([k, n]) => `${t(`suggestionsModule.kaizenType.${k}`)}: ${n}`).join(" · ")}
                  </p>
                </Card>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
