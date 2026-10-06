"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PERMISSIONS, type AuditListItem, type Paginated } from "@lean/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Badge, PageHeader, Tabs } from "@/components/ui";
import { A } from "@/components/audits/audit-bits";
import { AllAuditsTab } from "@/components/audits/all-audits-tab";
import { DefinitionsTab } from "@/components/audits/definitions-tab";
import { MyAuditsTab } from "@/components/audits/my-audits-tab";
import { PlansTab } from "@/components/audits/plans-tab";
import { ReportsTab } from "@/components/audits/reports-tab";
import { TagsTab } from "@/components/audits/tags-tab";

type Tab = "mine" | "all" | "plans" | "tags" | "reports" | "defs";

export default function AuditsPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canView = hasPermission(PERMISSIONS.AUDIT_VIEW) || hasPermission(PERMISSIONS.AUDIT_MANAGE);
  const canPerform = hasPermission(PERMISSIONS.AUDIT_PERFORM);
  const canManage = hasPermission(PERMISSIONS.AUDIT_MANAGE);
  const hasAny = canView || canPerform;

  const available = useMemo<Tab[]>(() => {
    const tabs: Tab[] = [];
    if (hasAny) tabs.push("mine");
    if (canView) tabs.push("all", "plans");
    tabs.push("tags");
    if (canView) tabs.push("reports");
    if (canManage) tabs.push("defs");
    return tabs;
  }, [hasAny, canView, canManage]);

  const [tab, setTab] = useState<Tab | null>(null);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    setTab(requested && available.includes(requested) ? requested : available[0]);
  }, [available]);
  const current = tab && available.includes(tab) ? tab : available[0];

  const { data: mine } = useQuery({
    queryKey: ["audits", "list", "mine-count"],
    queryFn: () => api.get<Paginated<AuditListItem>>("/audits", { view: "mine", open: true, pageSize: 1 }),
    enabled: hasAny,
    staleTime: 30_000,
  });

  const tabs = available.map((v) => ({
    value: v,
    label:
      v === "mine" ? (
        <span className="inline-flex items-center">
          {t(`${A}.tabs.mine`)}
          {!!mine?.total && <Badge tone="blue" className="ml-1.5 px-1.5">{mine.total}</Badge>}
        </span>
      ) : (
        t(`${A}.tabs.${v}`)
      ),
  }));

  return (
    <>
      <PageHeader title={t(`${A}.title`)} description={t(`${A}.subtitle`)} />
      <Tabs
        tabs={tabs}
        value={current}
        onChange={(v) => {
          setTab(v);
          window.history.replaceState(null, "", `?tab=${v}`);
        }}
        className="mb-4"
      />
      {current === "mine" && <MyAuditsTab />}
      {current === "all" && <AllAuditsTab />}
      {current === "plans" && <PlansTab />}
      {current === "tags" && <TagsTab />}
      {current === "reports" && <ReportsTab />}
      {current === "defs" && <DefinitionsTab />}
    </>
  );
}
