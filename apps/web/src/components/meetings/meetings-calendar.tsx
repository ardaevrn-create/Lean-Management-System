"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MeetingCalendarItem, MeetingStatus } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button, Card, Checkbox, EmptyState, LoadingBlock } from "@/components/ui";
import { dayKey, fmtLongDate, fmtTime, MeetingStatusBadge, useTenantTz } from "./meeting-bits";

const CHIP: Record<MeetingStatus, string> = {
  PLANNED: "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100",
  IN_PROGRESS: "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
  CANCELLED: "border-slate-200 bg-slate-50 text-slate-400 line-through hover:bg-slate-100",
};

const DAY_MS = 86_400_000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Basit CSS grid ay takvimi + hafta listesi (takvim kütüphanesi kullanılmaz). */
export function MeetingsCalendar() {
  const { t, locale } = useI18n();
  const tz = useTenantTz();
  const todayKey = dayKey(new Date(), tz);
  const [cursor, setCursor] = useState(() => todayKey.slice(0, 7)); // YYYY-MM
  const [mode, setMode] = useState<"month" | "week">("month");
  const [weekStart, setWeekStart] = useState(() => {
    const [y, m, d] = todayKey.split("-").map(Number);
    const ms = Date.UTC(y, m - 1, d);
    return ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY_MS; // Pazartesi
  });
  const [onlyMine, setOnlyMine] = useState(false);

  const [cy, cm] = cursor.split("-").map(Number);
  const monthFirst = Date.UTC(cy, cm - 1, 1);
  const gridStart = monthFirst - ((new Date(monthFirst).getUTCDay() + 6) % 7) * DAY_MS;
  const gridDays = useMemo(() => Array.from({ length: 42 }, (_, i) => gridStart + i * DAY_MS), [gridStart]);

  const rangeStart = mode === "month" ? gridStart : weekStart;
  const rangeEnd = mode === "month" ? gridStart + 42 * DAY_MS : weekStart + 7 * DAY_MS;
  // Kenarlarda saat dilimi kaymasına karşı 1 gün tampon
  const params = { from: new Date(rangeStart - DAY_MS).toISOString(), to: new Date(rangeEnd + DAY_MS).toISOString() };
  const { data, isLoading } = useQuery({
    queryKey: ["meetings", "calendar", params],
    queryFn: () => api.get<MeetingCalendarItem[]>("/meetings/calendar", params),
    placeholderData: (prev) => prev,
  });

  const byDay = useMemo(() => {
    const map = new Map<string, MeetingCalendarItem[]>();
    for (const m of data ?? []) {
      if (onlyMine && !m.isParticipant) continue;
      const k = dayKey(m.startAt, tz);
      map.set(k, [...(map.get(k) ?? []), m]);
    }
    return map;
  }, [data, tz, onlyMine]);

  const monthLabel = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "tr-TR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(monthFirst));
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "tr-TR", { weekday: "short", timeZone: "UTC" }).format(new Date(gridStart + i * DAY_MS)),
  );

  const shift = (dir: -1 | 1) => {
    if (mode === "month") setCursor(ymd(Date.UTC(cy, cm - 1 + dir, 1)).slice(0, 7));
    else setWeekStart((w) => w + dir * 7 * DAY_MS);
  };
  const goToday = () => {
    const [y, m, d] = todayKey.split("-").map(Number);
    const ms = Date.UTC(y, m - 1, d);
    setCursor(todayKey.slice(0, 7));
    setWeekStart(ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY_MS);
  };
  const weekLabel = `${ymd(weekStart).split("-").reverse().join(".")} – ${ymd(weekStart + 6 * DAY_MS).split("-").reverse().join(".")}`;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <Button variant="outline" size="sm" onClick={() => shift(-1)} aria-label={t("common.prev")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => shift(1)} aria-label={t("common.next")}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={goToday}>
          {t("meetingsModule.today")}
        </Button>
        <h3 className="mx-2 min-w-40 text-sm font-semibold capitalize text-slate-900">{mode === "month" ? monthLabel : weekLabel}</h3>
        <div className="ml-auto flex items-center gap-3">
          <Checkbox label={t("meetingsModule.onlyMine")} checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            {(["month", "week"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cn("px-3 py-1.5 text-sm", mode === m ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}>
                {t(`meetingsModule.calendarMode.${m}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && !data ? (
        <LoadingBlock />
      ) : mode === "month" ? (
        <div className="overflow-x-auto">
          <div className="grid min-w-[44rem] grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-xs font-medium uppercase text-slate-500">
            {weekdayLabels.map((w) => (
              <div key={w} className="py-2">
                {w}
              </div>
            ))}
          </div>
          <div className="grid min-w-[44rem] grid-cols-7">
            {gridDays.map((ms) => {
              const key = ymd(ms);
              const items = byDay.get(key) ?? [];
              const inMonth = key.slice(0, 7) === cursor;
              return (
                <div key={key} className={cn("min-h-28 border-b border-r border-slate-100 p-1.5", !inMonth && "bg-slate-50/70")}>
                  <div className={cn("mb-1 text-right text-xs", inMonth ? "text-slate-600" : "text-slate-300")}>
                    <span className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1", key === todayKey && "bg-brand-600 font-semibold text-white")}>
                      {Number(key.slice(8))}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {items.slice(0, 4).map((m) => (
                      <Link key={m.id} href={`/meetings/${m.id}`} title={`${m.code} ${m.title}`} className={cn("block truncate rounded border px-1.5 py-0.5 text-xs", CHIP[m.status])}>
                        <span className="font-medium tabular-nums">{fmtTime(m.startAt, tz, locale)}</span> {m.title}
                      </Link>
                    ))}
                    {items.length > 4 && <p className="px-1 text-xs text-slate-500">+{items.length - 4}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 7 }, (_, i) => weekStart + i * DAY_MS).map((ms) => {
            const key = ymd(ms);
            const items = byDay.get(key) ?? [];
            return (
              <div key={key} className={cn("flex flex-col gap-2 p-3 sm:flex-row", key === todayKey && "bg-brand-50/40")}>
                <div className="w-44 shrink-0 text-sm font-medium capitalize text-slate-700">{fmtLongDate(new Date(ms).toISOString(), "UTC", locale)}</div>
                <div className="flex-1 space-y-1.5">
                  {items.length === 0 && <p className="text-sm text-slate-400">—</p>}
                  {items.map((m) => (
                    <Link key={m.id} href={`/meetings/${m.id}`} className={cn("flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm", CHIP[m.status])}>
                      <span className="font-semibold tabular-nums">{fmtTime(m.startAt, tz, locale)}–{fmtTime(m.endAt, tz, locale)}</span>
                      <span className="font-medium">{m.title}</span>
                      {m.location && <span className="text-xs opacity-70">{m.location}</span>}
                      <span className="ml-auto">
                        <MeetingStatusBadge status={m.status} />
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {data && data.length === 0 && !isLoading && <EmptyState title={t("meetingsModule.calendarEmpty")} className="py-6" />}
      <div className="flex flex-wrap gap-3 border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        {(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as MeetingStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn("h-3 w-3 rounded border", CHIP[s].split(" ").slice(0, 2).join(" "))} />
            {t(`meetingsModule.status.${s}`)}
          </span>
        ))}
      </div>
    </Card>
  );
}
