"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import type { ProblemActionItem, ProblemReport } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Button, LoadingBlock } from "@/components/ui";
import { FishboneSvg } from "@/components/problems/fishbone-diagram";

/** Sayfa düzeni (kenar çubuğu/üst çubuk) yazdırmada gizlenir. */
const PRINT_CSS = `
@media print {
  aside, header { display: none !important; }
  [class*="lg:pl-"] { padding-left: 0 !important; }
  main { max-width: none !important; padding: 0 !important; }
  body { background: #fff !important; }
  .print-sheet { box-shadow: none !important; border: none !important; padding: 0 !important; max-width: none !important; }
  .print-avoid-break { break-inside: avoid; }
  @page { size: A4; margin: 12mm; }
}
`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="print-avoid-break mt-5">
      <h2 className="mb-2 border-b border-slate-400 pb-1 text-sm font-bold uppercase tracking-wide text-slate-800">{title}</h2>
      {children}
    </section>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr>
      <th className="w-40 border border-slate-300 bg-slate-100 px-2 py-1 text-left text-xs font-semibold align-top">{label}</th>
      <td className="border border-slate-300 px-2 py-1 text-xs whitespace-pre-wrap">{value || "—"}</td>
    </tr>
  );
}

export default function ProblemReportPage() {
  const { id } = (useParams<{ id: string }>() as { id: string });
  const { t, locale } = useI18n();
  const { data, isLoading } = useQuery({ queryKey: ["problems", "report", id], queryFn: () => api.get<ProblemReport>(`/problems/${id}/report`) });
  if (isLoading || !data) return <LoadingBlock />;
  const p = data.problem;
  const eightD = p.method === "EIGHT_D";
  const cell = "border border-slate-300 px-2 py-1 align-top text-xs";
  const head = `${cell} bg-slate-100 text-left font-semibold`;
  const kindActions = (...kinds: string[]) => p.actions.filter((a) => kinds.includes(a.kind));
  const actionTable = (items: ProblemActionItem[]) =>
    items.length === 0 ? (
      <p className="text-xs text-slate-500">{t("problemsModule.report2.none")}</p>
    ) : (
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={head}>{t("problemsModule.code")}</th>
            <th className={head}>{t("problemsModule.actions.title2")}</th>
            <th className={head}>{t("problemsModule.actions.ownerLabel")}</th>
            <th className={head}>{t("problemsModule.orgUnit")}</th>
            <th className={head}>{t("problemsModule.actions.due")}</th>
            <th className={head}>{t("common.status")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ action: a, kind }) => (
            <tr key={a.id}>
              <td className={cell}>{a.code}</td>
              <td className={cell}>
                {a.title}
                {kind === "HORIZONTAL" || kind === "PREVENTIVE" ? <span className="text-slate-500"> ({t(`problemsModule.kind.${kind}`)})</span> : null}
              </td>
              <td className={cell}>{a.owner.fullName}</td>
              <td className={cell}>{a.orgUnit?.name ?? "—"}</td>
              <td className={cell}>{formatDate(a.dueDate, locale)}</td>
              <td className={cell}>{t(`actionStatus.${a.status}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );

  const analysis = (
    <>
      <div className="print-avoid-break">
        <h3 className="mb-1 text-xs font-semibold">{t("problemsModule.report2.fishbone")}</h3>
        <FishboneSvg title={p.title} causes={p.causes} />
      </div>
      <div className="mt-3 space-y-3">
        <h3 className="text-xs font-semibold">{t("problemsModule.report2.chains")}</h3>
        {p.whyChains.length === 0 && <p className="text-xs text-slate-500">{t("problemsModule.report2.none")}</p>}
        {p.whyChains.map((c) => (
          <div key={c.id} className="print-avoid-break border border-slate-300 p-2">
            <p className="text-xs font-semibold">
              {t(`problemsModule.category.${c.causeCategory}`)}: {c.causeText}
            </p>
            <ol className="ml-4 mt-1 list-decimal text-xs">
              {c.steps.map((s) => (
                <li key={s.order}>{s.answer}</li>
              ))}
            </ol>
            <p className="mt-1 text-xs">
              <strong>{t("problemsModule.why.rootCause")}:</strong> {c.rootCause ?? "—"} {c.confirmed ? "✓" : ""}
            </p>
          </div>
        ))}
      </div>
    </>
  );

  const definition = (
    <table className="w-full border-collapse">
      <tbody>
        <KV label={t("problemsModule.titleField")} value={p.title} />
        <KV label={t("problemsModule.description")} value={p.description} />
        <KV label={t("problemsModule.def.what")} value={p.what} />
        <KV label={t("problemsModule.def.where")} value={p.whereText} />
        <KV label={t("problemsModule.def.when")} value={p.occurredAt ? formatDateTime(p.occurredAt, locale) : null} />
        <KV label={t("problemsModule.def.who")} value={p.who} />
        <KV label={t("problemsModule.def.how")} value={p.how} />
        <KV label={t("problemsModule.def.howMuch")} value={p.howMuch} />
        <KV label={t("problemsModule.def.isNot")} value={p.isNot} />
        {eightD && <KV label={t("problemsModule.def.customer")} value={[p.customerName, p.customerRef].filter(Boolean).join(" / ")} />}
        <KV label={t("problemsModule.def.costImpact")} value={p.costImpact !== null ? p.costImpact.toLocaleString(locale === "en" ? "en-GB" : "tr-TR") : null} />
        <KV label={t("problemsModule.sourceField")} value={`${t(`problemsModule.source.${p.source}`)}${p.sourceLabel ? ` — ${p.sourceLabel}` : ""}`} />
        <KV label={t("problemsModule.severityField")} value={t(`problemsModule.severity.${p.severity}`)} />
      </tbody>
    </table>
  );

  const team = (
    <table className="w-full border-collapse">
      <tbody>
        {data.team.map((m, i) => (
          <tr key={i}>
            <td className={cell}>{m.user.fullName}</td>
            <td className={cell}>{i === 0 ? t("problemsModule.report2.leader") : (m.role ?? "")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const containment = (
    <>
      <p className="whitespace-pre-wrap text-xs">{p.containment || (p.containmentNotNeeded ? `${t("problemsModule.contain.notNeeded")}: ${p.containmentSkipReason ?? ""}` : "—")}</p>
      <div className="mt-2">{actionTable(kindActions("CONTAINMENT"))}</div>
    </>
  );

  const verification = (
    <>
      {p.verifications.length === 0 ? (
        <p className="text-xs text-slate-500">{t("problemsModule.verify.empty")}</p>
      ) : (
        <ul className="text-xs">
          {p.verifications.map((v) => (
            <li key={v.id}>
              {formatDate(v.verifiedAt, locale)} — <strong>{t(`problemsModule.verify.${v.result}`)}</strong> ({v.verifiedBy.fullName}) {v.note}
            </li>
          ))}
        </ul>
      )}
    </>
  );

  const closure = (
    <table className="w-full border-collapse">
      <tbody>
        <KV label={t("problemsModule.report2.status")} value={t(`problemsModule.phase.${p.phase}`)} />
        <KV label={t("problemsModule.report2.closedAt")} value={p.closedAt ? formatDate(p.closedAt, locale) : null} />
        <KV label={t("problemsModule.targetClose")} value={p.targetCloseDate ? formatDate(p.targetCloseDate, locale) : null} />
      </tbody>
    </table>
  );

  const title = eightD ? t("problemsModule.report2.eightD") : p.method === "A3" ? t("problemsModule.report2.a3") : t("problemsModule.report2.basic");

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
        <Link href={`/problems/${p.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
          {t("problemsModule.report2.backToProblem")}
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-slate-500 sm:inline">{t("problemsModule.report2.hint")}</span>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            {t("problemsModule.report2.print")}
          </Button>
        </div>
      </div>

      <article className="print-sheet mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <header className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-3">
          <div>
            <p className="text-xs text-slate-500">{data.company}</p>
            <h1 className="text-xl font-bold text-slate-900">{title}</h1>
            <p className="text-sm text-slate-700">
              <span className="font-mono">{p.code}</span> — {p.title}
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>
              {t("problemsModule.report2.generated")}: {formatDateTime(data.generatedAt, locale)}
            </p>
            <p>
              {t("problemsModule.orgUnit")}: {p.orgUnit.name}
            </p>
          </div>
        </header>

        {eightD ? (
          <>
            <Section title={t("problemsModule.report2.d1")}>{team}</Section>
            <Section title={t("problemsModule.report2.d2")}>{definition}</Section>
            <Section title={t("problemsModule.report2.d3")}>{containment}</Section>
            <Section title={t("problemsModule.report2.d4")}>{analysis}</Section>
            <Section title={t("problemsModule.report2.d5")}>{actionTable(kindActions("CORRECTIVE"))}</Section>
            <Section title={t("problemsModule.report2.d6")}>{verification}</Section>
            <Section title={t("problemsModule.report2.d7")}>{actionTable(kindActions("PREVENTIVE", "HORIZONTAL"))}</Section>
            <Section title={t("problemsModule.report2.d8")}>{closure}</Section>
          </>
        ) : (
          <>
            <Section title={t("problemsModule.def.title")}>{definition}</Section>
            <Section title={t("problemsModule.def.team")}>{team}</Section>
            <Section title={t("problemsModule.contain.title")}>{containment}</Section>
            <Section title={t("problemsModule.fish.title")}>{analysis}</Section>
            <Section title={t("problemsModule.actions.title")}>{actionTable(kindActions("CORRECTIVE", "PREVENTIVE", "HORIZONTAL"))}</Section>
            <Section title={t("problemsModule.verify.title")}>{verification}</Section>
            <Section title={t("problemsModule.report2.status")}>{closure}</Section>
          </>
        )}
      </article>
    </>
  );
}
