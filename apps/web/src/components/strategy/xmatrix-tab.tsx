"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, Save } from "lucide-react";
import type { CorrelationRole, CorrelationStrength, CorrelationTargetType, StrategyPlanBrief, XMatrixResponse } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button, Card, EmptyState, LoadingBlock, useToast } from "@/components/ui";
import { HOSHIN_KEY } from "./strategy-bits";

interface Link {
  strength: CorrelationStrength;
  role: CorrelationRole | null;
}
const keyOf = (from: string, type: CorrelationTargetType, target: string) => `${from}|${type}|${target}`;
const SYMBOL: Record<CorrelationStrength, string> = { STRONG: "●", MEDIUM: "○", WEAK: "△" };

/** none → STRONG → MEDIUM → WEAK → none; kullanıcı hücrelerinde sorumlu (R) ve destek (S) döngüleri art arda */
function nextLink(cur: Link | undefined, user: boolean): Link | undefined {
  const order: CorrelationStrength[] = ["STRONG", "MEDIUM", "WEAK"];
  if (!cur) return { strength: "STRONG", role: user ? "RESPONSIBLE" : null };
  const i = order.indexOf(cur.strength);
  if (i < 2) return { strength: order[i + 1], role: cur.role };
  if (user && cur.role === "RESPONSIBLE") return { strength: "STRONG", role: "SUPPORT" };
  return undefined;
}

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .xmatrix-print, .xmatrix-print * { visibility: visible !important; }
  .xmatrix-print { position: absolute; left: 0; top: 0; width: 100%; overflow: visible !important; }
  .xmatrix-noprint { display: none !important; }
  @page { size: A4 landscape; margin: 8mm; }
}
`;

export function XMatrixTab({ plan, year }: { plan: StrategyPlanBrief; year: number }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: [...HOSHIN_KEY, "xmatrix", plan.id, year],
    queryFn: () => api.get<XMatrixResponse>(`/hoshin/plans/${plan.id}/x-matrix`, { year }),
  });
  const [links, setLinks] = useState<Map<string, Link>>(new Map());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!data) return;
    setLinks(new Map(data.correlations.map((c) => [keyOf(c.fromGoalId, c.targetType, c.targetId), { strength: c.strength, role: c.role }])));
    setDirty(false);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api.put<XMatrixResponse>(`/hoshin/plans/${plan.id}/correlations`, {
        year,
        items: [...links.entries()].map(([k, v]) => {
          const [fromGoalId, targetType, targetId] = k.split("|");
          return { fromGoalId, targetType, targetId, strength: v.strength, role: v.role ?? undefined };
        }),
      }),
    onSuccess: () => {
      toast.success(t("common.saved"));
      qc.invalidateQueries({ queryKey: [...HOSHIN_KEY, "xmatrix"] });
    },
    onError: toast.error,
  });

  const grid = useMemo(() => {
    if (!data) return null;
    const A = data.annuals.length;
    const K = data.kpis.length;
    const U = data.owners.length;
    const P = data.priorities.length;
    const B = data.breakthroughs.length;
    return { A, K, U, P, B, cols: A + 1 + K + U, rows: P + 1 + B };
  }, [data]);

  if (isLoading || !data || !grid) return <LoadingBlock />;
  const canEdit = data.can.edit;
  if (grid.A + grid.P + grid.B === 0) return <EmptyState title={t("strategyModule.xmatrix.empty")} description={t("strategyModule.xmatrix.emptyDesc")} />;

  // Izgara konumları (1 tabanlı): kolonlar [annual…][merkez][kpi…][owner…], satırlar [priority…][merkez][breakthrough…]
  const colAnnual = (i: number) => i + 1;
  const colCenter = grid.A + 1;
  const colKpi = (i: number) => grid.A + 2 + i;
  const colOwner = (i: number) => grid.A + 2 + grid.K + i;
  const rowPriority = (i: number) => i + 1;
  const rowCenter = grid.P + 1;
  const rowBreak = (i: number) => grid.P + 2 + i;

  const CELL = 34;
  const CENTER_W = 300;
  const CENTER_H = 230;
  const toggle = (from: string, type: CorrelationTargetType, target: string) => {
    if (!canEdit) return;
    const k = keyOf(from, type, target);
    setLinks((m) => {
      const n = new Map(m);
      const nx = nextLink(n.get(k), type === "USER");
      if (nx) n.set(k, nx);
      else n.delete(k);
      return n;
    });
    setDirty(true);
  };

  const Cell = ({ r, c, from, type, target }: { r: number; c: number; from: string; type: CorrelationTargetType; target: string }) => {
    const l = links.get(keyOf(from, type, target));
    return (
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => toggle(from, type, target)}
        style={{ gridRow: r, gridColumn: c }}
        className={cn(
          "relative flex items-center justify-center border border-slate-300 bg-white text-base leading-none transition-colors",
          canEdit && "hover:bg-brand-50",
          l?.strength === "STRONG" && "text-slate-900",
          l?.strength === "MEDIUM" && "text-slate-700",
          l?.strength === "WEAK" && "text-slate-600",
        )}
        title={l ? `${t(`strategyModule.strength.${l.strength}`)}${l.role ? ` · ${t(`strategyModule.role.${l.role}`)}` : ""}` : undefined}
      >
        {l ? SYMBOL[l.strength] : ""}
        {l?.role && <span className="absolute bottom-0 right-0.5 text-[9px] font-semibold text-slate-500">{t(`strategyModule.roleShort.${l.role}`)}</span>}
      </button>
    );
  };

  const vertical = "flex items-center justify-start border border-slate-300 bg-slate-50 px-1 text-[11px] font-medium text-slate-700 [writing-mode:vertical-rl] rotate-180 overflow-hidden";
  const horiz = "flex items-center border border-slate-300 bg-slate-50 px-2 text-[12px] font-medium text-slate-700 overflow-hidden";
  const label = (code: string, title: string) => `${code} · ${title}`;

  return (
    <div className="space-y-3">
      <style>{PRINT_CSS}</style>
      <div className="xmatrix-noprint flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
          <span>● {t("strategyModule.strength.STRONG")}</span>
          <span>○ {t("strategyModule.strength.MEDIUM")}</span>
          <span>△ {t("strategyModule.strength.WEAK")}</span>
          <span>{t("strategyModule.roleShort.RESPONSIBLE")}: {t("strategyModule.role.RESPONSIBLE")} · {t("strategyModule.roleShort.SUPPORT")}: {t("strategyModule.role.SUPPORT")}</span>
          {canEdit && <span className="text-slate-400">{t("strategyModule.xmatrix.clickHint")}</span>}
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
              <Save className="h-4 w-4" />
              {t("common.save")}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            {t("strategyModule.xmatrix.print")}
          </Button>
        </div>
      </div>

      <Card className="xmatrix-print overflow-x-auto p-3">
        <h3 className="mb-2 hidden text-sm font-semibold print:block">{plan.name} — {t("strategyModule.tabs.xmatrix")} {year}</h3>
        <div
          className="grid w-max"
          style={{
            gridTemplateColumns: `repeat(${grid.A}, ${CELL}px) ${CENTER_W}px repeat(${grid.K + grid.U}, ${CELL}px)`,
            gridTemplateRows: `repeat(${grid.P}, ${CELL}px) ${CENTER_H}px repeat(${grid.B}, ${CELL}px)`,
          }}
        >
          {/* Kuzey: öncelikler (satır etiketleri + köşe hücreleri) */}
          {data.priorities.map((p, ri) => (
            <div key={p.id} style={{ gridRow: rowPriority(ri), gridColumn: colCenter }} className={horiz} title={label(p.code, p.title)}>
              <span className="truncate">{label(p.code, p.title)}</span>
            </div>
          ))}
          {data.priorities.map((p, ri) => (
            <div key={`g-${p.id}`} className="contents">
              {data.annuals.map((a, ci) => (
                <Cell key={a.id} r={rowPriority(ri)} c={colAnnual(ci)} from={p.id} type="GOAL" target={a.id} />
              ))}
              {data.kpis.map((k, ci) => (
                <Cell key={k.id} r={rowPriority(ri)} c={colKpi(ci)} from={p.id} type="KPI" target={k.id} />
              ))}
              {data.owners.map((o, ci) => (
                <Cell key={o.id} r={rowPriority(ri)} c={colOwner(ci)} from={p.id} type="USER" target={o.id} />
              ))}
            </div>
          ))}

          {/* Batı: yıllık hedefler (dikey etiket) */}
          {data.annuals.map((a, ci) => (
            <div key={a.id} style={{ gridRow: rowCenter, gridColumn: colAnnual(ci) }} className={vertical} title={label(a.code, a.title)}>
              <span className="truncate">{label(a.code, a.title)}</span>
            </div>
          ))}

          {/* Merkez: X */}
          <div style={{ gridRow: rowCenter, gridColumn: colCenter }} className="relative border border-slate-400 bg-white">
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <line x1="0" y1="0" x2="100" y2="100" stroke="#64748b" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
              <line x1="100" y1="0" x2="0" y2="100" stroke="#64748b" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="absolute left-1/2 top-1.5 -translate-x-1/2 text-center text-[11px] font-semibold text-slate-700">{t("strategyModule.xmatrix.north")}</span>
            <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-center text-[11px] font-semibold text-slate-700">{t("strategyModule.xmatrix.south")}</span>
            <span className="absolute left-1.5 top-1/2 w-16 -translate-y-1/2 text-[11px] font-semibold leading-tight text-slate-700">{t("strategyModule.xmatrix.west")}</span>
            <span className="absolute right-1.5 top-1/2 w-16 -translate-y-1/2 text-right text-[11px] font-semibold leading-tight text-slate-700">{t("strategyModule.xmatrix.east")}</span>
          </div>

          {/* Doğu: ölçümler, uzak doğu: sorumlular (dikey etiket) */}
          {data.kpis.map((k, ci) => (
            <div key={k.id} style={{ gridRow: rowCenter, gridColumn: colKpi(ci) }} className={vertical} title={`${k.code} · ${k.name}`}>
              <span className="truncate">{k.code} · {k.name}</span>
            </div>
          ))}
          {data.owners.map((o, ci) => (
            <div key={o.id} style={{ gridRow: rowCenter, gridColumn: colOwner(ci) }} className={cn(vertical, "bg-amber-50")} title={o.fullName}>
              <span className="truncate">{o.fullName}</span>
            </div>
          ))}

          {/* Güney: atılım hedefleri */}
          {data.breakthroughs.map((b, ri) => (
            <div key={b.id} className="contents">
              <div style={{ gridRow: rowBreak(ri), gridColumn: colCenter }} className={horiz} title={label(b.code, b.title)}>
                <span className="truncate">{label(b.code, b.title)}</span>
              </div>
              {data.annuals.map((a, ci) => (
                <Cell key={a.id} r={rowBreak(ri)} c={colAnnual(ci)} from={a.id} type="GOAL" target={b.id} />
              ))}
              {data.kpis.map((k, ci) => (
                <Cell key={k.id} r={rowBreak(ri)} c={colKpi(ci)} from={b.id} type="KPI" target={k.id} />
              ))}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
