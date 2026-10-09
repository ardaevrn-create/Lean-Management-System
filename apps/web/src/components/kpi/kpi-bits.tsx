"use client";

import type { KpiBoardPoint, KpiBrief, KpiEntryState, KpiStatus } from "@lean/shared";
import { computeKpiStatus } from "@lean/shared";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge, type BadgeTone } from "@/components/ui";

/** Durum renkleri: yeşil = hedefte, sarı = uyarı, kırmızı = hedef altı, gri = hedef/veri yok. */
export const STATUS_STYLE: Record<KpiStatus, { dot: string; border: string; text: string; bg: string; hex: string }> = {
  GREEN: { dot: "bg-emerald-500", border: "border-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", hex: "#10b981" },
  YELLOW: { dot: "bg-amber-500", border: "border-amber-500", text: "text-amber-700", bg: "bg-amber-50", hex: "#f59e0b" },
  RED: { dot: "bg-red-500", border: "border-red-500", text: "text-red-700", bg: "bg-red-50", hex: "#ef4444" },
  NO_TARGET: { dot: "bg-slate-300", border: "border-slate-300", text: "text-slate-500", bg: "bg-slate-50", hex: "#94a3b8" },
};

export const statusOf = (s: KpiStatus | null | undefined): KpiStatus => s ?? "NO_TARGET";

export function StatusDot({ status, className }: { status: KpiStatus | null | undefined; className?: string }) {
  return <span className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", STATUS_STYLE[statusOf(status)].dot, className)} />;
}

export function StatusChip({ status, noData }: { status: KpiStatus | null | undefined; noData?: boolean }) {
  const { t } = useI18n();
  const s = statusOf(status);
  const st = STATUS_STYLE[s];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", st.bg, st.text)}>
      <span className={cn("h-2 w-2 rounded-full", st.dot)} />
      {noData ? t("kpiModule.status.NO_DATA") : t(`kpiModule.status.${s}`)}
    </span>
  );
}

const ENTRY_TONE: Record<KpiEntryState, BadgeTone> = {
  NOT_DUE: "gray",
  MISSING: "red",
  DEVIATION_REQUIRED: "amber",
  PENDING_APPROVAL: "blue",
  COMPLETE: "green",
};

export function EntryStateBadge({ state }: { state: KpiEntryState | null | undefined }) {
  const { t } = useI18n();
  if (!state) return null;
  return <Badge tone={ENTRY_TONE[state]}>{t(`kpiModule.entryState.${state}`)}</Badge>;
}

/** "1.234,5" / "12,5" / "12.5" biçimlerini sayıya çevirir. Boş/geçersizse null. */
export function parseDecimal(input: string): number | null {
  let s = input.trim().replace(/\s/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // Son ayraç ondalık, diğeri binlik
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) s = s.replace(",", ".");
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function formatKpiValue(v: number | null | undefined, decimals: number, locale = "tr"): string {
  if (v === null || v === undefined) return "–";
  return v.toLocaleString(locale === "en" ? "en-GB" : "tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: Math.max(decimals, 0) });
}

/** Değer + birim, ör. "82,5 %" */
export function ValueText({ value, kpi, locale }: { value: number | null | undefined; kpi: Pick<KpiBrief, "decimals" | "unit">; locale: string }) {
  if (value === null || value === undefined) return <span className="text-slate-400">–</span>;
  return (
    <span className="tabular-nums">
      {formatKpiValue(value, kpi.decimals, locale)}
      {kpi.unit && <span className="ml-0.5 text-xs text-slate-500">{kpi.unit}</span>}
    </span>
  );
}

/** Hedef metni; aralık yönünde "40 – 60". */
export function targetText(target: number | null, targetMax: number | null, kpi: Pick<KpiBrief, "decimals" | "direction">, locale: string): string {
  if (target === null) return "–";
  const a = formatKpiValue(target, kpi.decimals, locale);
  if (kpi.direction === "RANGE" && targetMax !== null) return `${a} – ${formatKpiValue(targetMax, kpi.decimals, locale)}`;
  const sign = kpi.direction === "HIGHER_BETTER" ? "≥ " : kpi.direction === "LOWER_BETTER" ? "≤ " : "";
  return `${sign}${a}`;
}

/** Girilen değer için canlı durum (sunucudaki ile aynı paylaşılan kural). */
export function liveStatus(kpi: Pick<KpiBrief, "direction" | "warningTolerancePct">, value: number | null, target: number | null, targetMax: number | null): KpiStatus {
  return computeKpiStatus({ value, target, targetMax, direction: kpi.direction, tolerancePct: kpi.warningTolerancePct });
}

/** Küçük trend çizgisi (son dönemler). */
export function Sparkline({ points, className, height = 36 }: { points: KpiBoardPoint[]; className?: string; height?: number }) {
  const w = 120;
  const vals = points.filter((p) => p.value !== null).map((p) => p.value as number);
  const targets = points.filter((p) => p.target !== null).map((p) => p.target as number);
  if (!vals.length) return <div className={cn("h-9 text-xs text-slate-400", className)} />;
  const all = [...vals, ...targets];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const x = (i: number) => (points.length === 1 ? w / 2 : 4 + (i * (w - 8)) / (points.length - 1));
  const y = (v: number) => height - 4 - ((v - min) / span) * (height - 8);
  const line = points.map((p, i) => (p.value === null ? null : `${x(i)},${y(p.value)}`)).filter(Boolean);
  const targetLine = points.map((p, i) => (p.target === null ? null : `${x(i)},${y(p.target)}`)).filter(Boolean);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className={cn("w-full", className)} style={{ height }} preserveAspectRatio="none" aria-hidden>
      {targetLine.length > 1 && <polyline points={targetLine.join(" ")} fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" />}
      <polyline points={line.join(" ")} fill="none" stroke="#475569" strokeWidth="1.5" strokeLinejoin="round" />
      {points.map((p, i) =>
        p.value === null ? null : <circle key={p.period} cx={x(i)} cy={y(p.value)} r="2.5" fill={STATUS_STYLE[statusOf(p.status)].hex} />,
      )}
    </svg>
  );
}

/** Basit yüzde çubuğu (uyum oranı). */
export function RateBar({ value, className }: { value: number | null; className?: string }) {
  const tone = value === null ? "bg-slate-300" : value >= 90 ? "bg-emerald-500" : value >= 70 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${value ?? 0}%` }} />
      </div>
      <span className="w-12 text-right text-xs font-medium tabular-nums text-slate-700">{value === null ? "–" : `%${value}`}</span>
    </div>
  );
}
