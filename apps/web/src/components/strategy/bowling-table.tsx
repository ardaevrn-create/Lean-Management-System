"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, X } from "lucide-react";
import { monthPeriod, type BowlingRow } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button, useToast } from "@/components/ui";
import { OffTargetDialog } from "./offtarget-dialog";
import { AchievementBar, BOWLING_BG, fmtNum, HOSHIN_KEY, LevelBadge, MONTH_KEYS, StatusDot } from "./strategy-bits";

type Draft = Record<number, { plan: string; actual: string }>;

/** Bowling chart tablosu: her hedef için 12 ay plan/gerçekleşme, YTD ve başarım. Tek satırda da (hedef detayı) kullanılır. */
export function BowlingTable({ rows, year, compact }: { rows: BowlingRow[]; year: number; compact?: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [panel, setPanel] = useState<{ row: BowlingRow; period: string } | null>(null);

  const save = useMutation({
    mutationFn: (row: BowlingRow) =>
      api.put(`/hoshin/goals/${row.goal.id}/monthly`, {
        year,
        months: Object.entries(draft).map(([m, v]) => ({
          month: Number(m),
          ...(row.canEditPlan ? { plan: v.plan.trim() === "" ? null : Number(v.plan) } : {}),
          actual: v.actual.trim() === "" ? null : Number(v.actual),
        })),
      }),
    onSuccess: () => {
      toast.success(t("common.saved"));
      setEditing(null);
      qc.invalidateQueries({ queryKey: HOSHIN_KEY });
    },
    onError: toast.error,
  });

  const startEdit = (row: BowlingRow) => {
    setEditing(row.goal.id);
    setDraft(Object.fromEntries(row.cells.map((c) => [c.month, { plan: c.plan?.toString() ?? "", actual: c.actual?.toString() ?? "" }])));
  };

  const input = "h-6 w-14 rounded border border-slate-300 bg-white px-1 text-center text-xs tabular-nums text-slate-900 focus:border-brand-500 focus:outline-none";

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="sticky left-0 z-10 min-w-[220px] bg-slate-50 px-3 py-2 text-left font-medium">{t("strategyModule.bowling.goal")}</th>
              <th className="px-2 py-2 text-right font-medium">{t("strategyModule.field.target")}</th>
              {MONTH_KEYS.map((m) => (
                <th key={m} className="min-w-[62px] px-1 py-2 text-center font-medium">{t(`strategyModule.months.${m}`)}</th>
              ))}
              <th className="min-w-[78px] px-2 py-2 text-center font-medium">{t("strategyModule.bowling.ytd")}</th>
              <th className="px-2 py-2 text-left font-medium">{t("strategyModule.bowling.achievement")}</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isEditing = editing === row.goal.id;
              return (
                <tr key={row.goal.id} className={cn("border-b border-slate-100", !row.measured && "opacity-70")}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 align-middle">
                    <div className="flex items-center gap-2">
                      <StatusDot status={row.status} />
                      <div className="min-w-0">
                        <Link href={`/hoshin/goals/${row.goal.id}`} className="block truncate text-sm font-medium text-brand-700 hover:underline">
                          <span className="mr-1 font-mono">{row.goal.code}</span>
                          {row.goal.title}
                        </Link>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                          {!compact && <LevelBadge level={row.goal.level} />}
                          <span className="truncate">{row.goal.owner?.fullName ?? "–"}{row.goal.orgUnit ? ` · ${row.goal.orgUnit.name}` : ""}</span>
                          {row.kpi ? <span className="font-mono text-slate-400">{row.kpi.code}</span> : null}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-700">{fmtNum(row.targetValue, row.goal.unit)}</td>
                  {row.cells.map((c) => {
                    const clickable = c.actual !== null && (c.status === "RED" || c.status === "YELLOW");
                    const period = c.period && /^\d{4}-\d{2}$/.test(c.period) ? c.period : monthPeriod(year, c.month);
                    return (
                      <td key={c.month} className="p-0.5 text-center align-middle">
                        {isEditing ? (
                          <div className="flex flex-col items-center gap-0.5">
                            {row.canEditPlan ? (
                              <input aria-label="plan" className={input} type="number" step="any" value={draft[c.month]?.plan ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [c.month]: { ...d[c.month], plan: e.target.value } }))} placeholder={t("strategyModule.bowling.plan")} />
                            ) : (
                              <span className="text-[11px] text-slate-500">{fmtNum(c.plan)}</span>
                            )}
                            <input aria-label="actual" className={input} type="number" step="any" value={draft[c.month]?.actual ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [c.month]: { ...d[c.month], actual: e.target.value } }))} placeholder={t("strategyModule.bowling.actual")} />
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={!clickable}
                            onClick={() => setPanel({ row, period })}
                            title={c.comment ?? undefined}
                            className={cn(
                              "flex h-11 w-full min-w-[56px] flex-col items-center justify-center rounded-md leading-tight",
                              BOWLING_BG[c.status],
                              clickable && "cursor-pointer ring-offset-1 hover:ring-2 hover:ring-slate-700/40",
                              !clickable && "cursor-default",
                            )}
                          >
                            <span className="text-[10px] opacity-80 tabular-nums">{c.plan === null ? "–" : fmtNum(c.plan, undefined, 1)}</span>
                            <span className="text-xs font-semibold tabular-nums">{c.actual === null ? "–" : fmtNum(c.actual, undefined, 1)}</span>
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-0.5 text-center align-middle">
                    <div className={cn("flex h-11 flex-col items-center justify-center rounded-md leading-tight", BOWLING_BG[row.ytd.status])}>
                      <span className="text-[10px] opacity-80 tabular-nums">{row.ytd.plan === null ? "–" : fmtNum(row.ytd.plan, undefined, 1)}</span>
                      <span className="text-xs font-semibold tabular-nums">{row.ytd.actual === null ? "–" : fmtNum(row.ytd.actual, undefined, 1)}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2"><AchievementBar value={row.achievement} status={row.status} /></td>
                  <td className="px-1 text-right">
                    {isEditing ? (
                      <span className="flex gap-1">
                        <Button size="sm" variant="primary" loading={save.isPending} onClick={() => save.mutate(row)} title={t("common.save")}><Check className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)} title={t("common.cancel")}><X className="h-4 w-4" /></Button>
                      </span>
                    ) : (
                      row.canEditActuals && (
                        <Button size="sm" variant="ghost" onClick={() => startEdit(row)} title={t("strategyModule.bowling.editActuals")}><Pencil className="h-4 w-4" /></Button>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {panel && (
        <OffTargetDialog goalId={panel.row.goal.id} period={panel.period} unit={panel.row.goal.unit} goalLabel={`${panel.row.goal.code} ${panel.row.goal.title}`} onClose={() => setPanel(null)} />
      )}
    </>
  );
}
