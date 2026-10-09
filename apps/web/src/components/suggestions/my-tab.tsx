"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Award, Lightbulb, Plus, Star } from "lucide-react";
import { SUGGESTION_FLOW, type MyPointsDto, type Paginated, type SuggestionListItem, type SuggestionStatus } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { Badge, Button, Card, CardBody, EmptyState, LoadingBlock, Pagination } from "@/components/ui";
import { CategoryBadge, sKey, SuggestionStatusBadge } from "./bits";
import { SubmitSuggestionDialog } from "./submit-dialog";

function MiniFlow({ status }: { status: SuggestionStatus }) {
  const idx = SUGGESTION_FLOW.indexOf(status);
  const stopped = idx < 0;
  return (
    <div className="flex items-center gap-1" aria-hidden>
      {SUGGESTION_FLOW.map((s, i) => (
        <span
          key={s}
          className={cn(
            "h-1.5 flex-1 rounded-full",
            stopped ? (status === "ON_HOLD" && i <= 2 ? "bg-amber-400" : "bg-slate-200") : i <= idx ? "bg-brand-500" : "bg-slate-200",
            status === "REJECTED" && i === 0 && "bg-red-400",
          )}
        />
      ))}
    </div>
  );
}

export function PointsCard() {
  const { t } = useI18n();
  const { data } = useQuery({ queryKey: sKey("points", "me"), queryFn: () => api.get<MyPointsDto>("/suggestions/points/me") });
  if (!data) return null;
  const progress = data.next ? Math.min(100, Math.round(((data.total - (data.tier?.minPoints ?? 0)) / (data.next.tier.minPoints - (data.tier?.minPoints ?? 0))) * 100)) : 100;
  return (
    <Card>
      <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Star className="h-6 w-6" />
          </span>
          <div>
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{data.total}</p>
            <p className="text-sm text-slate-500">{t("suggestionsModule.points.total")}</p>
          </div>
        </div>
        <div className="flex-1 sm:px-4">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Award className="h-3.5 w-3.5" />
              {data.tier ? <Badge tone="amber">{data.tier.name}</Badge> : t("suggestionsModule.points.noTier")}
            </span>
            {data.next && <span>{t("suggestionsModule.points.toNext", { n: data.next.remaining, tier: data.next.tier.name })}</span>}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-amber-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="flex gap-4 text-center text-xs text-slate-500">
          <div><p className="text-lg font-semibold text-slate-900">{data.submitted}</p>{t("suggestionsModule.points.submitted")}</div>
          <div><p className="text-lg font-semibold text-slate-900">{data.accepted}</p>{t("suggestionsModule.points.accepted")}</div>
          <div><p className="text-lg font-semibold text-slate-900">{data.implemented}</p>{t("suggestionsModule.points.implemented")}</div>
        </div>
      </CardBody>
    </Card>
  );
}

export function MyTab() {
  const { t, locale } = useI18n();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const params = { view: "mine", page, pageSize: 10 };
  const { data, isLoading } = useQuery({
    queryKey: sKey("list", params),
    queryFn: () => api.get<Paginated<SuggestionListItem>>("/suggestions", params),
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-4">
      <button
        onClick={() => setOpen(true)}
        className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-brand-600 text-lg font-semibold text-white shadow-md transition-colors hover:bg-brand-700 sm:hidden"
      >
        <Lightbulb className="h-6 w-6" />
        {t("suggestionsModule.giveSuggestion")}
      </button>
      <PointsCard />
      <Card>
        <div className="hidden items-center justify-between border-b border-slate-100 px-4 py-3 sm:flex">
          <h3 className="text-sm font-semibold text-slate-900">{t("suggestionsModule.myList")}</h3>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("suggestionsModule.giveSuggestion")}
          </Button>
        </div>
        {isLoading || !data ? (
          <LoadingBlock />
        ) : data.items.length === 0 ? (
          <EmptyState icon={<Lightbulb className="h-6 w-6" />} title={t("suggestionsModule.emptyMine")} description={t("suggestionsModule.emptyMineDesc")} />
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {data.items.map((s) => (
                <li key={s.id}>
                  <Link href={`/suggestions/${s.id}`} className="block space-y-2 px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{s.title}</p>
                        <p className="text-xs text-slate-500">
                          <span className="font-mono">{s.code}</span> · {formatDate(s.submittedAt, locale)}
                          {s.coSubmitterCount > 0 && ` · +${s.coSubmitterCount}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <SuggestionStatusBadge status={s.status} />
                        {s.isSuggestionOfMonth && <Badge tone="amber">{t("suggestionsModule.ofMonth")}</Badge>}
                      </div>
                    </div>
                    <MiniFlow status={s.status} />
                    <div className="flex items-center gap-2">
                      <CategoryBadge category={s.category} />
                      {(s.finalScore ?? s.preScore) !== null && <span className="text-xs text-slate-500">{t("suggestionsModule.score")}: {s.finalScore ?? s.preScore}</span>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
          </>
        )}
      </Card>
      <SubmitSuggestionDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
