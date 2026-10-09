"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CatchballListItem } from "@lean/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Badge, EmptyState, LoadingBlock, PageHeader, Select, Tabs } from "@/components/ui";
import { BowlingTab } from "@/components/strategy/bowling-tab";
import { CatchballTab } from "@/components/strategy/catchball";
import { PlanTab } from "@/components/strategy/plan-tab";
import { ReviewTab } from "@/components/strategy/review";
import { HOSHIN_KEY, usePlans } from "@/components/strategy/strategy-bits";
import { TreeTab } from "@/components/strategy/tree-tab";
import { XMatrixTab } from "@/components/strategy/xmatrix-tab";

type Tab = "plan" | "tree" | "xmatrix" | "bowling" | "catchball" | "review";
const TABS: Tab[] = ["plan", "tree", "xmatrix", "bowling", "catchball", "review"];

export default function HoshinPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const plansQ = usePlans();
  const plans = useMemo(() => plansQ.data ?? [], [plansQ.data]);
  const [tab, setTab] = useState<Tab>("tree");
  const [planId, setPlanId] = useState<string>("");
  const [year, setYear] = useState<number | null>(null);

  // URL'den başlangıç durumu
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const requested = sp.get("tab") as Tab | null;
    if (requested && TABS.includes(requested)) setTab(requested);
    if (sp.get("plan")) setPlanId(sp.get("plan")!);
    if (sp.get("year")) setYear(Number(sp.get("year")));
  }, []);

  const plan = plans.find((p) => p.id === planId) ?? plans.find((p) => p.status === "ACTIVE") ?? plans[0] ?? null;
  const currentYear = new Date().getFullYear();
  const effectiveYear = plan ? (year && year >= plan.startYear && year <= plan.endYear ? year : Math.min(plan.endYear, Math.max(plan.startYear, currentYear))) : currentYear;
  const years = plan ? Array.from({ length: plan.endYear - plan.startYear + 1 }, (_, i) => plan.startYear + i) : [];

  const sync = (patch: Record<string, string>) => {
    const sp = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) sp.set(k, v);
    window.history.replaceState(null, "", `?${sp.toString()}`);
  };
  const choose = (v: Tab) => {
    setTab(v);
    sync({ tab: v });
  };

  const pending = useQuery({ queryKey: [...HOSHIN_KEY, "catchball"], queryFn: () => api.get<CatchballListItem[]>("/hoshin/catchball"), staleTime: 30_000 });
  const awaiting = pending.data?.filter((i) => i.awaitingMe).length ?? 0;

  const tabs = [
    ...(hasPermission("strategy.view") ? [{ value: "plan" as const, label: t("strategyModule.tabs.plan") }] : []),
    { value: "tree" as const, label: t("strategyModule.tabs.tree") },
    { value: "xmatrix" as const, label: t("strategyModule.tabs.xmatrix") },
    { value: "bowling" as const, label: t("strategyModule.tabs.bowling") },
    {
      value: "catchball" as const,
      label: (
        <span className="inline-flex items-center">
          {t("strategyModule.tabs.catchball")}
          {awaiting > 0 && <Badge tone="amber" className="ml-1.5 px-1.5">{awaiting}</Badge>}
        </span>
      ),
    },
    { value: "review" as const, label: t("strategyModule.tabs.review") },
  ];
  const current: Tab = tabs.some((x) => x.value === tab) ? tab : "tree";

  return (
    <>
      <PageHeader
        title={t("strategyModule.title")}
        description={t("strategyModule.subtitle")}
        actions={
          <>
            <Select
              className="w-60"
              aria-label={t("strategyModule.plan.select")}
              value={plan?.id ?? ""}
              onChange={(e) => {
                setPlanId(e.target.value);
                sync({ plan: e.target.value });
              }}
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · v{p.version}{p.status === "ACTIVE" ? " ✓" : ""}</option>
              ))}
            </Select>
            {current !== "plan" && current !== "catchball" && (
              <Select
                className="w-28"
                aria-label={t("strategyModule.field.year")}
                value={effectiveYear}
                onChange={(e) => {
                  setYear(Number(e.target.value));
                  sync({ year: e.target.value });
                }}
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </Select>
            )}
          </>
        }
      />
      <Tabs tabs={tabs} value={current} onChange={choose} className="mb-4" />
      {plansQ.isLoading ? (
        <LoadingBlock />
      ) : current === "plan" ? (
        <PlanTab planId={plan?.id ?? null} onSelectPlan={(id) => { setPlanId(id); sync({ plan: id }); }} />
      ) : current === "catchball" ? (
        <CatchballTab />
      ) : !plan ? (
        <EmptyState title={t("strategyModule.plan.none")} description={t("strategyModule.plan.noneDesc")} />
      ) : (
        <>
          {current === "tree" && <TreeTab plan={plan} year={effectiveYear} />}
          {current === "xmatrix" && <XMatrixTab plan={plan} year={effectiveYear} />}
          {current === "bowling" && <BowlingTab plan={plan} year={effectiveYear} />}
          {current === "review" && <ReviewTab plan={plan} year={effectiveYear} />}
        </>
      )}
    </>
  );
}
