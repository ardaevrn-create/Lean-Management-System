"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Maximize2, Minimize2 } from "lucide-react";
import { periodLabel, type KpiBoardItem, type KpiBoardResponse } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button, Card, CardBody, CardHeader, Checkbox, EmptyState, LoadingBlock, OrgUnitSelect } from "@/components/ui";
import { EntryStateBadge, formatKpiValue, Sparkline, STATUS_STYLE, statusOf, targetText } from "./kpi-bits";

function BoardCard({ item, tv }: { item: KpiBoardItem; tv: boolean }) {
  const { t, locale } = useI18n();
  const cur = item.current;
  const status = cur && cur.value !== null ? statusOf(cur.status) : "NO_TARGET";
  const st = STATUS_STYLE[status];
  return (
    <Link
      href={`/kpi/${item.kpi.id}`}
      className={cn(
        "flex flex-col rounded-xl border-2 p-4 shadow-sm transition-shadow hover:shadow-md",
        tv ? "border-slate-700 bg-slate-800 text-white" : cn("bg-white", st.border),
        tv && status === "GREEN" && "border-emerald-500",
        tv && status === "YELLOW" && "border-amber-400",
        tv && status === "RED" && "border-red-500",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn("truncate font-semibold", tv ? "text-lg" : "text-sm text-slate-900")}>{item.kpi.name}</p>
          <p className={cn("truncate text-xs", tv ? "text-slate-300" : "text-slate-500")}>
            {item.kpi.orgUnit.name} · {cur ? periodLabel(cur.period, locale) : t(`kpiModule.frequency.${item.kpi.frequency}`)}
          </p>
        </div>
        <span className={cn("mt-1 h-3.5 w-3.5 shrink-0 rounded-full", st.dot)} />
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className={cn("font-bold tabular-nums leading-none", tv ? "text-5xl" : "text-3xl", tv ? "text-white" : st.text)}>
          {cur && cur.value !== null ? formatKpiValue(cur.value, item.kpi.decimals, locale) : "–"}
        </span>
        <span className={cn(tv ? "text-lg text-slate-300" : "text-sm text-slate-500")}>{item.kpi.unit}</span>
      </div>
      <p className={cn("mt-1", tv ? "text-base text-slate-300" : "text-xs text-slate-500")}>
        {t("kpiModule.target")}: {targetText(cur?.target ?? null, null, item.kpi, locale)} {cur?.target !== null && cur?.target !== undefined ? item.kpi.unit : ""}
      </p>
      <div className="mt-2">
        <Sparkline points={item.spark} height={tv ? 52 : 36} />
      </div>
      {item.entryState && item.entryState !== "COMPLETE" && item.entryState !== "NOT_DUE" && !tv && (
        <div className="mt-2">
          <EntryStateBadge state={item.entryState} />
        </div>
      )}
    </Link>
  );
}

function Summary({ summary, tv }: { summary: KpiBoardResponse["summary"]; tv: boolean }) {
  const { t } = useI18n();
  const cells = [
    ["GREEN", summary.green],
    ["YELLOW", summary.yellow],
    ["RED", summary.red],
    ["NO_TARGET", summary.noData],
  ] as const;
  return (
    <div className="flex flex-wrap gap-3">
      {cells.map(([s, n]) => (
        <div key={s} className={cn("flex items-center gap-2 rounded-lg border px-3 py-1.5", tv ? "border-slate-600 bg-slate-800 text-white" : "border-slate-200 bg-white")}>
          <span className={cn("h-3 w-3 rounded-full", STATUS_STYLE[s].dot)} />
          <span className={cn("font-semibold tabular-nums", tv ? "text-2xl" : "text-lg")}>{n}</span>
          <span className={cn("text-xs", tv ? "text-slate-300" : "text-slate-500")}>{s === "NO_TARGET" ? t("kpiModule.status.NO_DATA") : t(`kpiModule.status.${s}`)}</span>
        </div>
      ))}
    </div>
  );
}

/** Birim KPI panosu (görsel yönetim): büyük değer, hedef, durum rengi, sparkline; "Tam ekran" TV modu. */
export function BoardTab() {
  const { t, locale } = useI18n();
  const [orgUnitId, setOrgUnitId] = useState<string | null>(null);
  const [includeSub, setIncludeSub] = useState(true);
  const [tv, setTv] = useState(false);
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["kpi", "board", orgUnitId, includeSub],
    queryFn: () => api.get<KpiBoardResponse>("/kpi/board", { orgUnitId: orgUnitId ?? undefined, includeSub }),
    refetchInterval: tv ? 60_000 : false,
  });

  // Tam ekran modunda Esc ile çık; tarayıcı tam ekranını da kullan
  useEffect(() => {
    if (!tv) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setTv(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.requestFullscreen?.().catch(() => undefined);
    const onFs = () => {
      if (!document.fullscreenElement) setTv(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
      document.body.style.overflow = prev;
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    };
  }, [tv]);

  const grid = (
    <>
      {isLoading || !data ? (
        <LoadingBlock />
      ) : data.items.length === 0 ? (
        <EmptyState title={t("kpiModule.board.empty")} />
      ) : (
        <div className={cn("grid gap-4", tv ? "grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4")}>
          {data.items.map((i) => (
            <BoardCard key={i.kpi.id} item={i} tv={tv} />
          ))}
        </div>
      )}
    </>
  );

  const controls = (
    <div className="flex flex-wrap items-center gap-3">
      {!tv && (
        <>
          <div className="w-60">
            <OrgUnitSelect value={orgUnitId} onChange={setOrgUnitId} placeholder={t("kpiModule.allUnits")} />
          </div>
          <Checkbox label={t("kpiModule.board.includeSub")} checked={includeSub} onChange={(e) => setIncludeSub(e.target.checked)} />
        </>
      )}
      <Button variant={tv ? "secondary" : "outline"} className="ml-auto" onClick={() => setTv((v) => !v)}>
        {tv ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        {tv ? t("kpiModule.board.exitFullscreen") : t("kpiModule.board.fullscreen")}
      </Button>
    </div>
  );

  if (tv) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900 p-6 text-white">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold">{data?.orgUnit?.name ?? t("kpiModule.board.allUnits")}</h2>
            <p className="text-sm text-slate-400">
              {t("kpiModule.board.updated", { time: dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString(locale === "en" ? "en-GB" : "tr-TR") : "–" })}
            </p>
          </div>
          {data && <Summary summary={data.summary} tv />}
          {controls}
        </div>
        {grid}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {controls}
      {data && <Summary summary={data.summary} tv={false} />}
      {grid}
    </div>
  );
}

/** Gömülü KPI panosu (ör. toplantı odasında birimin KPI'ları). Kart yoksa hiçbir şey göstermez. */
export function KpiBoardPanel({ orgUnitId, title }: { orgUnitId: string; title: string }) {
  const { t } = useI18n();
  const { data } = useQuery({
    queryKey: ["kpi", "board", orgUnitId, true],
    queryFn: () => api.get<KpiBoardResponse>("/kpi/board", { orgUnitId, includeSub: true }),
  });
  if (!data || data.items.length === 0) return null;
  return (
    <Card>
      <CardHeader
        title={title}
        actions={
          <Link href="/kpi?tab=board" className="text-xs font-medium text-brand-600">
            {t("kpiModule.board.openFull")}
          </Link>
        }
      />
      <CardBody className="space-y-3">
        <Summary summary={data.summary} tv={false} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.items.map((i) => (
            <BoardCard key={i.kpi.id} item={i} tv={false} />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
