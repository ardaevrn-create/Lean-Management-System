"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, FileText } from "lucide-react";
import type { ProblemPhase } from "@lean/shared";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Badge, Button, Card, CardBody, CardHeader, LoadingBlock, Tabs } from "@/components/ui";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { PhaseBadge, SeverityBadge, useProblem } from "@/components/problems/problem-bits";
import { ContainmentSection, DefinitionSection } from "@/components/problems/problem-definition";
import { ActionsSection, VerificationSection } from "@/components/problems/problem-actions";
import { RootCauseSection } from "@/components/problems/problem-root-cause";
import { PhasePanel } from "@/components/problems/problem-phase-panel";

type TabKey = "DEFINITION" | "CONTAINMENT" | "ROOT_CAUSE" | "ACTIONS" | "VERIFICATION" | "HISTORY";
const tabFor = (p: ProblemPhase): TabKey => (p === "CLOSED" ? "VERIFICATION" : p === "CANCELLED" ? "HISTORY" : p);

export default function ProblemDetailPage() {
  const { id } = (useParams<{ id: string }>() as { id: string });
  const { t, locale } = useI18n();
  const { data: problem, isLoading, error } = useProblem(id);
  const [tab, setTab] = useState<TabKey | null>(null);
  const initial = useRef(false);

  useEffect(() => {
    if (problem && !initial.current) {
      initial.current = true;
      setTab(tabFor(problem.phase));
    }
  }, [problem]);

  if (isLoading) return <LoadingBlock />;
  if (error || !problem) return <p className="py-12 text-center text-sm text-slate-500">{t("problemsModule.empty")}</p>;
  const active = tab ?? tabFor(problem.phase);
  const tabs = (["DEFINITION", "CONTAINMENT", "ROOT_CAUSE", "ACTIONS", "VERIFICATION", "HISTORY"] as TabKey[]).map((k) => ({
    value: k,
    label: t(`problemsModule.detail.tabs.${k}`),
  }));

  return (
    <div className="space-y-4">
      <Link href="/problems" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" />
        {t("problemsModule.back")}
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs text-slate-500">{problem.code}</p>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{problem.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PhaseBadge phase={problem.phase} />
            <SeverityBadge severity={problem.severity} />
            <Badge tone="gray">{t(`problemsModule.method.${problem.method}`)}</Badge>
            {problem.overdue && (
              <Badge tone="red">
                <AlertTriangle className="h-3 w-3" />
                {t("problemsModule.overdueDays", { n: problem.overdueDays })}
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {problem.orgUnit.name} · {t("problemsModule.owner")}: {problem.owner.fullName} · {t("problemsModule.reporter")}: {problem.reportedBy.fullName} ·{" "}
            {t(`problemsModule.source.${problem.source}`)}
            {problem.sourceLabel && ` (${problem.sourceLabel})`} · {formatDate(problem.createdAt, locale)}
          </p>
        </div>
        <Link href={`/problems/${problem.id}/report`}>
          <Button variant="outline">
            <FileText className="h-4 w-4" />
            {t("problemsModule.detail.report")}
          </Button>
        </Link>
      </div>

      {problem.phase === "CANCELLED" && (
        <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{t("problemsModule.detail.cancelledBanner", { reason: problem.cancelReason ?? "" })}</div>
      )}
      {problem.phase === "CLOSED" && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{t("problemsModule.detail.closedBanner")}</div>}
      {!problem.can.edit && problem.phase !== "CLOSED" && problem.phase !== "CANCELLED" && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t("problemsModule.detail.readOnly")}</div>
      )}

      <PhasePanel problem={problem} onSelect={(p) => setTab(tabFor(p))} />

      <Tabs tabs={tabs} value={active} onChange={setTab} />
      {active === "DEFINITION" && <DefinitionSection problem={problem} />}
      {active === "CONTAINMENT" && <ContainmentSection problem={problem} />}
      {active === "ROOT_CAUSE" && <RootCauseSection problem={problem} />}
      {active === "ACTIONS" && <ActionsSection problem={problem} />}
      {active === "VERIFICATION" && <VerificationSection problem={problem} />}
      {active === "HISTORY" && (
        <div className="space-y-4">
          <Card>
            <CardHeader title={t("problemsModule.history.title")} />
            <CardBody>
              <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                {problem.history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-600" />
                    <p className="text-sm font-medium text-slate-900">
                      {h.fromPhase ? `${t(`problemsModule.phase.${h.fromPhase}`)} → ` : ""}
                      {t(`problemsModule.phase.${h.toPhase}`)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {h.user.fullName} · {formatDateTime(h.createdAt, locale)}
                    </p>
                    {h.note && <p className="mt-0.5 text-sm text-slate-600">{h.note}</p>}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
          <AttachmentsPanel entityType="PROBLEM" entityId={problem.id} readOnly={problem.phase === "CANCELLED"} />
        </div>
      )}
    </div>
  );
}
