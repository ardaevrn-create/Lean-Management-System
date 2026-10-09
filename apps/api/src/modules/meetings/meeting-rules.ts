import type { MeetingAttendance, SeriesFrequency } from '@lean/shared';

export const meetingCode = (n: number) => `TOP-${String(n).padStart(5, '0')}`;

/* ------------------------------ Saat dilimi ------------------------------ */

const MS_DAY = 86_400_000;
const dtfCache = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

/** Verilen anın duvar saati bileşenleri (verilen saat diliminde). */
export function zonedParts(date: Date, timeZone: string) {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour) % 24, minute: Number(parts.minute), second: Number(parts.second),
  };
}

/** Saat diliminin UTC'ye göre farkı (ms); doğuda pozitif. */
export function tzOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** "Bu saat diliminde YYYY-MM-DD HH:mm" duvar saatini UTC anına çevirir (DST güvenli). */
export function zonedTimeToUtc(dateStr: string, time: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - tzOffsetMs(new Date(guess), timeZone);
  // Offset, tahmin edilen anda farklıysa (DST geçişi) ikinci geçişte düzelt
  return new Date(guess - tzOffsetMs(new Date(first), timeZone));
}

/** Verilen anın saat diliminde YYYY-MM-DD karşılığı. */
export function zonedDateString(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Saat diliminde bir günün [başlangıç, ertesi gün başlangıcı) aralığı (UTC anları). */
export function zonedDayRange(date: Date, timeZone: string): { start: Date; end: Date } {
  const day = zonedDateString(date, timeZone);
  const next = new Date(parseDay(day) + MS_DAY).toISOString().slice(0, 10);
  return { start: zonedTimeToUtc(day, '00:00', timeZone), end: zonedTimeToUtc(next, '00:00', timeZone) };
}

/** "06.10.2026" gösterimi (verilen saat diliminde). */
export function formatDateTr(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${String(p.day).padStart(2, '0')}.${String(p.month).padStart(2, '0')}.${p.year}`;
}

/** "06.10.2026 14:30" gösterimi (verilen saat diliminde). */
export function formatDateTimeTr(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${formatDateTr(date, timeZone)} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/* ------------------------------ Tekrarlama ------------------------------ */

export interface RecurrenceInput {
  /** YYYY-MM-DD (yerel tarih) */
  firstDate: string;
  untilDate: string;
  /** HH:mm (yerel saat) */
  time: string;
  frequency: SeriesFrequency;
  /** ISO gün numaraları: 1 = Pazartesi ... 7 = Pazar (haftalık/iki haftalık) */
  weekdays?: number[];
  /** Günlük sıklıkta hafta sonlarını atla */
  skipWeekends?: boolean;
  timeZone: string;
}

function parseDay(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
const isoWeekday = (utcMs: number) => ((new Date(utcMs).getUTCDay() + 6) % 7) + 1;
const dayString = (utcMs: number) => new Date(utcMs).toISOString().slice(0, 10);
const daysInMonth = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

/** Yerel tarih listesi (YYYY-MM-DD) üretir. Güvenlik için en çok `limit` + 1 kayıt döner. */
export function generateOccurrenceDates(input: Omit<RecurrenceInput, 'time' | 'timeZone'>, limit = 1000): string[] {
  const first = parseDay(input.firstDate);
  const until = parseDay(input.untilDate);
  const out: string[] = [];
  if (!(until >= first)) return out;

  if (input.frequency === 'MONTHLY' || input.frequency === 'QUARTERLY') {
    const step = input.frequency === 'MONTHLY' ? 1 : 3;
    const f = new Date(first);
    const targetDay = f.getUTCDate();
    for (let i = 0; out.length <= limit; i += step) {
      const total = f.getUTCMonth() + i;
      const y = f.getUTCFullYear() + Math.floor(total / 12);
      const m0 = total % 12;
      const ms = Date.UTC(y, m0, Math.min(targetDay, daysInMonth(y, m0)));
      if (ms > until) break;
      out.push(dayString(ms));
    }
    return out;
  }

  const weekdaySet = new Set(input.weekdays?.length ? input.weekdays : [isoWeekday(first)]);
  const firstMonday = first - (isoWeekday(first) - 1) * MS_DAY;
  for (let ms = first; ms <= until && out.length <= limit; ms += MS_DAY) {
    const wd = isoWeekday(ms);
    if (input.frequency === 'DAILY') {
      if (input.skipWeekends && wd >= 6) continue;
      out.push(dayString(ms));
      continue;
    }
    if (!weekdaySet.has(wd)) continue;
    const weekIndex = Math.floor((ms - firstMonday) / (7 * MS_DAY));
    if (input.frequency === 'BIWEEKLY' && weekIndex % 2 !== 0) continue;
    out.push(dayString(ms));
  }
  return out;
}

/** Tekrarlayan toplantıların UTC başlangıç anları. */
export function generateOccurrences(input: RecurrenceInput, limit = 1000): Date[] {
  return generateOccurrenceDates(input, limit).map((d) => zonedTimeToUtc(d, input.time, input.timeZone));
}

/* ------------------------------ Katılım ------------------------------ */

/**
 * Katılım oranı (%): (KATILDI + GEÇ) / (mazeretli ve henüz kaydedilmemiş olanlar hariç katılımcılar).
 * Payda 0 ise null.
 */
export function attendanceRate(items: { attendance: MeetingAttendance }[]): number | null {
  const counted = items.filter((i) => i.attendance !== 'EXCUSED' && i.attendance !== 'UNKNOWN');
  if (!counted.length) return null;
  const present = counted.filter((i) => i.attendance === 'PRESENT' || i.attendance === 'LATE').length;
  return Math.round((present / counted.length) * 1000) / 10;
}

/** Birden çok toplantının toplu (havuzlanmış) katılım oranı. */
export function pooledAttendanceRate(groups: { attendance: MeetingAttendance }[][]): number | null {
  return attendanceRate(groups.flat());
}

/* ------------------------------ iCalendar ------------------------------ */

const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/** RFC 5545: 75 oktetten uzun satırları katlar. */
function fold(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, 'utf8');
    if (curBytes + b > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = '';
      curBytes = 0;
    }
    cur += ch;
    curBytes += b;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

export interface IcsInput {
  uid: string;
  title: string;
  startAt: Date;
  endAt: Date;
  location?: string | null;
  description?: string | null;
  url?: string | null;
  organizer?: { name: string; email?: string | null } | null;
  attendees?: { name: string; email?: string | null }[];
  cancelled?: boolean;
  now?: Date;
}

export function buildIcs(i: IcsInput): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lean Platform//Meetings//TR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${i.uid}@lean-platform`,
    `DTSTAMP:${icsDate(i.now ?? new Date())}`,
    `DTSTART:${icsDate(i.startAt)}`,
    `DTEND:${icsDate(i.endAt)}`,
    `SUMMARY:${icsEscape(i.title)}`,
    `STATUS:${i.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
  ];
  if (i.location) lines.push(`LOCATION:${icsEscape(i.location)}`);
  if (i.description) lines.push(`DESCRIPTION:${icsEscape(i.description)}`);
  if (i.url) lines.push(`URL:${i.url}`);
  if (i.organizer) lines.push(`ORGANIZER;CN=${icsEscape(i.organizer.name)}:mailto:${i.organizer.email ?? 'no-reply@example.com'}`);
  for (const a of i.attendees ?? []) {
    if (a.email) lines.push(`ATTENDEE;CN=${icsEscape(a.name)};ROLE=REQ-PARTICIPANT:mailto:${a.email}`);
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
