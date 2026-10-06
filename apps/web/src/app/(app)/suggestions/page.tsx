"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PERMISSIONS } from "@lean/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { LoadingBlock, PageHeader, Tabs } from "@/components/ui";
import { AllTab } from "@/components/suggestions/all-tab";
import { EvaluationTab } from "@/components/suggestions/evaluation-tab";
import { KaizenTab } from "@/components/suggestions/kaizen-tab";
import { LeaderboardTab } from "@/components/suggestions/leaderboard-tab";
import { LibraryTab } from "@/components/suggestions/library-tab";
import { MyTab } from "@/components/suggestions/my-tab";
import { SettingsTab } from "@/components/suggestions/settings-tab";
import { StatsTab } from "@/components/suggestions/stats-tab";

type Tab = "mine" | "evaluation" | "all" | "kaizen" | "library" | "leaderboard" | "stats" | "settings";

function SuggestionsPage() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const { hasPermission } = useAuth();
  const canEvaluate = hasPermission(PERMISSIONS.SUGGESTION_EVALUATE) || hasPermission(PERMISSIONS.SUGGESTION_MANAGE);
  const canManage = hasPermission(PERMISSIONS.SUGGESTION_MANAGE);

  const tabs = useMemo(() => {
    const list: { value: Tab; label: string }[] = [{ value: "mine", label: t("suggestionsModule.tabs.mine") }];
    // Ön değerlendirici olan herkes (yönetici) "Değerlendirme" sekmesini kullanabilir
    list.push({ value: "evaluation", label: t("suggestionsModule.tabs.evaluation") });
    if (canManage) list.push({ value: "all", label: t("suggestionsModule.tabs.all") });
    list.push({ value: "kaizen", label: t("suggestionsModule.tabs.kaizen") }, { value: "library", label: t("suggestionsModule.tabs.library") }, { value: "leaderboard", label: t("suggestionsModule.tabs.leaderboard") });
    if (canEvaluate) list.push({ value: "stats", label: t("suggestionsModule.tabs.stats") });
    if (canManage) list.push({ value: "settings", label: t("suggestionsModule.tabs.settings") });
    return list;
  }, [t, canEvaluate, canManage]);

  const requested = params.get("tab") as Tab | null;
  const tab: Tab = tabs.some((x) => x.value === requested) ? (requested as Tab) : "mine";
  const setTab = (v: Tab) => router.replace(v === "mine" ? "/suggestions" : `/suggestions?tab=${v}`);

  return (
    <>
      <PageHeader title={t("suggestionsModule.title")} description={t("suggestionsModule.subtitle")} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-4" />
      {tab === "mine" && <MyTab />}
      {tab === "evaluation" && <EvaluationTab />}
      {tab === "all" && canManage && <AllTab />}
      {tab === "kaizen" && <KaizenTab />}
      {tab === "library" && <LibraryTab />}
      {tab === "leaderboard" && <LeaderboardTab />}
      {tab === "stats" && canEvaluate && <StatsTab />}
      {tab === "settings" && canManage && <SettingsTab />}
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <SuggestionsPage />
    </Suspense>
  );
}
