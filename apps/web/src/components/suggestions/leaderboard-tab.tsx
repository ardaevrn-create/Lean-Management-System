"use client";

import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import type { LeaderboardEntry, SuggestionSettingsDto } from "@lean/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge, Card, CardBody, CardHeader, EmptyState, LoadingBlock, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { sKey, useSuggestionSettings } from "./bits";
import { PointsCard } from "./my-tab";

const medal = ["text-amber-500", "text-slate-400", "text-orange-600"];

/** Puan tablosu ve ödül kademeleri (M7-07). */
export function LeaderboardTab() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: sKey("leaderboard"), queryFn: () => api.get<LeaderboardEntry[]>("/suggestions/points/leaderboard", { limit: 50 }) });
  const { data: settings } = useSuggestionSettings();

  return (
    <div className="space-y-4">
      <PointsCard />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("suggestionsModule.leaderboard.title")} />
          {isLoading || !data ? (
            <LoadingBlock />
          ) : data.length === 0 ? (
            <EmptyState icon={<Trophy className="h-6 w-6" />} title={t("suggestionsModule.leaderboard.empty")} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>#</TH>
                  <TH>{t("suggestionsModule.owner")}</TH>
                  <TH>{t("suggestionsModule.form.area")}</TH>
                  <TH>{t("suggestionsModule.leaderboard.tier")}</TH>
                  <TH className="text-right">{t("suggestionsModule.points.submitted")}</TH>
                  <TH className="text-right">{t("suggestionsModule.points.total")}</TH>
                </tr>
              </THead>
              <TBody>
                {data.map((e) => (
                  <TR key={e.userId} className={e.userId === user?.id ? "bg-brand-50/60" : undefined}>
                    <TD className={cn("w-10 font-semibold tabular-nums", medal[e.rank - 1])}>{e.rank}</TD>
                    <TD className="font-medium text-slate-900">{e.fullName}</TD>
                    <TD>{e.orgUnitName ?? "—"}</TD>
                    <TD>{e.tier ? <Badge tone="amber">{e.tier.name}</Badge> : <span className="text-slate-300">—</span>}</TD>
                    <TD className="text-right tabular-nums">{e.suggestions}</TD>
                    <TD className="text-right font-semibold tabular-nums">{e.points}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        <TiersCard settings={settings} />
      </div>
    </div>
  );
}

function TiersCard({ settings }: { settings?: SuggestionSettingsDto }) {
  const { t } = useI18n();
  if (!settings) return null;
  const r = settings.pointRules;
  return (
    <Card>
      <CardHeader title={t("suggestionsModule.leaderboard.howTitle")} />
      <CardBody className="space-y-3 text-sm">
        <ul className="space-y-1 text-slate-600">
          <li>{t("suggestionsModule.settings.submission")}: <b>+{r.submission}</b></li>
          {[...r.acceptanceBands].sort((a, b) => b.minScore - a.minScore).map((b) => (
            <li key={b.minScore}>{t("suggestionsModule.leaderboard.acceptance", { score: b.minScore })}: <b>+{b.points}</b></li>
          ))}
          <li>{t("suggestionsModule.settings.implementation")}: <b>+{r.implementation}</b></li>
          <li>{t("suggestionsModule.settings.kaizenPublished")}: <b>+{r.kaizenPublished}</b></li>
        </ul>
        <div className="space-y-1 border-t border-slate-100 pt-3">
          {settings.rewardTiers.map((tier) => (
            <div key={tier.name} className="flex items-center justify-between">
              <Badge tone="amber">{tier.name}</Badge>
              <span className="tabular-nums text-slate-600">{tier.minPoints}+</span>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
