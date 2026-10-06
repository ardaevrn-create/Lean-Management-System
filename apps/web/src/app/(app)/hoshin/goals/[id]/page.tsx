"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, ChevronRight, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import type { HoshinGoalDetail } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import {
  Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, LoadingBlock, PriorityBadge, StatusBadge, Table, TBody, TD, TH, THead, TR, useToast,
} from "@/components/ui";
import { NewActionDialog } from "@/components/actions/new-action-dialog";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { BowlingTable } from "@/components/strategy/bowling-table";
import { CatchballThread } from "@/components/strategy/catchball";
import { GoalDialog } from "@/components/strategy/goal-dialog";
import { AchievementBar, fmtNum, GoalLink, GoalStatusBadge, HOSHIN_KEY, LevelBadge, StatusDot } from "@/components/strategy/strategy-bits";

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <div className="text-sm font-medium text-slate-800">{children}</div>
    </div>
  );
}

export default function HoshinGoalPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [addingAction, setAddingAction] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "cancel" | null>(null);

  const { data: goal, isLoading, error } = useQuery({
    queryKey: [...HOSHIN_KEY, "goal", id],
    queryFn: () => api.get<HoshinGoalDetail>(`/hoshin/goals/${id}`),
  });
  const plan = useQuery({
    queryKey: [...HOSHIN_KEY, "plans"],
    queryFn: () => api.get<{ id: string; name: string; startYear: number; endYear: number; status: "DRAFT" | "ACTIVE" | "ARCHIVED"; version: number }[]>("/hoshin/plans"),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: HOSHIN_KEY });

  const status = useMutation({
    mutationFn: (s: "COMPLETED" | "CANCELLED") => api.post(`/hoshin/goals/${id}/status`, { status: s }),
    onSuccess: () => {
      setConfirm(null);
      refresh();
    },
    onError: toast.error,
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/hoshin/goals/${id}`),
    onSuccess: () => {
      refresh();
      router.push("/hoshin");
    },
    onError: toast.error,
  });

  if (isLoading) return <LoadingBlock />;
  if (error || !goal) return <EmptyState title={t("strategyModule.goal.notFound")} />;
  const planBrief = plan.data?.find((p) => p.id === goal.planId);
  const year = goal.year ?? new Date().getFullYear();
  const label = `${goal.code} ${goal.title}`;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/hoshin" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
          {t("strategyModule.title")}
        </Link>
        {goal.breadcrumb.length > 0 && (
          <nav className="mb-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
            {goal.breadcrumb.map((b) => (
              <span key={b.id} className="inline-flex items-center gap-1">
                <Link href={`/hoshin/goals/${b.id}`} className="hover:text-brand-700 hover:underline">
                  <span className="font-mono">{b.code}</span> {b.title}
                </Link>
                <ChevronRight className="h-3 w-3" />
              </span>
            ))}
          </nav>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900 sm:text-2xl">
              <StatusDot status={goal.progress.status} className="h-4 w-4" />
              <span className="font-mono text-brand-700">{goal.code}</span>
              {goal.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
              <LevelBadge level={goal.level} />
              <GoalStatusBadge status={goal.status} />
              {goal.year && <Badge tone="blue">{goal.year}</Badge>}
              {goal.kpi && (
                <Link href={`/kpi/${goal.kpi.id}`} className="inline-flex">
                  <Badge tone="indigo">KPI: {goal.kpi.code}</Badge>
                </Link>
              )}
            </div>
            {goal.description && <p className="mt-2 max-w-3xl text-sm text-slate-600">{goal.description}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {goal.can.addChild && goal.level !== "INDIVIDUAL" && planBrief && (
              <Button variant="outline" onClick={() => setAddingChild(true)}>
                <Plus className="h-4 w-4" />
                {t("strategyModule.goal.addChildShort")}
              </Button>
            )}
            {goal.can.edit && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
                {t("common.edit")}
              </Button>
            )}
            {goal.can.changeStatus && goal.status === "ACTIVE" && (
              <Button variant="outline" onClick={() => status.mutate("COMPLETED")}>
                <CheckCircle2 className="h-4 w-4" />
                {t("strategyModule.goal.complete")}
              </Button>
            )}
            {goal.can.changeStatus && !["COMPLETED", "CANCELLED"].includes(goal.status) && (
              <Button variant="outline" onClick={() => setConfirm("cancel")}>
                <XCircle className="h-4 w-4" />
                {t("strategyModule.goal.cancel")}
              </Button>
            )}
            {goal.can.edit && goal.childCount === 0 && ["DRAFT", "PROPOSED", "IN_CATCHBALL", "CANCELLED"].includes(goal.status) && (
              <Button variant="outline" onClick={() => setConfirm("delete")}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card>
        <CardBody className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          <Info label={t("strategyModule.field.owner")}>{goal.owner?.fullName ?? "–"}</Info>
          <Info label={t("strategyModule.field.orgUnit")}>{goal.orgUnit?.name ?? "–"}</Info>
          <Info label={t("strategyModule.field.baseline")}>{fmtNum(goal.baseline, goal.unit)}</Info>
          <Info label={t("strategyModule.field.target")}>{fmtNum(goal.targetValue, goal.unit)}</Info>
          <Info label={t("strategyModule.field.weight")}>{goal.weight}</Info>
          <Info label={t("strategyModule.bowling.achievement")}>
            <AchievementBar value={goal.progress.achievement} status={goal.progress.status} />
          </Info>
          <Info label={t("strategyModule.field.objective")}>{goal.objective ? `${goal.objective.code} ${goal.objective.title}` : "–"}</Info>
          <Info label={t("strategyModule.field.direction")}>{t(`strategyModule.direction.${goal.direction}`)}</Info>
          <Info label={t("strategyModule.goal.source")}>{t(`strategyModule.source.${goal.progress.source}`)}</Info>
          <Info label={t("strategyModule.field.startDate")}>{formatDate(goal.startDate, locale)}</Info>
          <Info label={t("strategyModule.field.endDate")}>{formatDate(goal.endDate, locale)}</Info>
          <Info label={t("strategyModule.review.agreedAt")}>{formatDate(goal.agreedAt, locale)}</Info>
        </CardBody>
      </Card>

      {goal.level !== "BREAKTHROUGH" && (
        <Card>
          <CardHeader title={`${t("strategyModule.goal.bowling")} · ${year}`} />
          <BowlingTable rows={[goal.bowling]} year={year} compact />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("strategyModule.goal.children")} />
          {goal.children.length === 0 ? (
            <EmptyState title={t("strategyModule.goal.noChildren")} className="py-8" />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t("strategyModule.bowling.goal")}</TH>
                  <TH>{t("strategyModule.field.owner")}</TH>
                  <TH>{t("strategyModule.bowling.achievement")}</TH>
                  <TH>{t("common.status")}</TH>
                </TR>
              </THead>
              <TBody>
                {goal.children.map((c) => (
                  <TR key={c.id}>
                    <TD><span className="inline-flex items-center gap-2"><StatusDot status={c.progress.status} /><GoalLink id={c.id} code={c.code} title={c.title} /></span></TD>
                    <TD>{c.owner?.fullName ?? "–"}</TD>
                    <TD><AchievementBar value={c.progress.achievement} status={c.progress.status} /></TD>
                    <TD><GoalStatusBadge status={c.status} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title={t("strategyModule.goal.catchball")} />
          <CardBody>
            <CatchballThread goal={goal} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={t("strategyModule.goal.actions")}
          actions={
            <Button size="sm" variant="outline" onClick={() => setAddingAction(true)}>
              <Plus className="h-4 w-4" />
              {t("strategyModule.goal.addAction")}
            </Button>
          }
        />
        {goal.actions.length === 0 ? (
          <EmptyState title={t("strategyModule.offTarget.noActions")} className="py-8" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t("strategyModule.offTarget.actionTitle")}</TH>
                <TH>{t("strategyModule.field.owner")}</TH>
                <TH>{t("strategyModule.offTarget.dueDate")}</TH>
                <TH>{t("strategyModule.offTarget.priority")}</TH>
                <TH>{t("common.status")}</TH>
              </TR>
            </THead>
            <TBody>
              {goal.actions.map((a) => (
                <TR key={a.id}>
                  <TD>
                    <Link href={`/actions/${a.id}`} className="font-medium text-brand-700 hover:underline">
                      <span className="mr-1.5 font-mono text-xs text-slate-500">{a.code}</span>
                      {a.title}
                    </Link>
                    {a.sourceLabel && <p className="text-xs text-slate-500">{a.sourceLabel}</p>}
                  </TD>
                  <TD>{a.owner.fullName}</TD>
                  <TD>{formatDate(a.dueDate, locale)}</TD>
                  <TD><PriorityBadge priority={a.priority} /></TD>
                  <TD><StatusBadge status={a.status} overdue={a.isOverdue} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <AttachmentsPanel entityType="HOSHIN_GOAL" entityId={goal.id} />

      {editing && planBrief && <GoalDialog plan={planBrief} year={year} goal={goal} onClose={() => setEditing(false)} />}
      {addingChild && planBrief && (
        <GoalDialog
          plan={planBrief}
          year={year}
          parent={{ id: goal.id, code: goal.code, title: goal.title, level: goal.level, year: goal.year }}
          onClose={() => setAddingChild(false)}
          onSaved={(cid) => router.push(`/hoshin/goals/${cid}`)}
        />
      )}
      <NewActionDialog
        open={addingAction}
        onClose={() => setAddingAction(false)}
        onCreated={refresh}
        defaults={{ sourceType: "HOSHIN", sourceId: goal.id, sourceLabel: label, orgUnitId: goal.orgUnit?.id }}
      />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => (confirm === "delete" ? remove.mutate() : status.mutate("CANCELLED"))}
        loading={remove.isPending || status.isPending}
        title={confirm === "delete" ? t("common.delete") : t("strategyModule.goal.cancel")}
        message={confirm === "delete" ? t("strategyModule.confirmDelete") : t("strategyModule.goal.cancelConfirm")}
      />
    </div>
  );
}
