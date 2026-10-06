"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { auditScaleMax, type ActionListItem, type AuditDetail, type TenantInfo } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button, LoadingBlock } from "@/components/ui";
import { A, fmtDay, fmtPct } from "@/components/audits/audit-bits";

/** Sayfa düzeni (kenar çubuğu/üst çubuk) yazdırmada gizlenir; kullanıcı "PDF olarak kaydet" ile raporu alır. */
const PRINT_CSS = `
@media print {
  aside, header { display: none !important; }
  [class*="lg:pl-"] { padding-left: 0 !important; }
  main { max-width: none !important; padding: 0 !important; }
  body { background: #fff !important; }
  .print-avoid-break { break-inside: avoid; }
  @page { size: A4; margin: 14mm; }
}
`;

export default function AuditPrintPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useI18n();
  const { data: audit, isLoading } = useQuery({ queryKey: ["audits", "detail", id], queryFn: () => api.get<AuditDetail>(`/audits/${id}`) });
  const { data: actions } = useQuery({ queryKey: ["audits", "actions", id], queryFn: () => api.get<ActionListItem[]>(`/audits/${id}/actions`) });
  const { data: tenant } = useQuery({ queryKey: ["tenant"], queryFn: () => api.get<TenantInfo>("/tenant"), staleTime: 5 * 60_000 });

  if (isLoading || !audit) return <LoadingBlock />;
  const max = auditScaleMax(audit.scaleType);
  const cell = "border border-slate-300 px-2 py-1 align-top text-xs";
  const head = `${cell} bg-slate-100 text-left font-semibold`;
  const scoreText = (s: number | null) => (s === null ? "–" : audit.scaleType === "YES_NO" ? (s ? t(`${A}.print.yes`) : t(`${A}.audit.no`)) : `${s}/${max}`);
  const sections = [...new Set(audit.answers.map((a) => a.sectionTitle))];
  const actionById = new Map((actions ?? []).map((a) => [a.id, a]));

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
        <Link href={`/audits/${id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" />
          {t(`${A}.print.back`)}
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-slate-500 sm:inline">{t(`${A}.print.hint`)}</span>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            {t(`${A}.audit.print`)}
          </Button>
        </div>
      </div>

      <article className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:border-none print:p-0 print:shadow-none">
        <header className="mb-4 flex items-start justify-between border-b-2 border-slate-800 pb-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">{tenant?.name}</p>
            <h1 className="text-xl font-bold text-slate-900">{t(`${A}.print.title`)}</h1>
            <p className="text-sm text-slate-600">{audit.template.name}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-sm font-semibold">{audit.code}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{fmtPct(audit.scorePct)}</p>
          </div>
        </header>

        <table className="mb-4 w-full border-collapse">
          <tbody>
            <tr>
              <th className={head}>{t(`${A}.common.area`)}</th>
              <td className={cell}>{audit.area.name}</td>
              <th className={head}>{t(`${A}.common.auditor`)}</th>
              <td className={cell}>{audit.auditor.fullName}</td>
            </tr>
            <tr>
              <th className={head}>{t(`${A}.common.orgUnit`)}</th>
              <td className={cell}>{audit.area.orgUnit?.name ?? "–"}</td>
              <th className={head}>{t(`${A}.audit.areaResponsible`)}</th>
              <td className={cell}>{audit.responsible?.fullName ?? "–"}</td>
            </tr>
            <tr>
              <th className={head}>{t(`${A}.audit.equipment`)}</th>
              <td className={cell}>{audit.equipment?.name ?? "–"}</td>
              <th className={head}>{t(`${A}.audit.completedAt`)}</th>
              <td className={cell}>{fmtDay(audit.completedAt, locale)}</td>
            </tr>
          </tbody>
        </table>

        {sections.map((title) => {
          const rows = audit.answers.filter((a) => a.sectionTitle === title);
          const sc = audit.sectionScores.find((s) => s.title === title)?.scorePct ?? null;
          return (
            <section key={title} className="print-avoid-break mb-4">
              <h2 className="mb-1 flex justify-between border-b border-slate-300 pb-1 text-sm font-semibold text-slate-800">
                <span>{title}</span>
                <span className="tabular-nums">
                  {t(`${A}.print.sectionScore`)}: {fmtPct(sc)}
                </span>
              </h2>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={`${head} w-8`}>#</th>
                    <th className={head}>{t(`${A}.print.question`)}</th>
                    <th className={`${head} w-14`}>{t(`${A}.print.score`)}</th>
                    <th className={head}>{t(`${A}.print.comment`)}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a, i) => (
                    <tr key={a.id} className={a.isFinding ? "bg-red-50" : undefined}>
                      <td className={cell}>{i + 1}</td>
                      <td className={cell}>{a.questionText}</td>
                      <td className={`${cell} text-center font-semibold`}>{scoreText(a.score)}</td>
                      <td className={cell}>
                        {a.comment}
                        {a.isFinding && <span className="ml-1 font-semibold text-red-700">[{t(`${A}.print.finding`)}]</span>}
                        {a.actionId && actionById.get(a.actionId) && <span className="block text-slate-500">→ {actionById.get(a.actionId)!.code}: {actionById.get(a.actionId)!.title}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}

        {audit.notes && (
          <section className="print-avoid-break mb-4">
            <h2 className="mb-1 border-b border-slate-300 pb-1 text-sm font-semibold text-slate-800">{t(`${A}.audit.notes`)}</h2>
            <p className="whitespace-pre-wrap text-xs text-slate-700">{audit.notes}</p>
          </section>
        )}

        <div className="mt-10 grid grid-cols-2 gap-10 text-center text-xs text-slate-600">
          <div className="border-t border-slate-400 pt-1">{t(`${A}.print.signAuditor`)}: {audit.auditor.fullName}</div>
          <div className="border-t border-slate-400 pt-1">{t(`${A}.print.signResponsible`)}: {audit.responsible?.fullName ?? ""}</div>
        </div>
        <p className="mt-4 text-right text-[10px] text-slate-400">{t(`${A}.print.generated`, { date: new Date().toLocaleString(locale === "en" ? "en-GB" : "tr-TR") })}</p>
      </article>
    </>
  );
}
