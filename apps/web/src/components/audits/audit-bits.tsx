"use client";

import { useQuery } from "@tanstack/react-query";
import type { AuditAnswerItem, AuditAreaItem, AuditScaleType, AuditStatus, AuditTemplateItem, EquipmentItem, TagColor, TagStatus } from "@lean/shared";
import { auditScaleMax } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge, Select, type BadgeTone } from "@/components/ui";

export const A = "auditsModule";

/** Skor eşikleri: >=80 yeşil, >=60 sarı, altı kırmızı. */
export function scoreTone(pct: number | null | undefined): BadgeTone {
  if (pct === null || pct === undefined) return "gray";
  return pct >= 80 ? "green" : pct >= 60 ? "amber" : "red";
}
export function scoreHex(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return "#94a3b8";
  return pct >= 80 ? "#059669" : pct >= 60 ? "#d97706" : "#dc2626";
}
export const fmtPct = (pct: number | null | undefined) => (pct === null || pct === undefined ? "–" : `%${pct.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`);

export function ScoreBadge({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) return <span className="text-slate-400">–</span>;
  return <Badge tone={scoreTone(pct)} className="tabular-nums">{fmtPct(pct)}</Badge>;
}

const statusTone: Record<AuditStatus, BadgeTone> = { PLANNED: "gray", IN_PROGRESS: "blue", COMPLETED: "green", CANCELLED: "muted" };

export function AuditStatusBadge({ status, overdue }: { status: AuditStatus; overdue?: boolean }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={statusTone[status]}>{t(`${A}.status.${status}`)}</Badge>
      {overdue && <Badge tone="red">{t(`${A}.overdue`)}</Badge>}
    </span>
  );
}

export function TagColorBadge({ color, short }: { color: TagColor; short?: boolean }) {
  const { t } = useI18n();
  return (
    <Badge tone={color === "RED" ? "red" : "blue"}>
      <span className={cn("h-2 w-2 rounded-full", color === "RED" ? "bg-red-500" : "bg-blue-500")} />
      {t(`${A}.${short ? "tagColorShort" : "tagColor"}.${color}`)}
    </Badge>
  );
}

const tagStatusTone: Record<TagStatus, BadgeTone> = { OPEN: "amber", IN_PROGRESS: "blue", CLOSED: "green", CANCELLED: "muted" };
export function TagStatusBadge({ status, overdue }: { status: TagStatus; overdue?: boolean }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={tagStatusTone[status]}>{t(`${A}.tagStatus.${status}`)}</Badge>
      {overdue && <Badge tone="red">{t(`${A}.overdue`)}</Badge>}
    </span>
  );
}

/* ---------- Veri kancaları ---------- */

export function useAreas(includeInactive = false) {
  return useQuery({
    queryKey: ["audits", "areas", includeInactive],
    queryFn: () => api.get<AuditAreaItem[]>("/audits/areas", includeInactive ? { includeInactive: true } : undefined),
    staleTime: 60_000,
  });
}

export function useEquipment(areaId?: string | null, includeInactive = false) {
  return useQuery({
    queryKey: ["audits", "equipment", areaId ?? "all", includeInactive],
    queryFn: () => api.get<EquipmentItem[]>("/audits/equipment", { areaId: areaId ?? undefined, includeInactive: includeInactive || undefined }),
    staleTime: 60_000,
  });
}

export function useTemplates(includeInactive = false, enabled = true) {
  return useQuery({
    queryKey: ["audits", "templates", includeInactive],
    queryFn: () => api.get<AuditTemplateItem[]>("/audits/templates", includeInactive ? { includeInactive: true } : undefined),
    enabled,
    staleTime: 60_000,
  });
}

export function AreaSelect({ value, onChange, className, placeholder }: { value: string; onChange: (id: string) => void; className?: string; placeholder?: string }) {
  const { t } = useI18n();
  const { data } = useAreas();
  return (
    <Select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder ?? t(`${A}.common.selectArea`)}</option>
      {data?.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </Select>
  );
}

export function EquipmentSelect({ areaId, value, onChange, className }: { areaId: string; value: string; onChange: (id: string) => void; className?: string }) {
  const { t } = useI18n();
  const { data } = useEquipment(areaId || "none");
  return (
    <Select className={className} value={value} disabled={!areaId} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t(`${A}.common.noEquipment`)}</option>
      {areaId &&
        data?.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name} ({e.code})
          </option>
        ))}
    </Select>
  );
}

/* ---------- Anlık skor (istemci tarafı; sunucuyla aynı formül) ---------- */

export function liveScore(answers: Pick<AuditAnswerItem, "sectionTitle" | "sectionWeight" | "weight" | "score">[], scale: AuditScaleType): { pct: number | null; sections: { title: string; pct: number | null }[] } {
  const max = auditScaleMax(scale);
  const order: string[] = [];
  const map = new Map<string, { weight: number; num: number; den: number }>();
  for (const a of answers) {
    let s = map.get(a.sectionTitle);
    if (!s) {
      s = { weight: a.sectionWeight, num: 0, den: 0 };
      map.set(a.sectionTitle, s);
      order.push(a.sectionTitle);
    }
    if (a.score === null || !(a.weight > 0)) continue;
    s.num += a.weight * (Math.min(Math.max(a.score, 0), max) / max);
    s.den += a.weight;
  }
  let num = 0;
  let den = 0;
  const sections = order.map((title) => {
    const s = map.get(title)!;
    if (!s.den) return { title, pct: null };
    const p = s.num / s.den;
    if (s.weight > 0) {
      num += s.weight * p;
      den += s.weight;
    }
    return { title, pct: Math.round(p * 1000) / 10 };
  });
  return { pct: den ? Math.round((num / den) * 1000) / 10 : null, sections };
}

/** Tarihi (YYYY-MM-DD) yerel biçimde gösterir. */
export function fmtDay(d: string | null | undefined, locale: string): string {
  if (!d) return "–";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(locale === "en" ? "en-GB" : "tr-TR");
}

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const addDaysStr = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
