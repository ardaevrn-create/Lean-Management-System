"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MeetingStats, MeetingTypeItem } from "@lean/shared";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Card, CardBody, CardHeader, DatePicker, EmptyState, Field, LoadingBlock, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

const pct = (v: number | null) => (v === null ? "—" : `%${v}`);

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <Card>
      <CardBody>
        <p className={cn("text-2xl font-semibold tabular-nums text-slate-900", tone)}>{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </CardBody>
    </Card>
  );
}

/** Toplantı etkinlik metrikleri (M4-09). */
export function MeetingsStatsPanel() {
  const t = useT();
  const [typeId, setTypeId] = useState("");
  const [from, setFrom] = useState(() => new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState("");

  const { data: types } = useQuery({ queryKey: ["meetings", "types"], queryFn: () => api.get<MeetingTypeItem[]>("/meetings/types") });
  const params = { typeId: typeId || undefined, from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined, to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined };
  const { data, isLoading } = useQuery({
    queryKey: ["meetings", "stats", params],
    queryFn: () => api.get<MeetingStats>("/meetings/stats", params),
    placeholderData: (prev) => prev,
  });

  const chart = (data?.byType ?? []).map((x) => ({
    name: x.typeName || t("meetingsModule.noType"),
    attendance: x.attendanceRate ?? 0,
    onTime: x.actionsClosedOnTimeRate ?? 0,
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-3">
          <Field label={t("meetingsModule.type")}>
            <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">{t("common.all")}</option>
              {types?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("meetingsModule.fromDate")}>
            <DatePicker value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={t("meetingsModule.toDate")}>
            <DatePicker value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      {isLoading || !data ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t("meetingsModule.stats.held")} value={data.held} />
            <Stat label={t("meetingsModule.stats.planned")} value={data.planned} />
            <Stat label={t("meetingsModule.stats.cancelled")} value={data.cancelled} />
            <Stat label={t("meetingsModule.stats.attendanceRate")} value={pct(data.attendanceRate)} />
            <Stat label={t("meetingsModule.stats.actionsOpened")} value={data.actionsOpened} />
            <Stat label={t("meetingsModule.stats.actionsClosed")} value={data.actionsClosed} />
            <Stat label={t("meetingsModule.stats.onTimeRate")} value={pct(data.actionsClosedOnTimeRate)} />
            <Stat label={t("meetingsModule.stats.overdue")} value={data.overdueActions} tone={data.overdueActions > 0 ? "text-red-600" : undefined} />
          </div>

          {data.byType.length === 0 ? (
            <Card>
              <EmptyState title={t("meetingsModule.stats.empty")} />
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader title={t("meetingsModule.stats.chartTitle")} />
                <CardBody>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                        <Tooltip formatter={(v) => `%${v}`} />
                        <Legend />
                        <Bar dataKey="attendance" name={t("meetingsModule.stats.attendanceRate")} fill="#4f46e5" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="onTime" name={t("meetingsModule.stats.onTimeRate")} fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardBody>
              </Card>
              <Card>
                <CardHeader title={t("meetingsModule.stats.byType")} />
                <Table>
                  <THead>
                    <tr>
                      <TH>{t("meetingsModule.type")}</TH>
                      <TH>{t("meetingsModule.stats.held")}</TH>
                      <TH>{t("meetingsModule.stats.planned")}</TH>
                      <TH>{t("meetingsModule.stats.cancelled")}</TH>
                      <TH>{t("meetingsModule.stats.attendanceRate")}</TH>
                      <TH>{t("meetingsModule.stats.actionsOpened")}</TH>
                      <TH>{t("meetingsModule.stats.onTimeRate")}</TH>
                      <TH>{t("meetingsModule.stats.overdue")}</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {data.byType.map((x) => (
                      <TR key={x.typeId ?? "none"}>
                        <TD className="font-medium text-slate-900">{x.typeName || t("meetingsModule.noType")}</TD>
                        <TD>{x.held}</TD>
                        <TD>{x.planned}</TD>
                        <TD>{x.cancelled}</TD>
                        <TD>{pct(x.attendanceRate)}</TD>
                        <TD>{x.actionsOpened}</TD>
                        <TD>{pct(x.actionsClosedOnTimeRate)}</TD>
                        <TD className={x.overdueActions > 0 ? "font-medium text-red-600" : undefined}>{x.overdueActions}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
