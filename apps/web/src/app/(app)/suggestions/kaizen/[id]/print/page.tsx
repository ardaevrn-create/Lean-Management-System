"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { KAIZEN_AFTER_TYPE, KAIZEN_BEFORE_TYPE, type KaizenDetail, type TenantInfo } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { Button, LoadingBlock } from "@/components/ui";
import { AuthImage, money, sKey, useAttachments } from "@/components/suggestions/bits";

/** Tek sayfa A4 "Kaizen kartı": önce/sonra fotoğrafları, kazançlar, ekip. */
const PRINT_CSS = `
@media print {
  aside, header.app-header, nav { display: none !important; }
  [class*="lg:pl-"] { padding-left: 0 !important; }
  main { max-width: none !important; padding: 0 !important; }
  body { background: #fff !important; }
  .print-sheet { box-shadow: none !important; border: none !important; padding: 0 !important; max-width: none !important; }
  .print-avoid-break { break-inside: avoid; }
  @page { size: A4; margin: 10mm; }
}
`;

function PhotoBlock({ type, id, label, tone }: { type: string; id: string; label: string; tone: string }) {
  const { data } = useAttachments(type, id);
  const images = (data ?? []).filter((a) => a.mimeType.startsWith("image/")).slice(0, 2);
  return (
    <div className="print-avoid-break">
      <p className={`mb-1 rounded-t px-2 py-1 text-xs font-bold uppercase tracking-wide text-white ${tone}`}>{label}</p>
      <div className={images.length > 1 ? "grid grid-cols-2 gap-1" : ""}>
        {images.length === 0 && <div className="flex h-44 items-center justify-center border border-dashed border-slate-300 text-xs text-slate-400">—</div>}
        {images.map((a) => (
          <AuthImage key={a.id} attachmentId={a.id} alt={label} className="h-44 w-full border border-slate-200 object-contain" />
        ))}
      </div>
    </div>
  );
}

export default function KaizenPrintPage() {
  const { id } = (useParams<{ id: string }>() as { id: string });
  const { t, locale } = useI18n();
  const { data: k, isLoading } = useQuery({ queryKey: sKey("kaizen", id), queryFn: () => api.get<KaizenDetail>(`/suggestions/kaizen/${id}`) });
  const { data: tenant } = useQuery({ queryKey: ["tenant"], queryFn: () => api.get<TenantInfo>("/tenant"), staleTime: 5 * 60_000 });
  if (isLoading || !k) return <LoadingBlock />;

  const cell = "border border-slate-300 px-2 py-1 align-top text-[11px]";
  const head = `${cell} bg-slate-100 text-left font-semibold`;
  const h = "mb-1 border-b border-slate-300 text-[11px] font-semibold uppercase tracking-wide text-slate-700";

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
        <Link href={`/suggestions/kaizen/${k.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
          {t("suggestionsModule.detail.back")}
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          {t("suggestionsModule.kaizen.printCard")}
        </Button>
      </div>

      <article className="print-sheet mx-auto max-w-[210mm] space-y-3 rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm">
        <header className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-2">
          <div>
            <p className="text-base font-bold">{tenant?.name ?? ""}</p>
            <p className="text-xs text-slate-600">{t("suggestionsModule.kaizen.cardTitle")} · {t(`suggestionsModule.kaizenType.${k.type}`)}</p>
          </div>
          <div className="text-right text-xs text-slate-600">
            <p className="font-mono text-sm font-semibold text-slate-900">{k.code}</p>
            <p>{t(`suggestionsModule.kaizenStatus.${k.status}`)}</p>
          </div>
        </header>

        <h1 className="text-xl font-bold">{k.title}</h1>
        <table className="w-full text-[11px]">
          <tbody>
            <tr>
              <td className="w-24 py-0.5 font-medium text-slate-600">{t("suggestionsModule.form.area")}</td><td className="py-0.5">{k.orgUnit?.name ?? "—"}</td>
              <td className="w-24 py-0.5 font-medium text-slate-600">{t("suggestionsModule.kaizen.leader")}</td><td className="py-0.5">{k.leader.fullName}</td>
            </tr>
            <tr>
              <td className="py-0.5 font-medium text-slate-600">{t("suggestionsModule.kaizen.start")}</td><td className="py-0.5">{formatDate(k.startDate, locale)} – {formatDate(k.endDate, locale)}</td>
              <td className="py-0.5 font-medium text-slate-600">{t("suggestionsModule.kaizen.team")}</td><td className="py-0.5">{k.members.map((m) => m.fullName).join(", ") || "—"}</td>
            </tr>
          </tbody>
        </table>

        <div className="grid grid-cols-2 gap-3">
          <PhotoBlock type={KAIZEN_BEFORE_TYPE} id={k.id} label={t("suggestionsModule.kaizen.before")} tone="bg-red-600" />
          <PhotoBlock type={KAIZEN_AFTER_TYPE} id={k.id} label={t("suggestionsModule.kaizen.after")} tone="bg-emerald-600" />
          <p className="whitespace-pre-wrap text-[11px]">{k.beforeDescription}</p>
          <p className="whitespace-pre-wrap text-[11px]">{k.afterDescription}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 print-avoid-break">
          <section><h2 className={h}>{t("suggestionsModule.kaizen.problem")}</h2><p className="whitespace-pre-wrap text-[11px]">{k.problem}</p></section>
          <section><h2 className={h}>{t("suggestionsModule.kaizen.rootCause")}</h2><p className="whitespace-pre-wrap text-[11px]">{k.rootCause ?? "—"}</p></section>
          <section><h2 className={h}>{t("suggestionsModule.kaizen.standardization")}</h2><p className="whitespace-pre-wrap text-[11px]">{k.standardization ?? "—"}</p></section>
          <section><h2 className={h}>{t("suggestionsModule.kaizen.deployment")}</h2><p className="whitespace-pre-wrap text-[11px]">{k.horizontalDeployment ?? "—"}</p></section>
        </div>

        <section className="print-avoid-break">
          <h2 className={h}>{t("suggestionsModule.gains.title")}</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={head}>{t("suggestionsModule.gains.type")}</th>
                <th className={head}>{t("suggestionsModule.gains.metric")}</th>
                <th className={head}>{t("common.description")}</th>
                <th className={head}>{t("suggestionsModule.gains.before")}</th>
                <th className={head}>{t("suggestionsModule.gains.after")}</th>
                <th className={`${head} text-right`}>{t("suggestionsModule.kaizen.annualSaving")}</th>
              </tr>
            </thead>
            <tbody>
              {k.gains.map((g) => (
                <tr key={g.id}>
                  <td className={cell}>{t(`suggestionsModule.gainType.${g.type}`)}</td>
                  <td className={cell}>{t(`suggestionsModule.metric.${g.metric}`)}</td>
                  <td className={cell}>{g.description}</td>
                  <td className={cell}>{g.beforeValue ?? "—"}</td>
                  <td className={cell}>{g.afterValue ?? "—"}</td>
                  <td className={`${cell} text-right`}>{g.type === "TANGIBLE" ? `${money(g.annualSaving, locale)}${g.financeApproved ? " ✓" : ""}` : "—"}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={5} className={`${cell} text-right font-semibold`}>{t("suggestionsModule.gains.total")}</td>
                <td className={`${cell} text-right font-semibold`}>{money(k.totalAnnualSaving, locale)}</td>
              </tr>
              <tr>
                <td colSpan={5} className={`${cell} text-right`}>{t("suggestionsModule.gains.approvedTotal")}</td>
                <td className={`${cell} text-right`}>{money(k.approvedAnnualSaving, locale)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <footer className="grid grid-cols-3 gap-3 pt-6 text-center text-[11px] text-slate-600">
          <div className="border-t border-slate-400 pt-1">{t("suggestionsModule.kaizen.leader")}<br /><b>{k.leader.fullName}</b></div>
          <div className="border-t border-slate-400 pt-1">{t("suggestionsModule.kaizen.approvedBy")}<br /><b>{k.approvedBy?.fullName ?? ""}</b></div>
          <div className="border-t border-slate-400 pt-1">{t("suggestionsModule.gains.finance")}<br /><b>{k.gains.find((g) => g.financeApprovedBy)?.financeApprovedBy?.fullName ?? ""}</b></div>
        </footer>
      </article>
    </>
  );
}
