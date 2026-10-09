"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import type { MeetingsDashboardWidget } from "@lean/shared";
import { useI18n } from "@/lib/i18n";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { fmtDate, fmtTime, useTenantTz } from "./meeting-bits";

/** Ana sayfa kartı: dashboard widgets.meetings varsa gösterilir. */
export function UpcomingMeetingsCard({ widget }: { widget: unknown }) {
  const { t, locale } = useI18n();
  const tz = useTenantTz();
  const w = widget as MeetingsDashboardWidget | undefined;
  if (!w) return null;
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-brand-600" />
            {t("meetingsModule.upcomingTitle")}
            {w.todayCount > 0 && <Badge tone="blue">{t("meetingsModule.todayCount", { n: w.todayCount })}</Badge>}
            {w.minutesPending > 0 && <Badge tone="amber">{t("meetingsModule.minutesPending", { n: w.minutesPending })}</Badge>}
          </span>
        }
        actions={
          <Link href="/meetings" className="text-xs font-medium text-brand-600 hover:text-brand-700">
            {t("common.viewAll")}
          </Link>
        }
      />
      {w.upcoming.length === 0 ? (
        <EmptyState title={t("meetingsModule.noUpcoming")} className="py-8" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {w.upcoming.map((m) => (
            <li key={m.id}>
              <Link href={`/meetings/${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <div className="w-20 shrink-0 text-center">
                  <div className="text-xs text-slate-500">{fmtDate(m.startAt, tz, locale)}</div>
                  <div className="text-sm font-semibold tabular-nums text-slate-900">{fmtTime(m.startAt, tz, locale)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{m.title}</p>
                  <p className="truncate text-xs text-slate-500">
                    <span className="font-mono">{m.code}</span>
                    {m.location && ` · ${m.location}`}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
