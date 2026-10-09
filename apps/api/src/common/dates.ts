/** Yalnız tarih (saat yok) karşılaştırmaları için UTC gün başlangıcı. */
export function startOfUtcDay(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

export function diffDays(later: Date, earlier: Date): number {
  return Math.round((startOfUtcDay(later).getTime() - startOfUtcDay(earlier).getTime()) / 86_400_000);
}

export function toDateOnlyString(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}
