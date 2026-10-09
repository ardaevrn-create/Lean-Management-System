"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, KanbanSquare, List, Plus, Search } from "lucide-react";
import { ACTION_SOURCE_TYPES, ACTION_STATUSES, PERMISSIONS, type ActionListItem, type ActionStatus, type Paginated } from "@lean/shared";
import { api, type QueryParams } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import {
  Button, Card, Checkbox, EmptyState, Input, LoadingBlock, PageHeader, Pagination, PriorityBadge, Select, StatusBadge, Table, TBody, TD, TH, THead, Tabs, TR,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { DueDateCell, ProgressBar } from "@/components/action-bits";
import { NewActionDialog } from "@/components/actions/new-action-dialog";

type View = "mine" | "team" | "created" | "all";
const KANBAN_COLUMNS: ActionStatus[] = ["OPEN", "IN_PROGRESS", "DONE", "VERIFIED"];
const PAGE_SIZE = 20;

export default function ActionsPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [view, setView] = useState<View>("mine");
  const [mode, setMode] = useState<"list" | "kanban">("list");
  const [statuses, setStatuses] = useState<ActionStatus[]>([]);
  const [overdue, setOverdue] = useState(false);
  const [sourceType, setSourceType] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const dq = useDebounce(q);

  const tabs = useMemo(() => {
    const base: { value: View; label: string }[] = [
      { value: "mine", label: t("actions.viewMine") },
      { value: "team", label: t("actions.viewTeam") },
      { value: "created", label: t("actions.viewCreated") },
    ];
    if (hasPermission(PERMISSIONS.ACTION_VIEW_ALL)) base.push({ value: "all", label: t("actions.viewAll") });
    return base;
  }, [t, hasPermission]);

  const kanban = mode === "kanban";
  const filters: QueryParams = {
    view,
    status: statuses.length ? statuses : kanban ? KANBAN_COLUMNS : undefined,
    overdue: overdue || undefined,
    sourceType: sourceType || undefined,
    q: dq || undefined,
  };
  const params: QueryParams = { ...filters, page: kanban ? 1 : page, pageSize: kanban ? 200 : PAGE_SIZE };
  const { data, isLoading } = useQuery({
    queryKey: ["actions", "list", params],
    queryFn: () => api.get<Paginated<ActionListItem>>("/actions", params),
    placeholderData: (prev) => prev,
  });

  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };
  const toggleStatus = (s: ActionStatus) => {
    setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
    setPage(1);
  };

  async function exportXlsx() {
    try {
      await api.download("/actions/export", "actions.xlsx", filters);
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <>
      <PageHeader
        title={t("actions.title_plural")}
        actions={
          <>
            <Button variant="outline" onClick={exportXlsx}>
              <Download className="h-4 w-4" />
              {t("common.exportExcel")}
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              {t("actions.new")}
            </Button>
          </>
        }
      />
      <Card>
        <Tabs tabs={tabs} value={view} onChange={resetPage(setView)} className="px-2" />
        <div className="space-y-3 border-b border-slate-100 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input className="pl-9" placeholder={t("common.search")} value={q} onChange={(e) => resetPage(setQ)(e.target.value)} />
            </div>
            <Select className="md:w-56" value={sourceType} onChange={(e) => resetPage(setSourceType)(e.target.value)}>
              <option value="">{t("actions.allSources")}</option>
              {ACTION_SOURCE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {t(`actionSource.${s}`)}
                </option>
              ))}
            </Select>
            <Checkbox label={t("actions.onlyOverdue")} checked={overdue} onChange={(e) => resetPage(setOverdue)(e.target.checked)} />
            <div className="flex overflow-hidden rounded-lg border border-slate-300">
              {(["list", "kanban"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 text-sm", mode === m ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}
                >
                  {m === "list" ? <List className="h-4 w-4" /> : <KanbanSquare className="h-4 w-4" />}
                  <span className="hidden sm:inline">{t(m === "list" ? "actions.list" : "actions.kanban")}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ACTION_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  statuses.includes(s) ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50",
                )}
              >
                {t(`actionStatus.${s}`)}
              </button>
            ))}
          </div>
        </div>

        {isLoading || !data ? (
          <LoadingBlock />
        ) : data.items.length === 0 ? (
          <EmptyState title={t("actions.empty")} />
        ) : kanban ? (
          <div className="grid gap-4 overflow-x-auto p-4 md:grid-cols-2 xl:grid-cols-4">
            {KANBAN_COLUMNS.map((col) => {
              const items = data.items.filter((a) => a.status === col);
              return (
                <div key={col} className="min-w-[16rem] rounded-xl bg-slate-50 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <StatusBadge status={col} />
                    <span className="text-xs text-slate-500">{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((a) => (
                      <Link
                        key={a.id}
                        href={`/actions/${a.id}`}
                        className={cn(
                          "block rounded-lg border bg-white p-3 shadow-sm transition-shadow hover:shadow-md",
                          a.isOverdue ? "border-red-300" : "border-slate-200",
                        )}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-slate-500">{a.code}</span>
                          <PriorityBadge priority={a.priority} />
                        </div>
                        <p className="mb-2 line-clamp-2 text-sm font-medium text-slate-900">{a.title}</p>
                        <div className="flex items-end justify-between gap-2 text-xs text-slate-500">
                          <span className="truncate">{a.owner.fullName}</span>
                          <DueDateCell action={a} />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>{t("actions.code")}</TH>
                  <TH>{t("actions.title")}</TH>
                  <TH>{t("actions.owner")}</TH>
                  <TH>{t("actions.status")}</TH>
                  <TH>{t("actions.priority")}</TH>
                  <TH>{t("actions.dueDate")}</TH>
                  <TH>{t("actions.progress")}</TH>
                </tr>
              </THead>
              <TBody>
                {data.items.map((a) => (
                  <TR key={a.id} className={a.isOverdue ? "bg-red-50/60 hover:bg-red-50" : undefined}>
                    <TD className="whitespace-nowrap font-mono text-xs">{a.code}</TD>
                    <TD className="max-w-xs">
                      <Link href={`/actions/${a.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {a.title}
                      </Link>
                      {a.sourceLabel && <div className="truncate text-xs text-slate-500">{a.sourceLabel}</div>}
                    </TD>
                    <TD className="whitespace-nowrap">{a.owner.fullName}</TD>
                    <TD>
                      <StatusBadge status={a.status} />
                    </TD>
                    <TD>
                      <PriorityBadge priority={a.priority} />
                    </TD>
                    <TD>
                      <DueDateCell action={a} />
                    </TD>
                    <TD>
                      <ProgressBar value={a.progress} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
          </>
        )}
      </Card>
      <NewActionDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
