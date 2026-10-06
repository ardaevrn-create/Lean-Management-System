"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bell, CalendarClock, ClipboardEdit, FileWarning, Gauge, ListTodo, ShieldCheck } from "lucide-react";
import type { KpiDashboardWidget, MyDashboard } from "@lean/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Card, CardBody, CardHeader, EmptyState, LoadingBlock, PageHeader, PriorityBadge, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { DueDateCell } from "@/components/action-bits";
import { UpcomingMeetingsCard } from "@/components/meetings/upcoming-meetings-card";
import { ProblemsDashboardCard } from "@/components/problems/problems-panels";
import { AuditsDashboardCard } from "@/components/audits/audits-dashboard-card";

function StatCard({ label, value, icon, tone, href }: { label: string; value: number; icon: React.ReactNode; tone: string; href: string }) {
  return (
    <Link href={href}>
      <Card className="transition-shadow hover:shadow-md">
        <CardBody className="flex items-center gap-4">
          <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", tone)}>{icon}</span>
          <div>
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
            <p className="text-sm text-slate-500">{label}</p>
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}

export default function HomePage() {
  const t = useT();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["dashboard", "me"], queryFn: () => api.get<MyDashboard>("/dashboard/me") });
  const kpi = data?.widgets?.kpi as KpiDashboardWidget | undefined;

  return (
    <>
      <PageHeader title={t("home.welcome", { name: user?.fullName.split(" ")[0] ?? "" })} description={t("home.subtitle")} />
      {isLoading || !data ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t("home.openActions")} value={data.actions.open} icon={<ListTodo className="h-5 w-5" />} tone="bg-blue-50 text-blue-600" href="/actions" />
            <StatCard
              label={t("home.overdueActions")}
              value={data.actions.overdue}
              icon={<AlertTriangle className="h-5 w-5" />}
              tone={data.actions.overdue > 0 ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"}
              href="/actions"
            />
            <StatCard label={t("home.dueThisWeek")} value={data.actions.dueThisWeek} icon={<CalendarClock className="h-5 w-5" />} tone="bg-amber-50 text-amber-600" href="/actions" />
            <StatCard label={t("home.unreadNotifications")} value={data.unreadNotifications} icon={<Bell className="h-5 w-5" />} tone="bg-indigo-50 text-indigo-600" href="/" />
          </div>
          {kpi && (
            <div>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Gauge className="h-4 w-4" />
                {t("kpiModule.title")}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label={t("kpiModule.home.toEnter")} value={kpi.toEnter} icon={<ClipboardEdit className="h-5 w-5" />} tone="bg-blue-50 text-blue-600" href="/kpi?tab=entry" />
                <StatCard
                  label={t("kpiModule.home.missing")}
                  value={kpi.missing}
                  icon={<AlertTriangle className="h-5 w-5" />}
                  tone={kpi.missing > 0 ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"}
                  href="/kpi?tab=entry"
                />
                <StatCard
                  label={t("kpiModule.home.deviationsRequired")}
                  value={kpi.deviationsRequired}
                  icon={<FileWarning className="h-5 w-5" />}
                  tone={kpi.deviationsRequired > 0 ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500"}
                  href="/kpi?tab=deviations"
                />
                {kpi.pendingApprovals !== undefined && (
                  <StatCard label={t("kpiModule.home.pendingApprovals")} value={kpi.pendingApprovals} icon={<ShieldCheck className="h-5 w-5" />} tone="bg-indigo-50 text-indigo-600" href="/kpi?tab=deviations" />
                )}
              </div>
            </div>
          )}
          <Card>
            <CardHeader
              title={t("home.upcomingActions")}
              actions={
                <Link href="/actions" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                  {t("common.viewAll")}
                </Link>
              }
            />
            {data.upcomingActions.length === 0 ? (
              <EmptyState title={t("home.noUpcoming")} />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>{t("actions.code")}</TH>
                    <TH>{t("actions.title")}</TH>
                    <TH>{t("actions.status")}</TH>
                    <TH>{t("actions.priority")}</TH>
                    <TH>{t("actions.dueDate")}</TH>
                  </tr>
                </THead>
                <TBody>
                  {data.upcomingActions.map((a) => (
                    <TR key={a.id} className={a.isOverdue ? "bg-red-50/40" : undefined}>
                      <TD className="whitespace-nowrap font-mono text-xs">{a.code}</TD>
                      <TD>
                        <Link href={`/actions/${a.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                          {a.title}
                        </Link>
                      </TD>
                      <TD>
                        <StatusBadge status={a.status} />
                      </TD>
                      <TD>
                        <PriorityBadge priority={a.priority} />
                      </TD>
                      <TD>
                        <DueDateCell action={a} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
          <UpcomingMeetingsCard widget={data.widgets.meetings} />
          <ProblemsDashboardCard widget={data.widgets.problems} />
          <AuditsDashboardCard widget={data.widgets.audits} />
        </div>
      )}
    </>
  );
}
