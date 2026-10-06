"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import type { ReviewResponse, StrategyPlanBrief } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { Button, Card, EmptyState, LoadingBlock, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { AchievementBar, BOWLING_SOFT, fmtNum, GoalLink, HOSHIN_KEY, LevelBadge } from "./strategy-bits";

export function useReview(planId: string | null | undefined, year: number | null) {
  return useQuery({
    queryKey: [...HOSHIN_KEY, "review", planId, year],
    enabled: !!planId && !!year,
    queryFn: () => api.get<ReviewResponse>(`/hoshin/plans/${planId}/review`, { year: year! }),
  });
}

export function ReviewSummary({ data }: { data: ReviewResponse }) {
  const { t } = useI18n();
  const s = data.summary;
  const items = [
    { label: t("strategyModule.review.goals"), value: s.goals, cls: "text-slate-900" },
    { label: t("strategyModule.review.avgAchievement"), value: s.averageAchievement === null ? "–" : `%${s.averageAchievement}`, cls: "text-slate-900" },
    { label: t("strategyModule.color.GREEN"), value: s.green, cls: "text-emerald-600" },
    { label: t("strategyModule.color.YELLOW"), value: s.yellow, cls: "text-amber-600" },
    { label: t("strategyModule.color.RED"), value: s.red, cls: "text-red-600" },
    { label: t("strategyModule.review.openActions"), value: s.openActions, cls: "text-slate-900" },
    { label: t("strategyModule.review.overdueActions"), value: s.overdueActions, cls: s.overdueActions ? "text-red-600" : "text-slate-900" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {items.map((i) => (
        <div key={i.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-xs text-slate-500">{i.label}</p>
          <p className={`text-xl font-semibold tabular-nums ${i.cls}`}>{i.value}</p>
        </div>
      ))}
    </div>
  );
}

export function ReviewTable({ data, print }: { data: ReviewResponse; print?: boolean }) {
  const { t, locale } = useI18n();
  return (
    <Table className={print ? "text-xs" : undefined}>
      <THead>
        <TR>
          <TH>{t("strategyModule.bowling.goal")}</TH>
          <TH>{t("strategyModule.field.level")}</TH>
          <TH>{t("strategyModule.field.owner")}</TH>
          <TH className="text-right">{t("strategyModule.field.target")}</TH>
          <TH className="text-right">{t("strategyModule.review.ytdPlan")}</TH>
          <TH className="text-right">{t("strategyModule.review.ytdActual")}</TH>
          <TH>{t("strategyModule.bowling.achievement")}</TH>
          <TH>{t("common.status")}</TH>
          <TH className="text-right">{t("strategyModule.review.openActions")}</TH>
          <TH>{t("strategyModule.review.agreedAt")}</TH>
        </TR>
      </THead>
      <TBody>
        {data.rows.map((r) => (
          <TR key={r.goal.id}>
            <TD>
              {print ? (
                <span><span className="font-mono">{r.goal.code}</span> {r.goal.title}</span>
              ) : (
                <GoalLink id={r.goal.id} code={r.goal.code} title={r.goal.title} />
              )}
              {r.kpi && <span className="ml-1 font-mono text-[11px] text-slate-400">{r.kpi.code}</span>}
            </TD>
            <TD><LevelBadge level={r.goal.level} /></TD>
            <TD>{r.goal.owner?.fullName ?? "–"}</TD>
            <TD className="text-right tabular-nums">{fmtNum(r.targetValue, r.goal.unit)}</TD>
            <TD className="text-right tabular-nums">{fmtNum(r.ytdPlan)}</TD>
            <TD className="text-right tabular-nums">{fmtNum(r.ytdActual)}</TD>
            <TD><AchievementBar value={r.achievement} status={r.status} /></TD>
            <TD>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BOWLING_SOFT[r.status]}`}>{t(`strategyModule.color.${r.status}`)}</span>
            </TD>
            <TD className="text-right tabular-nums">
              {r.openActions}
              {r.overdueActions > 0 && <span className="ml-1 text-red-600">({r.overdueActions})</span>}
            </TD>
            <TD>{formatDate(r.agreedAt, locale)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export function ReviewTab({ plan, year }: { plan: StrategyPlanBrief; year: number }) {
  const { t } = useI18n();
  const { data, isLoading } = useReview(plan.id, year);
  if (isLoading || !data) return <LoadingBlock />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href={`/hoshin/review/print?planId=${plan.id}&year=${year}`} target="_blank">
          <Button variant="outline" size="sm">
            <Printer className="h-4 w-4" />
            {t("strategyModule.review.printView")}
          </Button>
        </Link>
      </div>
      <ReviewSummary data={data} />
      <Card>{data.rows.length === 0 ? <EmptyState title={t("strategyModule.review.empty")} /> : <ReviewTable data={data} />}</Card>
    </div>
  );
}
