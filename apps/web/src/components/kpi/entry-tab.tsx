"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, ChevronRight, FileSpreadsheet, Lock, Save } from "lucide-react";
import {
  addPeriods, currentPeriod, periodLabel, recentPeriods,
  type KpiEntryGroup, type KpiEntryItem, type KpiEntryResponse, type KpiValueResult,
} from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { Badge, Button, Card, CardBody, Dialog, EmptyState, Input, LoadingBlock, Select } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ImportWizard } from "@/components/import-wizard";
import { DeviationDialog } from "./deviation-dialog";
import { EntryStateBadge, formatKpiValue, liveStatus, parseDecimal, StatusChip, targetText } from "./kpi-bits";

interface Draft {
  value: string;
  note: string;
  reason: string;
}

const toInput = (v: number | null, locale: string) => (v === null ? "" : String(v).replace(".", locale === "en" ? "." : ","));
const initialDraft = (i: KpiEntryItem, locale: string): Draft => ({ value: toInput(i.value, locale), note: i.note ?? "", reason: "" });

function EntryGroup({ initial }: { initial: KpiEntryGroup }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const freq = initial.frequency;
  const [ref, setRef] = useState<string | null>(null);
  const [devFor, setDevFor] = useState<{ kpiId: string; period: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingAll, setSavingAll] = useState(false);

  const query = useQuery({
    queryKey: ["kpi", "entry", freq, ref],
    enabled: ref !== null,
    queryFn: async () => (await api.get<KpiEntryResponse>("/kpi/entry", { frequency: freq, period: ref! })).groups[0],
  });
  const group: KpiEntryGroup = (ref === null ? initial : query.data) ?? initial;
  const period = group.period;
  const current = currentPeriod(freq);
  const options = useMemo(() => recentPeriods(current, 24).reverse(), [current]);

  const draftOf = (i: KpiEntryItem): Draft => drafts[i.kpi.id] ?? initialDraft(i, locale);
  const setDraft = (i: KpiEntryItem, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [i.kpi.id]: { ...draftOf(i), ...patch } }));
  const parsed = (i: KpiEntryItem) => parseDecimal(draftOf(i).value);
  const changed = (i: KpiEntryItem) => {
    const v = parsed(i);
    const d = draftOf(i);
    return v !== null && (v !== i.value || d.note.trim() !== (i.note ?? ""));
  };
  const valueChanged = (i: KpiEntryItem) => {
    const v = parsed(i);
    return v !== null && i.value !== null && v !== i.value;
  };
  const canSave = (i: KpiEntryItem) => i.canEnter && changed(i) && (!valueChanged(i) || draftOf(i).reason.trim().length > 0);

  const go = (p: string) => {
    setRef(p);
    setDrafts({});
  };

  const saveOne = async (i: KpiEntryItem): Promise<KpiValueResult> => {
    const d = draftOf(i);
    return api.put<KpiValueResult>("/kpi/values", {
      kpiId: i.kpi.id,
      period,
      value: parseDecimal(d.value),
      note: d.note.trim() || null,
      reason: valueChanged(i) ? d.reason.trim() : undefined,
    });
  };
  const afterSave = () => {
    qc.invalidateQueries({ queryKey: ["kpi"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    setDrafts({});
  };

  const save = useMutation({
    mutationFn: saveOne,
    onSuccess: (r, i) => {
      toast.success(t("kpiModule.entry.saved"));
      afterSave();
      if (r.entryState === "DEVIATION_REQUIRED") setDevFor({ kpiId: i.kpi.id, period });
    },
    onError: toast.error,
  });

  async function saveAll() {
    setSavingAll(true);
    let ok = 0;
    try {
      for (const i of group.items.filter(canSave)) {
        try {
          await saveOne(i);
          ok++;
        } catch (e) {
          toast.error(e);
        }
      }
    } finally {
      setSavingAll(false);
      afterSave();
    }
    if (ok) toast.success(t("kpiModule.entry.savedMany", { count: ok }));
  }

  const dirtyCount = group.items.filter(canSave).length;
  const loading = ref !== null && query.isFetching && !query.data;

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t(`kpiModule.frequency.${freq}`)}</h3>
          <p className="text-xs text-slate-500">
            {t("kpiModule.entry.dueDate")}: {formatDate(group.dueDate, locale)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="icon" variant="outline" aria-label={t("common.prev")} onClick={() => go(addPeriods(period, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select className="w-44" value={period} onChange={(e) => go(e.target.value)}>
            {(options.includes(period) ? options : [period, ...options]).map((p) => (
              <option key={p} value={p}>
                {periodLabel(p, locale)}
              </option>
            ))}
          </Select>
          <Button size="icon" variant="outline" aria-label={t("common.next")} disabled={period >= current} onClick={() => go(addPeriods(period, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_auto] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 md:grid">
            <span>KPI</span>
            <span>{t("kpiModule.target")}</span>
            <span>{t("kpiModule.actual")}</span>
            <span>{t("common.status")}</span>
            <span>{t("kpiModule.note")}</span>
            <span className="w-24" />
          </div>
          <ul className="divide-y divide-slate-100">
            {group.items.map((i) => {
              const d = draftOf(i);
              const v = parsed(i);
              const status = i.isCalculated || v === null ? i.status : liveStatus(i.kpi, v, i.target, i.targetMax);
              const showStatus = i.isCalculated ? i.value !== null : v !== null;
              const needsDev = i.entryState === "DEVIATION_REQUIRED" || i.entryState === "PENDING_APPROVAL";
              return (
                <li key={i.kpi.id} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_auto] md:items-center md:gap-3">
                  <div className="min-w-0">
                    <Link href={`/kpi/${i.kpi.id}`} className="block truncate text-sm font-medium text-slate-900 hover:text-brand-700">
                      {i.kpi.name}
                    </Link>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span className="font-mono">{i.kpi.code}</span>
                      <span>{i.kpi.orgUnit.name}</span>
                      {i.missingPeriods.length > 0 && (
                        <button
                          type="button"
                          onClick={() => go(i.missingPeriods[i.missingPeriods.length - 1])}
                          className="inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 font-medium text-red-700 hover:bg-red-100"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {t("kpiModule.entry.missingOlder", { count: i.missingPeriods.length })}
                        </button>
                      )}
                    </p>
                  </div>
                  <div className="text-sm text-slate-600">
                    <span className="mr-2 text-xs text-slate-400 md:hidden">{t("kpiModule.target")}</span>
                    {targetText(i.target, i.targetMax, i.kpi, locale)} <span className="text-xs text-slate-400">{i.kpi.unit}</span>
                  </div>
                  <div>
                    {i.isCalculated ? (
                      <div className="flex items-center gap-1.5 text-sm tabular-nums text-slate-700">
                        <Lock className="h-3.5 w-3.5 text-slate-400" />
                        {i.value === null ? <span className="text-slate-400">{t("kpiModule.entry.calculated")}</span> : formatKpiValue(i.value, i.kpi.decimals, locale)}
                        <span className="text-xs text-slate-400">{i.kpi.unit}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Input
                          inputMode="decimal"
                          className="h-10 text-base md:h-9 md:text-sm"
                          value={d.value}
                          disabled={!i.canEnter}
                          placeholder="0,00"
                          onChange={(e) => setDraft(i, { value: e.target.value })}
                          onKeyDown={(e) => e.key === "Enter" && canSave(i) && save.mutate(i)}
                          aria-label={`${i.kpi.name} ${t("kpiModule.actual")}`}
                        />
                        <span className="w-8 shrink-0 text-xs text-slate-400">{i.kpi.unit}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {showStatus ? <StatusChip status={status} /> : <StatusChip status={null} noData />}
                    {i.value !== null && !changed(i) && <EntryStateBadge state={i.entryState} />}
                    {i.value === null && !i.isCalculated && <EntryStateBadge state={i.entryState} />}
                  </div>
                  <div>
                    {i.isCalculated ? (
                      <span className="text-xs text-slate-400">{t("kpiModule.entry.calculatedHint")}</span>
                    ) : (
                      <Input
                        value={d.note}
                        disabled={!i.canEnter}
                        placeholder={t("kpiModule.note")}
                        onChange={(e) => setDraft(i, { note: e.target.value })}
                      />
                    )}
                    {valueChanged(i) && (
                      <Input
                        className="mt-1.5 border-amber-300"
                        value={d.reason}
                        placeholder={t("kpiModule.entry.reasonPlaceholder")}
                        onChange={(e) => setDraft(i, { reason: e.target.value })}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 md:w-24 md:justify-end">
                    {i.canEnter && (
                      <Button size="sm" disabled={!canSave(i)} loading={save.isPending && save.variables?.kpi.id === i.kpi.id} onClick={() => save.mutate(i)}>
                        <Save className="h-3.5 w-3.5" />
                        {t("common.save")}
                      </Button>
                    )}
                    {needsDev && !changed(i) && (
                      <Button
                        size="sm"
                        variant={i.entryState === "DEVIATION_REQUIRED" ? "danger" : "outline"}
                        onClick={() => setDevFor({ kpiId: i.kpi.id, period })}
                      >
                        {i.entryState === "DEVIATION_REQUIRED" ? t("kpiModule.entry.explanationNeeded") : t("kpiModule.entry.viewExplanation")}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <span className="text-xs text-slate-500">{t("kpiModule.entry.pendingChanges", { count: dirtyCount })}</span>
            <Button disabled={!dirtyCount} loading={savingAll} onClick={saveAll}>
              <Save className="h-4 w-4" />
              {t("kpiModule.entry.saveAll")}
            </Button>
          </div>
        </>
      )}
      {devFor && <DeviationDialog open kpiId={devFor.kpiId} period={devFor.period} onClose={() => setDevFor(null)} />}
    </Card>
  );
}

/** Veri girişi: kullanıcının KPI'ları, sıklığa göre gruplu ızgara. */
export function EntryTab() {
  const { t } = useI18n();
  const [importing, setImporting] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["kpi", "entry", "groups"], queryFn: () => api.get<KpiEntryResponse>("/kpi/entry") });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">{t("kpiModule.entry.intro")}</p>
        <Button variant="outline" onClick={() => setImporting(true)}>
          <FileSpreadsheet className="h-4 w-4" />
          {t("kpiModule.entry.importExcel")}
        </Button>
      </div>
      {isLoading || !data ? (
        <LoadingBlock />
      ) : data.groups.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState title={t("kpiModule.entry.empty")} description={t("kpiModule.entry.emptyHint")} />
          </CardBody>
        </Card>
      ) : (
        data.groups.map((g) => <EntryGroup key={g.frequency} initial={g} />)
      )}
      <Dialog open={importing} onClose={() => setImporting(false)} size="xl" title={t("kpiModule.entry.importExcel")}>
        <ImportWizard type="kpi-values" />
      </Dialog>
    </div>
  );
}

export function CountBadge({ count, tone = "red" }: { count: number; tone?: "red" | "amber" | "blue" }) {
  if (!count) return null;
  return (
    <Badge tone={tone} className={cn("ml-1.5 px-1.5")}>
      {count}
    </Badge>
  );
}
