"use client";

import Link from "next/link";
import { Lightbulb } from "lucide-react";
import type { SuggestionsDashboardWidget } from "@lean/shared";
import { useI18n } from "@/lib/i18n";
import { Badge, Card, CardHeader } from "@/components/ui";

/** Ana sayfa kartı: dashboard widgets.suggestions */
export function SuggestionsHomeCard({ widget }: { widget: unknown }) {
  const { t } = useI18n();
  const w = widget as SuggestionsDashboardWidget | undefined;
  if (!w) return null;
  const items = [
    { label: t("suggestionsModule.widget.mySubmitted"), value: w.mySubmitted, href: "/suggestions", tone: "text-slate-900" },
    { label: t("suggestionsModule.widget.awaiting"), value: w.awaitingMyEvaluation, href: "/suggestions?tab=evaluation", tone: w.awaitingMyEvaluation ? "text-amber-600" : "text-slate-900" },
    { label: t("suggestionsModule.widget.points"), value: w.myPoints, href: "/suggestions?tab=leaderboard", tone: "text-slate-900" },
  ];
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-brand-600" />
            {t("suggestionsModule.title")}
            {w.tier && <Badge tone="amber">{w.tier}</Badge>}
          </span>
        }
        actions={<Link href="/suggestions" className="text-xs font-medium text-brand-600 hover:text-brand-700">{t("suggestionsModule.giveSuggestion")}</Link>}
      />
      <div className="grid grid-cols-3 divide-x divide-slate-100">
        {items.map((i) => (
          <Link key={i.label} href={i.href} className="px-4 py-4 text-center hover:bg-slate-50">
            <p className={`text-2xl font-semibold tabular-nums ${i.tone}`}>{i.value}</p>
            <p className="mt-0.5 text-xs text-slate-500">{i.label}</p>
          </Link>
        ))}
      </div>
    </Card>
  );
}
