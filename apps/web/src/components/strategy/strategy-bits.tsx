"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { BowlingStatus, HoshinLevel, HoshinStatus, StrategyPlanBrief } from "@lean/shared";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge, type BadgeTone } from "@/components/ui";

export const BOWLING_BG: Record<BowlingStatus, string> = {
  GREEN: "bg-emerald-500 text-white",
  YELLOW: "bg-amber-400 text-slate-900",
  RED: "bg-red-500 text-white",
  NO_DATA: "bg-slate-200 text-slate-500",
};
export const BOWLING_SOFT: Record<BowlingStatus, string> = {
  GREEN: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  YELLOW: "bg-amber-50 text-amber-800 ring-amber-200",
  RED: "bg-red-50 text-red-700 ring-red-200",
  NO_DATA: "bg-slate-100 text-slate-500 ring-slate-200",
};
const BOWLING_BAR: Record<BowlingStatus, string> = { GREEN: "bg-emerald-500", YELLOW: "bg-amber-400", RED: "bg-red-500", NO_DATA: "bg-slate-300" };

export function StatusDot({ status, className }: { status: BowlingStatus; className?: string }) {
  const t = useT();
  return <span title={t(`strategyModule.color.${status}`)} className={cn("inline-block h-3 w-3 shrink-0 rounded-full", BOWLING_BAR[status], className)} />;
}

/** Gerçekleşme % çubuğu (0..150, 100 çizgisi işaretli) */
export function AchievementBar({ value, status }: { value: number | null; status: BowlingStatus }) {
  if (value === null) return <span className="text-xs text-slate-400">–</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative h-2 w-16 overflow-hidden rounded-full bg-slate-100">
        <span className={cn("absolute inset-y-0 left-0 rounded-full", BOWLING_BAR[status])} style={{ width: `${Math.min(100, (value / 150) * 100)}%` }} />
        <span className="absolute inset-y-0 border-l border-slate-500/60" style={{ left: `${(100 / 150) * 100}%` }} />
      </span>
      <span className="w-12 text-xs font-medium tabular-nums text-slate-700">%{value.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}</span>
    </span>
  );
}

const STATUS_TONE: Record<HoshinStatus, BadgeTone> = {
  DRAFT: "gray", PROPOSED: "blue", IN_CATCHBALL: "amber", AGREED: "indigo", ACTIVE: "green", COMPLETED: "green", CANCELLED: "muted",
};
export function GoalStatusBadge({ status }: { status: HoshinStatus }) {
  const t = useT();
  return <Badge tone={STATUS_TONE[status]}>{t(`strategyModule.status.${status}`)}</Badge>;
}

const LEVEL_TONE: Record<HoshinLevel, BadgeTone> = { BREAKTHROUGH: "indigo", ANNUAL: "blue", PRIORITY: "amber", DEPARTMENT: "gray", INDIVIDUAL: "gray" };
export function LevelBadge({ level }: { level: HoshinLevel }) {
  const t = useT();
  return <Badge tone={LEVEL_TONE[level]}>{t(`strategyModule.level.${level}`)}</Badge>;
}

export function GoalLink({ id, code, title }: { id: string; code: string; title?: string }) {
  return (
    <Link href={`/hoshin/goals/${id}`} className="font-medium text-brand-700 hover:underline">
      <span className="font-mono">{code}</span>
      {title && <span className="ml-1.5 font-normal text-slate-800">{title}</span>}
    </Link>
  );
}

export function fmtNum(v: number | null | undefined, unit?: string, max = 2): string {
  if (v === null || v === undefined) return "–";
  return `${v.toLocaleString("tr-TR", { maximumFractionDigits: max })}${unit ? ` ${unit}` : ""}`;
}

export function usePlans() {
  return useQuery({ queryKey: ["hoshin", "plans"], queryFn: () => api.get<StrategyPlanBrief[]>("/hoshin/plans"), staleTime: 30_000 });
}

export const MONTH_KEYS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"] as const;

/** Hoshin verisi değişince ilgili sorguları tazeler. */
export const HOSHIN_KEY = ["hoshin"] as const;
