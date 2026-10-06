"use client";

import { useQuery } from "@tanstack/react-query";
import type { MeetingAttendance, MeetingStatus, TenantInfo } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Badge, type BadgeTone } from "@/components/ui";

export const DEFAULT_TZ = "Europe/Istanbul";

/** Şirket saat dilimi (tenant.timezone); layout ile aynı sorgu anahtarını paylaşır. */
export function useTenantTz(): string {
  const { data } = useQuery({ queryKey: ["tenant"], queryFn: () => api.get<TenantInfo>("/tenant"), staleTime: 5 * 60_000 });
  return data?.timezone || DEFAULT_TZ;
}

const intlLocale = (locale: string) => (locale === "en" ? "en-GB" : "tr-TR");

export function fmtDate(iso: string, tz: string, locale = "tr"): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}
export function fmtLongDate(iso: string, tz: string, locale = "tr"): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}
export function fmtTime(iso: string, tz: string, locale = "tr"): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}
export function fmtDateTime(iso: string, tz: string, locale = "tr"): string {
  return `${fmtDate(iso, tz, locale)} ${fmtTime(iso, tz, locale)}`;
}
export function fmtRange(startIso: string, endIso: string, tz: string, locale = "tr"): string {
  return `${fmtDate(startIso, tz, locale)} ${fmtTime(startIso, tz, locale)} – ${fmtTime(endIso, tz, locale)}`;
}

/** Anın verilen saat diliminde YYYY-MM-DD karşılığı. */
export function dayKey(iso: string | Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function offsetMs(date: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Şirket saat diliminde "YYYY-MM-DD" + "HH:mm" duvar saatini ISO (UTC) zamanına çevirir. */
export function zonedToIso(dateStr: string, time: string, tz: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - offsetMs(new Date(guess), tz);
  return new Date(guess - offsetMs(new Date(first), tz)).toISOString();
}

export const STATUS_TONE: Record<MeetingStatus, BadgeTone> = { PLANNED: "blue", IN_PROGRESS: "amber", COMPLETED: "green", CANCELLED: "muted" };

export function MeetingStatusBadge({ status }: { status: MeetingStatus }) {
  const { t } = useI18n();
  return <Badge tone={STATUS_TONE[status]}>{t(`meetingsModule.status.${status}`)}</Badge>;
}

export const ATTENDANCE_TONE: Record<MeetingAttendance, BadgeTone> = { UNKNOWN: "gray", PRESENT: "green", ABSENT: "red", EXCUSED: "blue", LATE: "amber" };

export function AttendanceBadge({ attendance }: { attendance: MeetingAttendance }) {
  const { t } = useI18n();
  return <Badge tone={ATTENDANCE_TONE[attendance]}>{t(`meetingsModule.attendance.${attendance}`)}</Badge>;
}

/** Sunucu "YYYY-MM-DD" tarihini yerel gösterime çevirir (saat dilimi kayması olmadan). */
export function fmtDateOnly(d: string, locale = "tr"): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, day)));
}
