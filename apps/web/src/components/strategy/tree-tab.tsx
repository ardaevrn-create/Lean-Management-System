"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, Pencil, Plus, Target } from "lucide-react";
import type { DrilldownResponse, HoshinTreeNode, HoshinTreeResponse, StrategyPlanBrief } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, LoadingBlock, useToast } from "@/components/ui";
import { GoalDialog, type ParentRef } from "./goal-dialog";
import { AchievementBar, fmtNum, GoalLink, GoalStatusBadge, HOSHIN_KEY, LevelBadge, StatusDot } from "./strategy-bits";

const INDENT = 20;

function collect(nodes: HoshinTreeNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.children.length) out.push(n.id);
    collect(n.children, out);
  }
  return out;
}

export function TreeTab({ plan, year }: { plan: StrategyPlanBrief; year: number }) {
  const { t } = useI18n();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: [...HOSHIN_KEY, "tree", plan.id, year],
    queryFn: () => api.get<HoshinTreeResponse>(`/hoshin/plans/${plan.id}/tree`, { year }),
  });
  const drill = useQuery({
    queryKey: [...HOSHIN_KEY, "drilldown", plan.id, year],
    queryFn: () => api.get<DrilldownResponse>(`/hoshin/plans/${plan.id}/drilldown`, { year }),
  });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ parent?: ParentRef | null; goal?: HoshinTreeNode } | null>(null);
  const parents = useMemo(() => collect(data?.nodes ?? []), [data]);

  const toggle = (id: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (isLoading || !data) return <LoadingBlock />;

  const render = (n: HoshinTreeNode, depth: number): React.ReactNode => {
    const open = !collapsed.has(n.id);
    return (
      <div key={n.id}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 py-2 pr-3 hover:bg-slate-50/70" style={{ paddingLeft: 8 + depth * INDENT }}>
          <button
            type="button"
            onClick={() => toggle(n.id)}
            className={cn("rounded p-0.5 text-slate-400 hover:text-slate-700", n.children.length === 0 && "invisible")}
            aria-label="toggle"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <StatusDot status={n.progress.status} />
          <LevelBadge level={n.level} />
          <span className="min-w-0 flex-1 basis-48 text-sm">
            <GoalLink id={n.id} code={n.code} title={n.title} />
          </span>
          <span className="hidden w-40 shrink-0 text-xs text-slate-500 lg:block">
            {n.owner?.fullName ?? "–"}
            {n.orgUnit && <span className="block text-slate-400">{n.orgUnit.name}</span>}
          </span>
          <span className="hidden w-32 shrink-0 text-xs text-slate-500 xl:block">
            {n.kpi ? (
              <span className="font-mono text-slate-600">{n.kpi.code}</span>
            ) : (
              n.progress.source === "MANUAL" && <Badge tone="gray">{t("strategyModule.tree.manual")}</Badge>
            )}
          </span>
          <span className="hidden w-28 shrink-0 text-right text-xs tabular-nums text-slate-600 md:block">{fmtNum(n.targetValue, n.unit)}</span>
          <span className="w-36 shrink-0">
            <AchievementBar value={n.progress.achievement} status={n.progress.status} />
          </span>
          <span className="w-24 shrink-0"><GoalStatusBadge status={n.status} /></span>
          <span className="flex w-16 shrink-0 justify-end gap-1">
            {n.can.addChild && n.level !== "INDIVIDUAL" && (
              <Button variant="ghost" size="sm" title={t("strategyModule.goal.addChild", { code: n.code })} onClick={() => setDialog({ parent: { id: n.id, code: n.code, title: n.title, level: n.level, year: n.year } })}>
                <Plus className="h-4 w-4" />
              </Button>
            )}
            {n.can.edit && (
              <Button variant="ghost" size="sm" title={t("common.edit")} onClick={() => setDialog({ goal: n })}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </span>
        </div>
        {open && n.children.map((c) => render(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCollapsed(new Set())}>{t("strategyModule.tree.expandAll")}</Button>
          <Button variant="outline" size="sm" onClick={() => setCollapsed(new Set(parents))}>{t("strategyModule.tree.collapseAll")}</Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => api.download(`/hoshin/plans/${plan.id}/tree/export`, `hoshin-hedef-agaci-${year}.xlsx`, { year }).catch(toast.error)}>
            <Download className="h-4 w-4" />
            {t("common.exportExcel")}
          </Button>
          {data.can.manage && (
            <Button size="sm" onClick={() => setDialog({ parent: null })}>
              <Plus className="h-4 w-4" />
              {t("strategyModule.goal.add")}
            </Button>
          )}
        </div>
      </div>
      {!!drill.data?.orgUnits.length && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">{t("strategyModule.tree.unitSummary")}</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {drill.data.orgUnits.map((u) => (
              <div key={u.orgUnit.id} className="min-w-[170px] shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="truncate text-sm font-medium text-slate-800">{u.orgUnit.name}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                  <span>{u.achievement === null ? "–" : `%${u.achievement}`}</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-0.5"><StatusDot status="GREEN" className="h-2 w-2" />{u.green}</span>
                    <span className="inline-flex items-center gap-0.5"><StatusDot status="YELLOW" className="h-2 w-2" />{u.yellow}</span>
                    <span className="inline-flex items-center gap-0.5"><StatusDot status="RED" className="h-2 w-2" />{u.red}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <Card>
        {data.nodes.length === 0 ? (
          <EmptyState icon={<Target className="h-6 w-6" />} title={t("strategyModule.tree.empty")} description={t("strategyModule.tree.emptyDesc")} />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">{data.nodes.map((n) => render(n, 0))}</div>
          </div>
        )}
      </Card>
      {dialog && <GoalDialog plan={plan} year={year} parent={dialog.parent} goal={dialog.goal} onClose={() => setDialog(null)} />}
    </div>
  );
}
