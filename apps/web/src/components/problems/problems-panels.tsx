"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Puzzle } from "lucide-react";
import type { Paginated, ProblemListItem, ProblemPhase, ProblemsDashboardWidget, ProblemStats } from "@lean/shared";
import { api, type QueryParams } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n, useT } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, LoadingBlock } from "@/components/ui";
import { FLOW_PHASES, SeverityBadge } from "./problem-bits";

/** Kanban: aşamalara göre sütunlar. */
export function ProblemPipeline({ filters }: { filters: QueryParams }) {
  const t = useT();
  const { locale } = useI18n();
  const params: QueryParams = { ...filters, page: 1, pageSize: 200, sort: "createdAt:desc" };
  const { data, isLoading } = useQuery({
    queryKey: ["problems", "list", "pipeline", params],
    queryFn: () => api.get<Paginated<ProblemListItem>>("/problems", params),
  });
  if (isLoading || !data) return <LoadingBlock />;
  const by = (p: ProblemPhase) => data.items.filter((i) => i.phase === p);
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
      {FLOW_PHASES.map((phase) => {
        const items = by(phase);
        return (
          <div key={phase} className="w-72 shrink-0 snap-start rounded-xl bg-slate-100 p-2">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-sm font-semibold text-slate-700">{t(`problemsModule.phase.${phase}`)}</span>
              <Badge tone="gray">{items.length}</Badge>
            </div>
            <div className="space-y-2">
              {items.map((p) => (
                <Link key={p.id} href={`/problems/${p.id}`} className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:border-brand-300">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-500">{p.code}</span>
                    <SeverityBadge severity={p.severity} />
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-900">{p.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {p.owner.fullName} · {p.orgUnit.name}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {p.overdue && (
                      <Badge tone="red">
                        <AlertTriangle className="h-3 w-3" />
                        {t("problemsModule.overdueDays", { n: p.overdueDays })}
                      </Badge>
                    )}
                    {p.openActionCount > 0 && <Badge tone="amber">{t("problemsModule.openActions")}: {p.openActionCount}</Badge>}
                    {p.targetCloseDate && <span className="text-xs text-slate-400">{formatDate(p.targetCloseDate, locale)}</span>}
                  </div>
                </Link>
              ))}
              {items.length === 0 && <p className="px-2 py-4 text-center text-xs text-slate-400">—</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

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

function BarList({ rows, max }: { rows: { label: string; count: number }[]; max: number }) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3 text-sm">
          <span className="w-36 shrink-0 truncate text-slate-600">{r.label}</span>
          <div className="h-2.5 flex-1 rounded-full bg-slate-100">
            <div className="h-2.5 rounded-full bg-brand-600" style={{ width: `${max ? (r.count / max) * 100 : 0}%` }} />
          </div>
          <span className="w-8 text-right tabular-nums text-slate-700">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

export function ProblemsStatsPanel({ view }: { view: "mine" | "all" }) {
  const t = useT();
  const { data, isLoading } = useQuery({ queryKey: ["problems", "stats", view], queryFn: () => api.get<ProblemStats>("/problems/stats", { view }) });
  if (isLoading || !data) return <LoadingBlock />;
  const pareto = data.pareto.map((p) => ({ name: t(`problemsModule.category.${p.category}`), count: p.count, cum: p.cumulativePercent }));
  const maxPhase = Math.max(1, ...data.byPhase.map((b) => b.count));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label={t("problemsModule.stats.total")} value={data.total} />
        <Stat label={t("problemsModule.stats.open")} value={data.open} />
        <Stat label={t("problemsModule.stats.overdue")} value={data.overdue} tone={data.overdue > 0 ? "text-red-600" : undefined} />
        <Stat label={t("problemsModule.stats.awaiting")} value={data.awaitingVerification} />
        <Stat label={t("problemsModule.stats.avgClose")} value={data.avgDaysToClose ?? "—"} />
      </div>
      <Card>
        <CardHeader title={t("problemsModule.stats.pareto")} />
        <CardBody>
          <p className="mb-3 text-xs text-slate-500">{t("problemsModule.stats.paretoHint")}</p>
          {pareto.length === 0 ? (
            <EmptyState title={t("problemsModule.stats.paretoEmpty")} className="py-8" />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={pareto} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="l" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="r" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="l" dataKey="count" name={t("problemsModule.stats.count")} fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="r" dataKey="cum" name={t("problemsModule.stats.cumulative")} stroke="#ea580c" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title={t("problemsModule.stats.byPhase")} />
          <CardBody>
            <BarList rows={data.byPhase.map((b) => ({ label: t(`problemsModule.phase.${b.phase}`), count: b.count }))} max={maxPhase} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("problemsModule.stats.bySeverity")} />
          <CardBody>
            <BarList rows={data.bySeverity.map((b) => ({ label: t(`problemsModule.severity.${b.severity}`), count: b.count }))} max={Math.max(1, ...data.bySeverity.map((b) => b.count))} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("problemsModule.stats.bySource")} />
          <CardBody>
            {data.bySource.length === 0 ? (
              <p className="text-sm text-slate-500">—</p>
            ) : (
              <BarList rows={data.bySource.map((b) => ({ label: t(`problemsModule.source.${b.source}`), count: b.count }))} max={Math.max(1, ...data.bySource.map((b) => b.count))} />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/** Ana sayfa kartı: dashboard widgets.problems. */
export function ProblemsDashboardCard({ widget }: { widget: unknown }) {
  const t = useT();
  const { hasPermission } = useAuth();
  const w = widget as ProblemsDashboardWidget | undefined;
  if (!w) return null;
  const cell = (label: string, value: number, tone?: string) => (
    <div>
      <p className={cn("text-2xl font-semibold tabular-nums", tone ?? "text-slate-900")}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Puzzle className="h-4 w-4 text-brand-600" />
            {t("problemsModule.dash.title")}
          </span>
        }
        actions={
          <Link href="/problems" className="text-xs font-medium text-brand-600 hover:text-brand-700">
            {t("common.viewAll")}
          </Link>
        }
      />
      <CardBody className="flex flex-wrap items-center gap-6">
        {cell(t("problemsModule.dash.myOpen"), w.myOpen)}
        {cell(t("problemsModule.dash.overdue"), w.overdue, w.overdue > 0 ? "text-red-600" : undefined)}
        {cell(t("problemsModule.dash.awaiting"), w.awaitingVerification, w.awaitingVerification > 0 ? "text-amber-600" : undefined)}
        {hasPermission("problem.create") && (
          <Link href="/problems?new=1" className="ml-auto">
            <Button variant="outline" size="sm">
              {t("problemsModule.dash.report")}
            </Button>
          </Link>
        )}
      </CardBody>
    </Card>
  );
}
