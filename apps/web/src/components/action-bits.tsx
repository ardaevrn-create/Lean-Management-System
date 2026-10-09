"use client";

import type { ActionListItem } from "@lean/shared";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";

/** Termin tarihi; gecikmişse kırmızı + "X gün gecikti". */
export function DueDateCell({ action }: { action: Pick<ActionListItem, "dueDate" | "isOverdue" | "overdueDays"> }) {
  const { t, locale } = useI18n();
  return (
    <div className={cn(action.isOverdue && "text-red-600")}>
      <div className="whitespace-nowrap">{formatDate(action.dueDate, locale)}</div>
      {action.isOverdue && <div className="text-xs font-medium">{t("actions.overdueDays", { days: action.overdueDays })}</div>}
    </div>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-500">{value}%</span>
    </div>
  );
}
