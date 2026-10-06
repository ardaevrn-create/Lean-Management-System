"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Plus, Search } from "lucide-react";
import { KPI_CATEGORIES, KPI_FREQUENCIES, PERMISSIONS, periodLabel, type KpiListItem, type Paginated } from "@lean/shared";
import { api, type QueryParams } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useDebounce } from "@/hooks/use-debounce";
import { Badge, Button, Card, Checkbox, Dialog, EmptyState, Input, LoadingBlock, OrgUnitSelect, Pagination, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ImportWizard } from "@/components/import-wizard";
import { EntryStateBadge, StatusDot, targetText, ValueText } from "./kpi-bits";
import { KpiFormDialog } from "./kpi-form-dialog";

const PAGE_SIZE = 20;

/** KPI listesi: filtreler, durum noktası, son değer / hedef, giriş durumu; yönetim yetkisi olanlara yeni KPI ve içe aktarma. */
export function ListTab() {
  const { t, locale } = useI18n();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canManage = hasPermission(PERMISSIONS.KPI_MANAGE);
  const [q, setQ] = useState("");
  const [orgUnitId, setOrgUnitId] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [frequency, setFrequency] = useState("");
  const [mine, setMine] = useState(false);
  const [inactive, setInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [importType, setImportType] = useState<"kpi-definitions" | "kpi-targets" | null>(null);
  const dq = useDebounce(q);

  const params: QueryParams = {
    q: dq || undefined,
    orgUnitId: orgUnitId ?? undefined,
    category: category || undefined,
    frequency: frequency || undefined,
    mine: mine || undefined,
    isActive: inactive ? false : undefined,
    page,
    pageSize: PAGE_SIZE,
  };
  const { data, isLoading } = useQuery({
    queryKey: ["kpi", "list", params],
    queryFn: () => api.get<Paginated<KpiListItem>>("/kpi/definitions", params),
    placeholderData: (prev) => prev,
  });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <Card>
      <div className="space-y-3 border-b border-slate-100 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input className="pl-9" placeholder={t("common.search")} value={q} onChange={(e) => reset(setQ)(e.target.value)} />
          </div>
          <div className="lg:w-56">
            <OrgUnitSelect value={orgUnitId} onChange={reset(setOrgUnitId)} placeholder={t("kpiModule.allUnits")} />
          </div>
          <Select className="lg:w-40" value={category} onChange={(e) => reset(setCategory)(e.target.value)}>
            <option value="">{t("kpiModule.allCategories")}</option>
            {KPI_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`kpiModule.category_${c}`)}
              </option>
            ))}
          </Select>
          <Select className="lg:w-36" value={frequency} onChange={(e) => reset(setFrequency)(e.target.value)}>
            <option value="">{t("kpiModule.allFrequencies")}</option>
            {KPI_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {t(`kpiModule.frequency.${f}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <Checkbox label={t("kpiModule.list.mine")} checked={mine} onChange={(e) => reset(setMine)(e.target.checked)} />
            <Checkbox label={t("kpiModule.list.showInactive")} checked={inactive} onChange={(e) => reset(setInactive)(e.target.checked)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => api.download("/kpi/feed/export", "kpi.xlsx").catch(toast.error)}>
              <Download className="h-4 w-4" />
              {t("common.exportExcel")}
            </Button>
            {canManage && (
              <>
                <Button variant="outline" size="sm" onClick={() => setImportType("kpi-definitions")}>
                  <FileSpreadsheet className="h-4 w-4" />
                  {t("kpiModule.list.importDefinitions")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setImportType("kpi-targets")}>
                  <FileSpreadsheet className="h-4 w-4" />
                  {t("kpiModule.list.importTargets")}
                </Button>
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" />
                  {t("kpiModule.list.new")}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {isLoading || !data ? (
        <LoadingBlock />
      ) : data.items.length === 0 ? (
        <EmptyState title={t("kpiModule.list.empty")} />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH className="w-8" />
                <TH>KPI</TH>
                <TH>{t("kpiModule.orgUnit")}</TH>
                <TH>{t("kpiModule.owner")}</TH>
                <TH>{t("kpiModule.frequencyLabel")}</TH>
                <TH>{t("kpiModule.list.lastValue")}</TH>
                <TH>{t("kpiModule.target")}</TH>
                <TH>{t("kpiModule.list.entry")}</TH>
              </tr>
            </THead>
            <TBody>
              {data.items.map((k) => (
                <TR key={k.id} className={!k.isActive ? "opacity-60" : undefined}>
                  <TD>
                    <StatusDot status={k.lastStatus} className="h-3 w-3" />
                  </TD>
                  <TD className="max-w-xs">
                    <Link href={`/kpi/${k.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {k.name}
                    </Link>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="font-mono">{k.code}</span>
                      <span>{t(`kpiModule.category_${k.category}`)}</span>
                      {k.formula && <Badge tone="indigo">{t("kpiModule.calculated")}</Badge>}
                      {!k.isActive && <Badge tone="muted">{t("common.inactive")}</Badge>}
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap">{k.orgUnit.name}</TD>
                  <TD className="whitespace-nowrap">{k.owner.fullName}</TD>
                  <TD className="whitespace-nowrap">{t(`kpiModule.frequency.${k.frequency}`)}</TD>
                  <TD className="whitespace-nowrap">
                    <ValueText value={k.lastValue} kpi={k} locale={locale} />
                    {k.lastPeriod && <div className="text-xs text-slate-400">{periodLabel(k.lastPeriod, locale)}</div>}
                  </TD>
                  <TD className="whitespace-nowrap">
                    {targetText(k.lastTarget, k.lastTargetMax, k, locale)} <span className="text-xs text-slate-400">{k.lastTarget !== null ? k.unit : ""}</span>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap items-center gap-1">
                      <EntryStateBadge state={k.entryState} />
                      {k.missingCount > 1 && <Badge tone="red">{t("kpiModule.list.missingN", { count: k.missingCount })}</Badge>}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
        </>
      )}

      {creating && <KpiFormDialog open onClose={() => setCreating(false)} />}
      <Dialog open={!!importType} onClose={() => setImportType(null)} size="xl" title={importType === "kpi-targets" ? t("kpiModule.list.importTargets") : t("kpiModule.list.importDefinitions")}>
        {importType && <ImportWizard key={importType} type={importType} />}
      </Dialog>
    </Card>
  );
}
