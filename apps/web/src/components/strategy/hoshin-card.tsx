"use client";

import Link from "next/link";
import { Target } from "lucide-react";
import type { HoshinDashboardWidget } from "@lean/shared";
import { useI18n } from "@/lib/i18n";
import { Badge, Card, CardHeader } from "@/components/ui";

/** Ana sayfa kartı: dashboard widgets.hoshin; hedefi / bekleyen catchball'u yoksa gösterilmez. */
export function HoshinCard({ widget }: { widget: unknown }) {
  const { t } = useI18n();
  const w = widget as HoshinDashboardWidget | undefined;
  if (!w || (w.myGoals === 0 && w.catchballPending === 0)) return null;
  const items = [
    { label: t("strategyModule.widget.myGoals"), value: w.myGoals, href: "/hoshin?tab=tree", tone: "text-slate-900" },
    { label: t("strategyModule.widget.redGoals"), value: w.redGoals, href: "/hoshin?tab=bowling", tone: w.redGoals ? "text-red-600" : "text-slate-900" },
    { label: t("strategyModule.widget.catchballPending"), value: w.catchballPending, href: "/hoshin?tab=catchball", tone: w.catchballPending ? "text-amber-600" : "text-slate-900" },
  ];
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Target className="h-4 w-4 text-brand-600" />
            {t("strategyModule.widget.title")}
            {w.catchballPending > 0 && <Badge tone="amber">{t("strategyModule.widget.waiting", { n: w.catchballPending })}</Badge>}
          </span>
        }
        actions={<Link href="/hoshin" className="text-xs font-medium text-brand-600 hover:text-brand-700">{t("common.viewAll")}</Link>}
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
