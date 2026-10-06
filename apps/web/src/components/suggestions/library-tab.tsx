"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Search } from "lucide-react";
import { KAIZEN_AFTER_TYPE, KAIZEN_BEFORE_TYPE, KAIZEN_TYPES, type KaizenListItem, type KaizenType, type Paginated } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { Badge, Card, EmptyState, Input, LoadingBlock, OrgUnitSelect, Pagination, Select } from "@/components/ui";
import { FirstImage, money, sKey } from "./bits";

/** Kaizen kütüphanesi (M7-09): yayınlanmış iyi uygulamaların aranabilir galerisi. */
export function LibraryTab() {
  const { t, locale } = useI18n();
  const [q, setQ] = useState("");
  const [type, setType] = useState<KaizenType | "">("");
  const [orgUnitId, setOrgUnitId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const dq = useDebounce(q);
  const params = { q: dq || undefined, type: type || undefined, orgUnitId, page, pageSize: 12 };
  const { data, isLoading } = useQuery({
    queryKey: sKey("kaizen", "library", params),
    queryFn: () => api.get<Paginated<KaizenListItem>>("/suggestions/kaizen/library", params),
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input className="pl-9" placeholder={t("suggestionsModule.library.search")} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <Select className="md:w-48" value={type} onChange={(e) => { setType(e.target.value as KaizenType | ""); setPage(1); }}>
            <option value="">{t("suggestionsModule.kaizen.allTypes")}</option>
            {KAIZEN_TYPES.map((k) => (
              <option key={k} value={k}>{t(`suggestionsModule.kaizenType.${k}`)}</option>
            ))}
          </Select>
          <div className="md:w-56">
            <OrgUnitSelect value={orgUnitId} onChange={(v) => { setOrgUnitId(v); setPage(1); }} placeholder={t("suggestionsModule.allUnits")} />
          </div>
        </div>
      </Card>
      {isLoading || !data ? (
        <LoadingBlock />
      ) : data.items.length === 0 ? (
        <Card><EmptyState icon={<BookOpen className="h-6 w-6" />} title={t("suggestionsModule.library.empty")} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((k) => (
              <Link key={k.id} href={`/suggestions/kaizen/${k.id}`} className="block">
                <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
                  <div className="grid grid-cols-2 gap-px bg-slate-200">
                    <div className="relative">
                      <FirstImage entityType={KAIZEN_BEFORE_TYPE} entityId={k.id} alt={t("suggestionsModule.kaizen.before")} className="aspect-[4/3] w-full" />
                      <span className="absolute left-1.5 top-1.5 rounded bg-red-600/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">{t("suggestionsModule.kaizen.before")}</span>
                    </div>
                    <div className="relative">
                      <FirstImage entityType={KAIZEN_AFTER_TYPE} entityId={k.id} alt={t("suggestionsModule.kaizen.after")} className="aspect-[4/3] w-full" />
                      <span className="absolute left-1.5 top-1.5 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">{t("suggestionsModule.kaizen.after")}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5 p-3">
                    <div className="flex items-center gap-1.5">
                      <Badge tone="indigo">{t(`suggestionsModule.kaizenType.${k.type}`)}</Badge>
                      <span className="font-mono text-xs text-slate-400">{k.code}</span>
                    </div>
                    <h3 className="line-clamp-2 font-semibold text-slate-900">{k.title}</h3>
                    <p className="text-xs text-slate-500">
                      {k.orgUnit?.name ?? "—"} · {k.leader.fullName} · {formatDate(k.publishedAt, locale)}
                    </p>
                    {k.totalAnnualSaving > 0 && (
                      <p className="text-sm font-medium text-emerald-700">
                        {money(k.totalAnnualSaving, locale)} / {t("suggestionsModule.kaizen.perYear")}
                        {k.approvedAnnualSaving > 0 && <span className="ml-1 text-xs font-normal text-slate-500">({t("suggestionsModule.kaizen.financeOk")})</span>}
                      </p>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
          <Card><Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} /></Card>
        </>
      )}
    </div>
  );
}
