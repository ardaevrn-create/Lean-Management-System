"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, Plus, Search } from "lucide-react";
import {
  PERMISSIONS, PROBLEM_PHASES, PROBLEM_SEVERITIES, PROBLEM_SOURCES, type CreateProblemRequest, type Paginated, type ProblemListItem,
  type ProblemPhase, type ProblemSeverity, type ProblemSource,
} from "@lean/shared";
import { api, type QueryParams } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import {
  Badge, Button, Card, Checkbox, EmptyState, Input, LoadingBlock, PageHeader, Pagination, Select, Table, TBody, TD, TH, THead, Tabs, TR,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { PhaseBadge, SeverityBadge } from "@/components/problems/problem-bits";
import { NewProblemDialog } from "@/components/problems/new-problem-dialog";
import { ProblemPipeline, ProblemsStatsPanel } from "@/components/problems/problems-panels";

type Tab = "list" | "pipeline" | "stats";
const PAGE_SIZE = 20;

export default function ProblemsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ProblemsInner />
    </Suspense>
  );
}

function ProblemsInner() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams() ?? new URLSearchParams();
  const { hasPermission } = useAuth();
  const canViewAll = hasPermission(PERMISSIONS.PROBLEM_VIEW) || hasPermission(PERMISSIONS.PROBLEM_MANAGE);
  const [tab, setTab] = useState<Tab>("list");
  const [view, setView] = useState<"mine" | "all">("mine");
  const [phase, setPhase] = useState<ProblemPhase | "">("");
  const [severity, setSeverity] = useState<ProblemSeverity | "">("");
  const [source, setSource] = useState<ProblemSource | "">("");
  const [overdue, setOverdue] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounce(q);

  // Diğer modüllerden ön dolu oluşturma: /problems?new=1&source=...&sourceId=...&sourceLabel=...&orgUnitId=...
  const [creating, setCreating] = useState(sp.get("new") === "1");
  const defaults = useMemo<Partial<CreateProblemRequest>>(() => {
    const src = sp.get("source");
    return {
      source: PROBLEM_SOURCES.includes(src as ProblemSource) ? (src as ProblemSource) : undefined,
      sourceId: sp.get("sourceId") ?? undefined,
      sourceLabel: sp.get("sourceLabel") ?? undefined,
      orgUnitId: sp.get("orgUnitId") ?? undefined,
      title: sp.get("title") ?? undefined,
      description: sp.get("description") ?? undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const closeCreate = () => {
    setCreating(false);
    if (sp.get("new")) router.replace("/problems");
  };

  const filters: QueryParams = {
    view,
    phase: phase || undefined,
    severity: severity || undefined,
    source: source || undefined,
    overdue: overdue || undefined,
    q: dq || undefined,
  };
  const params: QueryParams = { ...filters, page, pageSize: PAGE_SIZE };
  const { data, isLoading } = useQuery({
    queryKey: ["problems", "list", params],
    queryFn: () => api.get<Paginated<ProblemListItem>>("/problems", params),
    placeholderData: (prev) => prev,
    enabled: tab === "list",
  });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  const tabs = [
    { value: "list" as Tab, label: t("problemsModule.tabs.list") },
    { value: "pipeline" as Tab, label: t("problemsModule.tabs.pipeline") },
    { value: "stats" as Tab, label: t("problemsModule.tabs.stats") },
  ];

  return (
    <>
      <PageHeader
        title={t("problemsModule.title")}
        description={t("problemsModule.subtitle")}
        actions={
          hasPermission(PERMISSIONS.PROBLEM_CREATE) && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              {t("problemsModule.report")}
            </Button>
          )
        }
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-4" />

      {tab !== "stats" && (
        <Card className="mb-4">
          <div className="flex flex-col gap-3 p-4 md:flex-row md:flex-wrap md:items-center">
            {canViewAll && (
              <div className="flex overflow-hidden rounded-lg border border-slate-300">
                {(["mine", "all"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => reset(setView)(v)}
                    className={cn("flex-1 px-4 py-1.5 text-sm", view === v ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}
                  >
                    {t(`problemsModule.view.${v}`)}
                  </button>
                ))}
              </div>
            )}
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input className="pl-9" placeholder={t("common.search")} value={q} onChange={(e) => reset(setQ)(e.target.value)} />
            </div>
            {tab === "list" && (
              <Select className="md:w-44" value={phase} onChange={(e) => reset(setPhase)(e.target.value as ProblemPhase | "")}>
                <option value="">{t("problemsModule.allPhases")}</option>
                {PROBLEM_PHASES.map((p) => (
                  <option key={p} value={p}>
                    {t(`problemsModule.phase.${p}`)}
                  </option>
                ))}
              </Select>
            )}
            <Select className="md:w-40" value={severity} onChange={(e) => reset(setSeverity)(e.target.value as ProblemSeverity | "")}>
              <option value="">{t("problemsModule.allSeverities")}</option>
              {PROBLEM_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {t(`problemsModule.severity.${s}`)}
                </option>
              ))}
            </Select>
            <Select className="md:w-48" value={source} onChange={(e) => reset(setSource)(e.target.value as ProblemSource | "")}>
              <option value="">{t("problemsModule.allSources")}</option>
              {PROBLEM_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {t(`problemsModule.source.${s}`)}
                </option>
              ))}
            </Select>
            <Checkbox checked={overdue} onChange={(e) => reset(setOverdue)(e.target.checked)} label={t("problemsModule.overdueOnly")} />
            <Button variant="outline" onClick={() => api.download("/problems/export", "problemler.xlsx", filters).catch(toast.error)}>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">{t("common.exportExcel")}</span>
            </Button>
          </div>
        </Card>
      )}

      {tab === "pipeline" && <ProblemPipeline filters={filters} />}
      {tab === "stats" && <ProblemsStatsPanel view={canViewAll ? "all" : "mine"} />}
      {tab === "list" && (
        <Card>
          {isLoading || !data ? (
            <LoadingBlock />
          ) : data.items.length === 0 ? (
            <EmptyState title={t("problemsModule.empty")} />
          ) : (
            <>
              <Table>
                <THead>
                  <tr>
                    <TH>{t("problemsModule.code")}</TH>
                    <TH>{t("problemsModule.titleField")}</TH>
                    <TH>{t("common.status")}</TH>
                    <TH>{t("problemsModule.severityField")}</TH>
                    <TH>{t("problemsModule.owner")}</TH>
                    <TH>{t("problemsModule.orgUnit")}</TH>
                    <TH>{t("problemsModule.targetClose")}</TH>
                    <TH>{t("problemsModule.openActions")}</TH>
                  </tr>
                </THead>
                <TBody>
                  {data.items.map((p) => (
                    <TR key={p.id} className={p.overdue ? "bg-red-50/40" : undefined}>
                      <TD className="whitespace-nowrap font-mono text-xs">{p.code}</TD>
                      <TD className="min-w-[14rem] max-w-sm">
                        <Link href={`/problems/${p.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                          {p.title}
                        </Link>
                        <div className="text-xs text-slate-500">{t(`problemsModule.source.${p.source}`)}</div>
                      </TD>
                      <TD>
                        <PhaseBadge phase={p.phase} />
                      </TD>
                      <TD>
                        <SeverityBadge severity={p.severity} />
                      </TD>
                      <TD className="whitespace-nowrap">{p.owner.fullName}</TD>
                      <TD className="whitespace-nowrap">{p.orgUnit.name}</TD>
                      <TD className="whitespace-nowrap">
                        {p.targetCloseDate ? formatDate(p.targetCloseDate, locale) : "—"}
                        {p.overdue && (
                          <Badge tone="red" className="ml-1">
                            <AlertTriangle className="h-3 w-3" />
                            {p.overdueDays}
                          </Badge>
                        )}
                      </TD>
                      <TD>{p.openActionCount > 0 ? <Badge tone="amber">{p.openActionCount}</Badge> : <span className="text-slate-400">0</span>}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
            </>
          )}
        </Card>
      )}

      {creating && <NewProblemDialog open onClose={closeCreate} defaults={defaults} />}
    </>
  );
}
