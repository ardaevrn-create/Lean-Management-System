"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PERMISSIONS, type KpiSummary } from "@lean/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Badge, PageHeader, Tabs } from "@/components/ui";
import { BoardTab } from "@/components/kpi/board-tab";
import { DeviationsTab } from "@/components/kpi/deviations-tab";
import { EntryTab } from "@/components/kpi/entry-tab";
import { ListTab } from "@/components/kpi/list-tab";
import { MissingTab } from "@/components/kpi/missing-tab";

type Tab = "entry" | "list" | "missing" | "deviations" | "board";
const TABS: Tab[] = ["entry", "list", "missing", "deviations", "board"];

export default function KpiPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.KPI_MANAGE);
  const [tab, setTab] = useState<Tab | null>(null);

  // Varsayılan sekme: yöneticiler için eksik veriler, diğer kullanıcılar için veri girişi; ?tab= ile açılabilir
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    setTab(requested && TABS.includes(requested) ? requested : canManage ? "missing" : "entry");
  }, [canManage]);

  const { data: summary } = useQuery({ queryKey: ["kpi", "summary"], queryFn: () => api.get<KpiSummary>("/kpi/summary"), staleTime: 30_000 });

  const tabs = useMemo(
    () => [
      { value: "entry" as const, label: t("kpiModule.tabs.entry") },
      { value: "list" as const, label: t("kpiModule.tabs.list") },
      {
        value: "missing" as const,
        label: (
          <span className="inline-flex items-center">
            {t("kpiModule.tabs.missing")}
            {!!summary?.missing && <Badge tone="red" className="ml-1.5 px-1.5">{summary.missing}</Badge>}
          </span>
        ),
      },
      {
        value: "deviations" as const,
        label: (
          <span className="inline-flex items-center">
            {t("kpiModule.tabs.deviations")}
            {!!summary?.deviationRequired && <Badge tone="amber" className="ml-1.5 px-1.5">{summary.deviationRequired}</Badge>}
            {!!summary?.pendingApproval && <Badge tone="blue" className="ml-1 px-1.5">{summary.pendingApproval}</Badge>}
          </span>
        ),
      },
      { value: "board" as const, label: t("kpiModule.tabs.board") },
    ],
    [t, summary],
  );

  const current = tab ?? (canManage ? "missing" : "entry");
  const choose = (v: Tab) => {
    setTab(v);
    window.history.replaceState(null, "", `?tab=${v}`);
  };

  return (
    <>
      <PageHeader title={t("kpiModule.title")} description={t("kpiModule.subtitle")} />
      <Tabs tabs={tabs} value={current} onChange={choose} className="mb-4" />
      {tab && (
        <>
          {current === "entry" && <EntryTab />}
          {current === "list" && <ListTab />}
          {current === "missing" && <MissingTab />}
          {current === "deviations" && <DeviationsTab />}
          {current === "board" && <BoardTab />}
        </>
      )}
    </>
  );
}
