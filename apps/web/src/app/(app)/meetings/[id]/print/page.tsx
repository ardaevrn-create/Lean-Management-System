"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import type { ActionListItem, MeetingCarriedAction, MeetingDetail, TenantInfo } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button, LoadingBlock } from "@/components/ui";
import { fmtDate, fmtDateOnly, fmtDateTime, fmtLongDate, fmtTime, useTenantTz } from "@/components/meetings/meeting-bits";

/** Sayfa düzeni (kenar çubuğu/üst çubuk) yazdırmada gizlenir; kullanıcı "PDF olarak kaydet" ile tutanağı alır. */
const PRINT_CSS = `
@media print {
  aside, header { display: none !important; }
  [class*="lg:pl-"] { padding-left: 0 !important; }
  main { max-width: none !important; padding: 0 !important; }
  body { background: #fff !important; }
  .print-sheet { box-shadow: none !important; border: none !important; padding: 0 !important; max-width: none !important; }
  .print-avoid-break { break-inside: avoid; }
  @page { size: A4; margin: 14mm; }
}
`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="print-avoid-break mt-6">
      <h2 className="mb-2 border-b border-slate-300 pb-1 text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h2>
      {children}
    </section>
  );
}

export default function MeetingPrintPage() {
  const { id } = (useParams<{ id: string }>() as { id: string });
  const { t, locale } = useI18n();
  const tz = useTenantTz();
  const { data: m, isLoading } = useQuery({ queryKey: ["meetings", "detail", id], queryFn: () => api.get<MeetingDetail>(`/meetings/${id}`) });
  const { data: actions } = useQuery({ queryKey: ["meetings", "actions", id], queryFn: () => api.get<ActionListItem[]>(`/meetings/${id}/actions`) });
  const { data: carried } = useQuery({ queryKey: ["meetings", "carried", id], queryFn: () => api.get<MeetingCarriedAction[]>(`/meetings/${id}/carried-actions`) });
  const { data: tenant } = useQuery({ queryKey: ["tenant"], queryFn: () => api.get<TenantInfo>("/tenant"), staleTime: 5 * 60_000 });

  if (isLoading || !m) return <LoadingBlock />;

  const cell = "border border-slate-300 px-2 py-1 align-top text-xs";
  const head = `${cell} bg-slate-100 text-left font-semibold`;

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
        <Link href={`/meetings/${m.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
          {t("meetingsModule.print.back")}
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-slate-500 sm:inline">{t("meetingsModule.print.hint")}</span>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            {t("meetingsModule.print.button")}
          </Button>
        </div>
      </div>

      <article className="print-sheet mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm sm:p-10">
        <header className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-3">
          <div>
            <p className="text-lg font-bold">{tenant?.name ?? ""}</p>
            <p className="text-sm text-slate-600">{t("meetingsModule.print.docTitle")}</p>
          </div>
          <div className="text-right text-xs text-slate-600">
            <p className="font-mono text-sm font-semibold text-slate-900">{m.code}</p>
            <p>{t("meetingsModule.print.printedAt")}: {fmtDateTime(new Date().toISOString(), tz, locale)}</p>
          </div>
        </header>

        <h1 className="mt-4 text-2xl font-bold">{m.title}</h1>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {[
              [t("meetingsModule.type"), m.type ? `${m.type.name}${m.type.tier ? ` (Tier ${m.type.tier})` : ""}` : "—"],
              [t("meetingsModule.when.dateTime"), `${fmtLongDate(m.startAt, tz, locale)}, ${fmtTime(m.startAt, tz, locale)} – ${fmtTime(m.endAt, tz, locale)}`],
              [t("meetingsModule.location"), [m.location, m.onlineUrl].filter(Boolean).join(" / ") || "—"],
              [t("meetingsModule.organizer"), m.organizer.fullName],
              [t("meetingsModule.orgUnit"), m.orgUnit?.name ?? "—"],
              [t("common.status"), t(`meetingsModule.status.${m.status}`)],
              ...(m.attendanceRate !== null ? [[t("meetingsModule.stats.attendanceRate"), `%${m.attendanceRate}`]] : []),
            ].map(([k, v]) => (
              <tr key={k}>
                <td className="w-40 py-0.5 pr-3 align-top font-medium text-slate-600">{k}</td>
                <td className="py-0.5">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Section title={t("meetingsModule.participants")}>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={head}>{t("common.name")}</th>
                <th className={head}>{t("meetingsModule.print.role")}</th>
                <th className={head}>{t("meetingsModule.room.attendance")}</th>
              </tr>
            </thead>
            <tbody>
              {m.participants.map((p) => (
                <tr key={p.userId}>
                  <td className={cell}>{p.user.fullName}</td>
                  <td className={cell}>{t(`meetingsModule.roles.${p.role}`)}</td>
                  <td className={cell}>{t(`meetingsModule.attendance.${p.attendance}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {m.guests.length > 0 && (
            <p className="mt-1 text-xs text-slate-600">
              {t("meetingsModule.guests")}: {m.guests.join(", ")}
            </p>
          )}
        </Section>

        <Section title={t("meetingsModule.agenda")}>
          <ol className="space-y-3">
            {m.agenda.map((a, i) => (
              <li key={a.id} className="print-avoid-break text-sm">
                <p className="font-semibold">
                  {i + 1}. {a.title}
                  {a.presenter && <span className="ml-2 text-xs font-normal text-slate-500">({a.presenter.fullName})</span>}
                </p>
                {a.discussion ? <p className="mt-0.5 whitespace-pre-wrap pl-4 text-slate-700">{a.discussion}</p> : <p className="pl-4 text-xs text-slate-400">—</p>}
              </li>
            ))}
            {m.agenda.length === 0 && <li className="text-sm text-slate-500">—</li>}
          </ol>
        </Section>

        {m.summary && (
          <Section title={t("meetingsModule.room.minutes")}>
            <p className="whitespace-pre-wrap text-sm">{m.summary}</p>
          </Section>
        )}

        <Section title={t("meetingsModule.room.decisions")}>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {m.decisions.map((d) => (
              <li key={d.id}>{d.text}</li>
            ))}
            {m.decisions.length === 0 && <li className="list-none text-slate-500">—</li>}
          </ol>
        </Section>

        <Section title={t("meetingsModule.room.meetingActions")}>
          {actions && actions.length > 0 ? (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={head}>{t("actions.code")}</th>
                  <th className={head}>{t("actions.title")}</th>
                  <th className={head}>{t("actions.owner")}</th>
                  <th className={head}>{t("actions.dueDate")}</th>
                  <th className={head}>{t("actions.priority")}</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a) => (
                  <tr key={a.id}>
                    <td className={`${cell} font-mono`}>{a.code}</td>
                    <td className={cell}>{a.title}</td>
                    <td className={cell}>{a.owner.fullName}</td>
                    <td className={cell}>{fmtDateOnly(a.dueDate, locale)}</td>
                    <td className={cell}>{t(`priority.${a.priority}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-500">—</p>
          )}
        </Section>

        {carried && carried.length > 0 && (
          <Section title={t("meetingsModule.room.carried")}>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={head}>{t("actions.code")}</th>
                  <th className={head}>{t("actions.title")}</th>
                  <th className={head}>{t("actions.owner")}</th>
                  <th className={head}>{t("actions.dueDate")}</th>
                  <th className={head}>{t("common.status")}</th>
                  <th className={head}>{t("meetingsModule.print.fromMeeting")}</th>
                </tr>
              </thead>
              <tbody>
                {carried.map((a) => (
                  <tr key={a.id}>
                    <td className={`${cell} font-mono`}>{a.code}</td>
                    <td className={cell}>{a.title}</td>
                    <td className={cell}>{a.owner.fullName}</td>
                    <td className={`${cell} ${a.isOverdue ? "font-semibold text-red-700" : ""}`}>
                      {fmtDateOnly(a.dueDate, locale)}
                      {a.isOverdue && ` (${t("actions.overdueDays", { days: a.overdueDays })})`}
                    </td>
                    <td className={cell}>{t(`actionStatus.${a.status}`)}</td>
                    <td className={cell}>
                      {a.meeting.code} · {fmtDate(a.meeting.startAt, tz, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        <footer className="mt-10 grid grid-cols-2 gap-8 text-xs text-slate-600">
          <div className="border-t border-slate-400 pt-1">{t("meetingsModule.organizer")}: {m.organizer.fullName}</div>
          <div className="border-t border-slate-400 pt-1">
            {m.completedAt ? `${t("meetingsModule.print.completedAt")}: ${fmtDateTime(m.completedAt, tz, locale)}` : t(`meetingsModule.status.${m.status}`)}
          </div>
        </footer>
      </article>
    </>
  );
}
