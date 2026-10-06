"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Search, Star } from "lucide-react";
import { SUGGESTION_CATEGORIES, SUGGESTION_STATUSES, type Paginated, type SuggestionCategory, type SuggestionListItem, type SuggestionStatus } from "@lean/shared";
import { api, type QueryParams } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import {
  Badge, Button, Card, EmptyState, Input, LoadingBlock, OrgUnitSelect, Pagination, Select, Table, TBody, TD, TH, THead, TR,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { CategoryBadge, money, sKey, SuggestionStatusBadge } from "./bits";

/** Tüm öneriler (suggestion.manage): filtre, dışa aktarma, ayın önerisi. */
export function AllTab() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<SuggestionStatus | "">("");
  const [category, setCategory] = useState<SuggestionCategory | "">("");
  const [orgUnitId, setOrgUnitId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const dq = useDebounce(q);
  const filters: QueryParams = { view: "all", status: status || undefined, category: category || undefined, orgUnitId, q: dq || undefined };
  const params = { ...filters, page, pageSize: 20 };
  const { data, isLoading } = useQuery({
    queryKey: sKey("list", params),
    queryFn: () => api.get<Paginated<SuggestionListItem>>("/suggestions", params),
    placeholderData: (prev) => prev,
  });

  const month = useMutation({
    mutationFn: (s: SuggestionListItem) => api.post(`/suggestions/${s.id}/suggestion-of-month`, { value: !s.isSuggestionOfMonth }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suggestions"] }),
    onError: toast.error,
  });

  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input className="pl-9" placeholder={t("common.search")} value={q} onChange={(e) => reset(setQ)(e.target.value)} />
        </div>
        <Select className="lg:w-44" value={status} onChange={(e) => reset(setStatus)(e.target.value as SuggestionStatus | "")}>
          <option value="">{t("suggestionsModule.allStatuses")}</option>
          {SUGGESTION_STATUSES.map((s) => (
            <option key={s} value={s}>{t(`suggestionsModule.status.${s}`)}</option>
          ))}
        </Select>
        <Select className="lg:w-40" value={category} onChange={(e) => reset(setCategory)(e.target.value as SuggestionCategory | "")}>
          <option value="">{t("suggestionsModule.allCategories")}</option>
          {SUGGESTION_CATEGORIES.map((c) => (
            <option key={c} value={c}>{t(`suggestionsModule.category.${c}`)}</option>
          ))}
        </Select>
        <div className="lg:w-56">
          <OrgUnitSelect value={orgUnitId} onChange={reset(setOrgUnitId)} placeholder={t("suggestionsModule.allUnits")} />
        </div>
        <Button variant="outline" onClick={() => api.download("/suggestions/export", "oneriler.xlsx", filters).catch(toast.error)}>
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">{t("common.exportExcel")}</span>
        </Button>
      </div>
      {isLoading || !data ? (
        <LoadingBlock />
      ) : data.items.length === 0 ? (
        <EmptyState title={t("suggestionsModule.emptyAll")} />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>{t("common.code")}</TH>
                <TH>{t("suggestionsModule.form.title")}</TH>
                <TH>{t("suggestionsModule.owner")}</TH>
                <TH>{t("suggestionsModule.form.area")}</TH>
                <TH>{t("common.status")}</TH>
                <TH>{t("suggestionsModule.score")}</TH>
                <TH>{t("suggestionsModule.form.cost")}</TH>
                <TH>{t("suggestionsModule.submittedAt")}</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {data.items.map((s) => (
                <TR key={s.id}>
                  <TD className="whitespace-nowrap font-mono text-xs">{s.code}</TD>
                  <TD className="max-w-xs">
                    <Link href={`/suggestions/${s.id}`} className="font-medium text-slate-900 hover:text-brand-700">{s.title}</Link>
                    <div className="mt-0.5 flex items-center gap-1.5"><CategoryBadge category={s.category} />{s.isSuggestionOfMonth && <Badge tone="amber">{t("suggestionsModule.ofMonth")}</Badge>}</div>
                  </TD>
                  <TD className="whitespace-nowrap">{s.submittedBy.fullName}</TD>
                  <TD>{s.orgUnit?.name ?? "—"}</TD>
                  <TD><SuggestionStatusBadge status={s.status} /></TD>
                  <TD className="tabular-nums">{s.finalScore ?? s.preScore ?? "—"}</TD>
                  <TD className="whitespace-nowrap tabular-nums">{money(s.estimatedCost, locale)}</TD>
                  <TD className="whitespace-nowrap">{formatDate(s.submittedAt, locale)}</TD>
                  <TD>
                    {!["REJECTED", "WITHDRAWN"].includes(s.status) && (
                      <button
                        title={t("suggestionsModule.ofMonth")}
                        className={s.isSuggestionOfMonth ? "text-amber-500" : "text-slate-300 hover:text-amber-500"}
                        onClick={() => month.mutate(s)}
                      >
                        <Star className="h-4 w-4" fill={s.isSuggestionOfMonth ? "currentColor" : "none"} />
                      </button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
        </>
      )}
    </Card>
  );
}
