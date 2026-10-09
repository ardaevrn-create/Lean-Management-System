"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Download, Plus, Search } from "lucide-react";
import { KAIZEN_TYPES, PERMISSIONS, type KaizenListItem, type KaizenType, type Paginated } from "@lean/shared";
import { api, type QueryParams } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { Badge, Button, Card, EmptyState, Input, LoadingBlock, Pagination, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { KaizenStatusBadge, money, sKey } from "./bits";
import { KaizenFormDialog } from "./kaizen-form-dialog";

type View = "mine" | "approval" | "all";

export function KaizenTab() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.SUGGESTION_MANAGE);
  const [view, setView] = useState<View>("mine");
  const [type, setType] = useState<KaizenType | "">("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const dq = useDebounce(q);
  const filters: QueryParams = { view, type: type || undefined, q: dq || undefined };
  const params = { ...filters, page, pageSize: 20 };
  const { data, isLoading } = useQuery({
    queryKey: sKey("kaizen", "list", params),
    queryFn: () => api.get<Paginated<KaizenListItem>>("/suggestions/kaizen", params),
    placeholderData: (prev) => prev,
  });
  const views: View[] = canManage ? ["mine", "approval", "all"] : ["mine", "approval"];

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center">
        <div className="flex overflow-hidden rounded-lg border border-slate-300">
          {views.map((v) => (
            <button
              key={v}
              onClick={() => {
                setView(v);
                setPage(1);
              }}
              className={cn("flex-1 px-4 py-1.5 text-sm", view === v ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}
            >
              {t(`suggestionsModule.kaizen.view.${v}`)}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input className="pl-9" placeholder={t("common.search")} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <Select className="md:w-48" value={type} onChange={(e) => { setType(e.target.value as KaizenType | ""); setPage(1); }}>
          <option value="">{t("suggestionsModule.kaizen.allTypes")}</option>
          {KAIZEN_TYPES.map((k) => (
            <option key={k} value={k}>{t(`suggestionsModule.kaizenType.${k}`)}</option>
          ))}
        </Select>
        {canManage && (
          <Button variant="outline" onClick={() => api.download("/suggestions/kaizen/export", "kaizen.xlsx", { ...filters, view: "all" }).catch(toast.error)}>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">{t("common.exportExcel")}</span>
          </Button>
        )}
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          {t("suggestionsModule.kaizen.new")}
        </Button>
      </div>
      {isLoading || !data ? (
        <LoadingBlock />
      ) : data.items.length === 0 ? (
        <EmptyState title={t("suggestionsModule.kaizen.empty")} />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>{t("common.code")}</TH>
                <TH>{t("suggestionsModule.form.title")}</TH>
                <TH>{t("suggestionsModule.kaizen.type")}</TH>
                <TH>{t("suggestionsModule.kaizen.leader")}</TH>
                <TH>{t("suggestionsModule.form.area")}</TH>
                <TH>{t("common.status")}</TH>
                <TH>{t("suggestionsModule.kaizen.annualSaving")}</TH>
                <TH>{t("suggestionsModule.kaizen.start")}</TH>
              </tr>
            </THead>
            <TBody>
              {data.items.map((k) => (
                <TR key={k.id}>
                  <TD className="whitespace-nowrap font-mono text-xs">{k.code}</TD>
                  <TD className="max-w-xs"><Link href={`/suggestions/kaizen/${k.id}`} className="font-medium text-slate-900 hover:text-brand-700">{k.title}</Link></TD>
                  <TD><Badge tone="indigo">{t(`suggestionsModule.kaizenType.${k.type}`)}</Badge></TD>
                  <TD className="whitespace-nowrap">{k.leader.fullName}</TD>
                  <TD>{k.orgUnit?.name ?? "—"}</TD>
                  <TD><KaizenStatusBadge status={k.status} /></TD>
                  <TD className="whitespace-nowrap tabular-nums">
                    {money(k.totalAnnualSaving, locale)}
                    {k.approvedAnnualSaving > 0 && <span className="block text-xs text-emerald-600">{t("suggestionsModule.kaizen.financeOk")}: {money(k.approvedAnnualSaving, locale)}</span>}
                  </TD>
                  <TD className="whitespace-nowrap">{formatDate(k.startDate, locale)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
        </>
      )}
      <KaizenFormDialog open={creating} onClose={() => setCreating(false)} />
    </Card>
  );
}
