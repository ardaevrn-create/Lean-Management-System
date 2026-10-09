"use client";

import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { periodLabel, type KpiBrief, type KpiSeriesPoint } from "@lean/shared";
import { useI18n } from "@/lib/i18n";
import { STATUS_STYLE, statusOf } from "./kpi-bits";

/** Gerçekleşen (durum renginde çubuk) + hedef çizgisi (+ aralık üst sınırı) + önceki yıl (kesikli). */
export function KpiChart({ kpi, points }: { kpi: KpiBrief; points: KpiSeriesPoint[] }) {
  const { t, locale } = useI18n();
  const data = points.map((p) => ({
    label: periodLabel(p.period, locale),
    value: p.value,
    target: p.target,
    targetMax: p.targetMax,
    prev: p.previousYearValue,
    fill: STATUS_STYLE[statusOf(p.status)].hex,
  }));
  const fmt = (v: unknown) => (typeof v === "number" ? v.toLocaleString(locale === "en" ? "en-GB" : "tr-TR", { maximumFractionDigits: kpi.decimals }) : "–");
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={fmt} />
          <Tooltip formatter={(v) => `${fmt(v)} ${kpi.unit}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="value" name={t("kpiModule.actual")} maxBarSize={40} radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
          </Bar>
          <Line dataKey="target" name={kpi.direction === "RANGE" ? t("kpiModule.detail.targetMin") : t("kpiModule.target")} stroke="#1e293b" strokeWidth={2} dot={false} type="stepAfter" connectNulls />
          {kpi.direction === "RANGE" && (
            <Line dataKey="targetMax" name={t("kpiModule.detail.targetMax")} stroke="#1e293b" strokeWidth={2} strokeDasharray="2 4" dot={false} type="stepAfter" connectNulls />
          )}
          <Line dataKey="prev" name={t("kpiModule.detail.previousYear")} stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 2 }} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
