"use client";

import { Plus, Star } from "lucide-react";
import { PROBLEM_CAUSE_CATEGORIES, type ProblemCauseCategory, type ProblemCauseItem } from "@lean/shared";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CATEGORY_COLORS } from "./problem-bits";

interface Row { cause: ProblemCauseItem; depth: number }

function rowsFor(causes: ProblemCauseItem[], category: ProblemCauseCategory): Row[] {
  const inCat = causes.filter((c) => c.category === category);
  const roots = inCat.filter((c) => !c.parentId);
  const out: Row[] = [];
  const walk = (c: ProblemCauseItem, depth: number) => {
    out.push({ cause: c, depth });
    inCat.filter((x) => x.parentId === c.id).forEach((x) => walk(x, depth + 1));
  };
  roots.forEach((r) => walk(r, 0));
  return out;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Başlığı satırlara böler (SVG metin sarma yok). */
function wrap(text: string, max: number, lines: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max) {
      if (cur) out.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) out.push(cur);
  return out.slice(0, lines).map((l, i, a) => (i === a.length - 1 && out.length > lines ? clip(l + "…", max) : l));
}

const TOP: ProblemCauseCategory[] = ["MAN", "MACHINE", "METHOD"];
const BOTTOM: ProblemCauseCategory[] = ["MATERIAL", "MEASUREMENT", "ENVIRONMENT"];
const SX = [300, 570, 840];
const ROW_H = 20;
const W = 1100;

export interface FishboneProps {
  title: string;
  causes: ProblemCauseItem[];
  /** Verilirse etkileşimli: kemik "+" ve neden tıklamaları */
  onAdd?: (category: ProblemCauseCategory) => void;
  onSelect?: (cause: ProblemCauseItem) => void;
}

/** SVG balık kılçığı: sağda problem başlığı (baş), 6 kemik, nedenler ve girintili alt nedenler. */
export function FishboneSvg({ title, causes, onAdd, onSelect }: FishboneProps) {
  const t = useT();
  const rows = Object.fromEntries(PROBLEM_CAUSE_CATEGORIES.map((c) => [c, rowsFor(causes, c)])) as Record<ProblemCauseCategory, Row[]>;
  const maxRows = Math.max(3, ...PROBLEM_CAUSE_CATEGORIES.map((c) => rows[c].length));
  const half = 30 + 30 + maxRows * ROW_H + 24;
  const H = half * 2;
  const mid = half;
  const interactive = !!onAdd;

  const bone = (category: ProblemCauseCategory, i: number, top: boolean) => {
    const col = CATEGORY_COLORS[category];
    const sx = SX[i];
    const outerY = top ? 30 : H - 30;
    const ox = sx - 70;
    const xAt = (y: number) => ox + (70 * (y - outerY)) / (mid - outerY);
    const list = rows[category];
    return (
      <g key={category}>
        <line x1={ox} y1={outerY} x2={sx} y2={mid} stroke={col.stroke} strokeWidth={3} strokeLinecap="round" />
        <g
          role={interactive ? "button" : undefined}
          tabIndex={interactive ? 0 : undefined}
          aria-label={interactive ? `${t("problemsModule.fish.addCause")}: ${t(`problemsModule.category.${category}`)}` : undefined}
          className={interactive ? "cursor-pointer" : undefined}
          onClick={() => onAdd?.(category)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onAdd?.(category)}
        >
          <rect x={ox - 55} y={top ? outerY - 28 : outerY + 2} width={130} height={26} rx={6} fill={col.fill} stroke={col.stroke} />
          <text x={ox + 10} y={top ? outerY - 10 : outerY + 20} textAnchor="middle" fontSize={13} fontWeight={700} fill={col.text}>
            {t(`problemsModule.category.${category}`)}
          </text>
          {interactive && (
            <g>
              <circle cx={ox + 85} cy={top ? outerY - 15 : outerY + 15} r={10} fill={col.stroke} />
              <text x={ox + 85} y={top ? outerY - 10.5 : outerY + 19.5} textAnchor="middle" fontSize={15} fontWeight={700} fill="#fff">
                +
              </text>
            </g>
          )}
        </g>
        {list.map((r, idx) => {
          const y = top ? 30 + 30 + idx * ROW_H : H - 30 - 30 - idx * ROW_H;
          const bx = xAt(y);
          const textX = bx - 12 - r.depth * 14;
          return (
            <g
              key={r.cause.id}
              role={onSelect ? "button" : undefined}
              tabIndex={onSelect ? 0 : undefined}
              className={onSelect ? "cursor-pointer" : undefined}
              onClick={() => onSelect?.(r.cause)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect?.(r.cause)}
            >
              <title>{r.cause.text}</title>
              <line x1={textX + 4} y1={y + 3} x2={bx} y2={y + 3} stroke={col.stroke} strokeWidth={1.2} />
              <text x={textX} y={y} textAnchor="end" fontSize={r.depth ? 10.5 : 11.5} fill="#1e293b" fontStyle={r.depth ? "italic" : "normal"}>
                {r.cause.isCandidate && (
                  <tspan fill="#d97706" fontWeight={700}>
                    {"★ "}
                  </tspan>
                )}
                {clip(r.cause.text, r.depth ? 30 : 34)}
              </text>
            </g>
          );
        })}
        {list.length === 0 && interactive && (
          <text x={xAt(top ? 70 : H - 70) - 12} y={top ? 70 : H - 70} textAnchor="end" fontSize={10.5} fill="#94a3b8">
            {t("problemsModule.fish.empty")}
          </text>
        )}
      </g>
    );
  };

  const headLines = wrap(title, 17, 5);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t("problemsModule.fish.title")}>
      <line x1={10} y1={mid} x2={880} y2={mid} stroke="#334155" strokeWidth={4} strokeLinecap="round" />
      <path d={`M 872 ${mid - 9} L 886 ${mid} L 872 ${mid + 9} Z`} fill="#334155" />
      {TOP.map((c, i) => bone(c, i, true))}
      {BOTTOM.map((c, i) => bone(c, i, false))}
      <rect x={886} y={mid - 70} width={206} height={140} rx={10} fill="#fff7ed" stroke="#ea580c" strokeWidth={2} />
      <text x={989} y={mid - 50} textAnchor="middle" fontSize={11} fontWeight={700} fill="#9a3412">
        {t("problemsModule.fish.head").toUpperCase()}
      </text>
      {headLines.map((l, i) => (
        <text key={i} x={989} y={mid - 28 + i * 18} textAnchor="middle" fontSize={13} fontWeight={600} fill="#1e293b">
          {l}
        </text>
      ))}
    </svg>
  );
}

/** Dar ekranlar için 6 yığılmış kategori kartı. */
export function FishboneCards({ causes, onAdd, onSelect }: Omit<FishboneProps, "title">) {
  const t = useT();
  return (
    <div className="grid gap-3">
      {PROBLEM_CAUSE_CATEGORIES.map((category) => {
        const col = CATEGORY_COLORS[category];
        const list = rowsFor(causes, category);
        return (
          <div key={category} className="rounded-lg border bg-white" style={{ borderColor: col.stroke }}>
            <div className="flex items-center justify-between rounded-t-lg px-3 py-2" style={{ background: col.fill, color: col.text }}>
              <span className="text-sm font-bold">{t(`problemsModule.category.${category}`)}</span>
              {onAdd && (
                <button
                  type="button"
                  onClick={() => onAdd(category)}
                  className="inline-flex h-8 items-center gap-1 rounded-md bg-white/70 px-2 text-xs font-medium hover:bg-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("problemsModule.fish.addCause")}
                </button>
              )}
            </div>
            <ul className="divide-y divide-slate-100">
              {list.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">{t("problemsModule.fish.empty")}</li>}
              {list.map((r) => (
                <li key={r.cause.id}>
                  <button
                    type="button"
                    disabled={!onSelect}
                    onClick={() => onSelect?.(r.cause)}
                    className={cn("flex w-full items-start gap-2 px-3 py-2 text-left text-sm", onSelect && "hover:bg-slate-50")}
                    style={{ paddingLeft: 12 + r.depth * 16 }}
                  >
                    <Star className={cn("mt-0.5 h-4 w-4 shrink-0", r.cause.isCandidate ? "fill-amber-400 text-amber-500" : "text-slate-300")} />
                    <span className={cn("min-w-0 break-words", r.depth > 0 && "text-slate-600")}>{r.cause.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
