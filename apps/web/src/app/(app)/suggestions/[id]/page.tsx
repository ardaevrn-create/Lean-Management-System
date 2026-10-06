"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ClipboardCheck, Lightbulb, Pencil, Plus, Star, Undo2, UserCheck } from "lucide-react";
import { PERMISSIONS, SUGGESTION_ATTACHMENT_TYPE, type ActionListItem, type KaizenDetail, type SuggestionDetail } from "@lean/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, DatePicker, Dialog, Field, Input, LoadingBlock, PriorityBadge, StatusBadge, Table, TBody, TD,
  TH, THead, Textarea, TR, UserPicker,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { SourceActionDialog } from "@/components/suggestions/action-dialog";
import { CategoryBadge, money, PhotoPanel, sKey, StatusStepper, SuggestionStatusBadge, useSuggestionSettings } from "@/components/suggestions/bits";
import { EvaluationDialog } from "@/components/suggestions/evaluation-tab";

function EditDialog({ s, open, onClose }: { s: SuggestionDetail; open: boolean; onClose: () => void }) {
  const t = useI18n().t;
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ title: s.title, currentState: s.currentState, proposedState: s.proposedState, expectedBenefit: s.expectedBenefit });
  const save = useMutation({
    mutationFn: () => api.patch<SuggestionDetail>(`/suggestions/${s.id}`, f),
    onSuccess: (d) => {
      qc.setQueryData(sKey("detail", s.id), d);
      qc.invalidateQueries({ queryKey: ["suggestions"] });
      onClose();
    },
    onError: toast.error,
  });
  return (
    <Dialog open={open} onClose={onClose} title={t("common.edit")} size="lg" footer={<><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button loading={save.isPending} onClick={() => save.mutate()}>{t("common.save")}</Button></>}>
      <div className="space-y-3">
        <Field label={t("suggestionsModule.form.title")}><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label={t("suggestionsModule.form.current")}><Textarea rows={3} value={f.currentState} onChange={(e) => setF({ ...f, currentState: e.target.value })} /></Field>
        <Field label={t("suggestionsModule.form.proposed")}><Textarea rows={3} value={f.proposedState} onChange={(e) => setF({ ...f, proposedState: e.target.value })} /></Field>
        <Field label={t("suggestionsModule.form.benefit")}><Textarea rows={2} value={f.expectedBenefit} onChange={(e) => setF({ ...f, expectedBenefit: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

function AssignDialog({ s, open, onClose, onDone }: { s: SuggestionDetail; open: boolean; onClose: () => void; onDone: (d: SuggestionDetail) => void }) {
  const t = useI18n().t;
  const toast = useToast();
  const [user, setUser] = useState<{ id: string; label: string } | null>(s.implementer ? { id: s.implementer.id, label: s.implementer.fullName } : null);
  const [target, setTarget] = useState(s.targetDate ?? "");
  const save = useMutation({
    mutationFn: () => api.post<SuggestionDetail>(`/suggestions/${s.id}/implementer`, { implementerId: user!.id, targetDate: target || null }),
    onSuccess: (d) => {
      onDone(d);
      onClose();
    },
    onError: toast.error,
  });
  return (
    <Dialog open={open} onClose={onClose} title={t("suggestionsModule.detail.assign")} footer={<><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button disabled={!user} loading={save.isPending} onClick={() => save.mutate()}>{t("common.save")}</Button></>}>
      <div className="space-y-3">
        <Field label={t("suggestionsModule.detail.implementer")}>
          <UserPicker value={user?.id} valueLabel={user?.label} clearable={false} onChange={(id, o) => setUser(id ? { id, label: o?.label ?? id } : null)} />
        </Field>
        <Field label={t("suggestionsModule.detail.targetDate")}><DatePicker value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}

export default function SuggestionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { user, hasPermission } = useAuth();
  const { data: settings } = useSuggestionSettings();
  const key = sKey("detail", id);
  const { data: s, isLoading, error } = useQuery({ queryKey: key, queryFn: () => api.get<SuggestionDetail>(`/suggestions/${id}`), retry: false });
  const { data: actions } = useQuery({ queryKey: sKey("actions", id), enabled: !!s, queryFn: () => api.get<ActionListItem[]>(`/suggestions/${id}/actions`) });

  const [evalOpen, setEvalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [implOpen, setImplOpen] = useState(false);
  const [note, setNote] = useState("");

  const apply = (d: SuggestionDetail) => {
    qc.setQueryData(key, d);
    qc.invalidateQueries({ queryKey: ["suggestions"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const post = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post<SuggestionDetail>(`/suggestions/${id}/${path}`, body),
    onSuccess: (d) => {
      apply(d);
      setWithdrawOpen(false);
      setImplOpen(false);
      toast.success(t("common.saved"));
    },
    onError: (e) => {
      setWithdrawOpen(false);
      toast.error(e);
    },
  });
  const convert = useMutation({
    mutationFn: () => api.post<KaizenDetail>(`/suggestions/${id}/kaizen`, {}),
    onSuccess: (k) => router.push(`/suggestions/kaizen/${k.id}`),
    onError: toast.error,
  });

  if (isLoading) return <LoadingBlock />;
  if (!s || error) {
    return (
      <Card><CardBody>
        <p className="mb-3 text-sm text-slate-600">{t("suggestionsModule.detail.notFound")}</p>
        <Link href="/suggestions" className="text-sm font-medium text-brand-600">{t("suggestionsModule.detail.back")}</Link>
      </CardBody></Card>
    );
  }

  const can = s.can;
  const canEval = can.preEvaluate || can.committeeScore || can.decide;
  const isOwner = s.submittedBy.id === user?.id || s.coSubmitters.some((c) => c.id === user?.id);
  const myKaizen = s.kaizenIds.filter((k) => k.status !== "REJECTED");
  const criteria = settings?.criteria ?? [];
  const canMonth = hasPermission(PERMISSIONS.SUGGESTION_MANAGE) && !["REJECTED", "WITHDRAWN"].includes(s.status);

  return (
    <>
      <Link href="/suggestions" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" />
        {t("suggestionsModule.detail.back")}
      </Link>

      <Card className="mb-4">
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-slate-500">{s.code}</span>
                <SuggestionStatusBadge status={s.status} />
                <CategoryBadge category={s.category} />
                {s.fastTrack && <Badge tone="indigo">{t("suggestionsModule.detail.fastTrack")}</Badge>}
                {s.isSuggestionOfMonth && <Badge tone="amber">{t("suggestionsModule.ofMonth")} {s.suggestionMonth}</Badge>}
              </div>
              <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{s.title}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {s.submittedBy.fullName}{s.coSubmitters.length > 0 && ` + ${s.coSubmitters.map((c) => c.fullName).join(", ")}`} · {s.orgUnit?.name ?? "—"} · {formatDate(s.submittedAt, locale)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canEval && (
                <Button onClick={() => setEvalOpen(true)}>
                  <ClipboardCheck className="h-4 w-4" />
                  {t("suggestionsModule.eval.evaluate")}
                </Button>
              )}
              {can.edit && <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" />{t("common.edit")}</Button>}
              {can.withdraw && <Button variant="outline" onClick={() => setWithdrawOpen(true)}><Undo2 className="h-4 w-4" />{t("suggestionsModule.detail.withdraw")}</Button>}
              {(can.manage || (isOwner && s.selfImplementable)) && ["ACCEPTED", "IN_IMPLEMENTATION"].includes(s.status) && (
                <Button variant="outline" onClick={() => setAssignOpen(true)}><UserCheck className="h-4 w-4" />{t("suggestionsModule.detail.assign")}</Button>
              )}
              {isOwner && s.selfImplementable && s.status === "ACCEPTED" && !can.manage && (
                <Button variant="outline" loading={post.isPending} onClick={() => post.mutate({ path: "implementer", body: { implementerId: user!.id } })}>{t("suggestionsModule.detail.implementMyself")}</Button>
              )}
              {can.implement && <Button variant="outline" onClick={() => setActionOpen(true)}><Plus className="h-4 w-4" />{t("suggestionsModule.detail.addAction")}</Button>}
              {can.implement && s.status === "IN_IMPLEMENTATION" && <Button onClick={() => setImplOpen(true)}>{t("suggestionsModule.detail.markImplemented")}</Button>}
              {can.manage && s.status === "IMPLEMENTED" && <Button loading={post.isPending} onClick={() => post.mutate({ path: "close" })}>{t("suggestionsModule.detail.close")}</Button>}
              {can.createKaizen && myKaizen.length === 0 && (
                <Button variant="outline" loading={convert.isPending} onClick={() => convert.mutate()}><Lightbulb className="h-4 w-4" />{t("suggestionsModule.detail.toKaizen")}</Button>
              )}
              {canMonth && (
                <Button variant="outline" onClick={() => post.mutate({ path: "suggestion-of-month", body: { value: !s.isSuggestionOfMonth } })}>
                  <Star className="h-4 w-4" fill={s.isSuggestionOfMonth ? "currentColor" : "none"} />{t("suggestionsModule.ofMonth")}
                </Button>
              )}
            </div>
          </div>
          <StatusStepper status={s.status} />
          {s.revisionNote && s.status === "SUBMITTED" && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800"><b>{t("suggestionsModule.detail.revisionRequested")}:</b> {s.revisionNote}</div>
          )}
          {s.rejectionReason && s.status === "REJECTED" && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800"><b>{t("suggestionsModule.detail.rejectionReason")}:</b> {s.rejectionReason}</div>
          )}
          {s.decisionNote && !["REJECTED"].includes(s.status) && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><b>{t("suggestionsModule.detail.decisionNote")}:</b> {s.decisionNote}</div>
          )}
          {myKaizen.length > 0 && (
            <p className="text-sm text-slate-600">
              {t("suggestionsModule.detail.linkedKaizen")}: {myKaizen.map((k) => (
                <Link key={k.id} href={`/suggestions/kaizen/${k.id}`} className="mr-2 font-medium text-brand-600 hover:underline">{k.code}</Link>
              ))}
            </p>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title={t("suggestionsModule.detail.content")} />
            <CardBody className="space-y-4 text-sm text-slate-700">
              <div><h4 className="mb-1 text-xs font-semibold uppercase text-slate-500">{t("suggestionsModule.form.current")}</h4><p className="whitespace-pre-wrap">{s.currentState}</p></div>
              <div><h4 className="mb-1 text-xs font-semibold uppercase text-slate-500">{t("suggestionsModule.form.proposed")}</h4><p className="whitespace-pre-wrap">{s.proposedState}</p></div>
              <div><h4 className="mb-1 text-xs font-semibold uppercase text-slate-500">{t("suggestionsModule.form.benefit")}</h4><p className="whitespace-pre-wrap">{s.expectedBenefit}</p></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div><p className="text-xs text-slate-500">{t("suggestionsModule.form.cost")}</p><p className="font-medium">{money(s.estimatedCost, locale)}</p></div>
                <div><p className="text-xs text-slate-500">{t("suggestionsModule.form.saving")}</p><p className="font-medium">{money(s.estimatedSaving, locale)}</p></div>
                <div><p className="text-xs text-slate-500">{t("suggestionsModule.score")}</p><p className="font-medium">{s.finalScore ?? s.preScore ?? "—"}</p></div>
                <div><p className="text-xs text-slate-500">{t("suggestionsModule.detail.preEvaluator")}</p><p className="font-medium">{s.preEvaluator?.fullName ?? "—"}</p></div>
              </div>
              {s.implementer && (
                <p>{t("suggestionsModule.detail.implementer")}: <b>{s.implementer.fullName}</b>{s.targetDate && ` · ${t("suggestionsModule.detail.targetDate")}: ${formatDate(s.targetDate, locale)}`}</p>
              )}
              {s.implementationNote && <p>{t("suggestionsModule.detail.implementationNote")}: {s.implementationNote}</p>}
              <PhotoPanel entityType={SUGGESTION_ATTACHMENT_TYPE} entityId={s.id} title={t("suggestionsModule.form.photosTitle")} readOnly={!(can.edit || can.manage || isOwner)} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("suggestionsModule.detail.evaluations")} />
            {s.evaluations.length === 0 ? (
              <CardBody><p className="text-sm text-slate-500">{t("suggestionsModule.detail.noEvaluations")}</p></CardBody>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>{t("suggestionsModule.detail.evaluator")}</TH>
                    <TH>{t("suggestionsModule.detail.stage")}</TH>
                    {criteria.map((c) => (<TH key={c.key} className="text-center" title={c.label}>{c.label.split(/[ /]/)[0]}</TH>))}
                    <TH className="text-right">{t("suggestionsModule.score")}</TH>
                  </tr>
                </THead>
                <TBody>
                  {s.evaluations.map((e) => (
                    <TR key={e.id}>
                      <TD>
                        <p className="font-medium text-slate-900">{e.evaluator.fullName}</p>
                        {e.comment && <p className="text-xs text-slate-500">{e.comment}</p>}
                      </TD>
                      <TD><Badge tone={e.stage === "PRE" ? "blue" : "indigo"}>{t(`suggestionsModule.stage.${e.stage}`)}</Badge></TD>
                      {criteria.map((c) => (<TD key={c.key} className="text-center tabular-nums">{e.scores[c.key] ?? "—"}</TD>))}
                      <TD className="text-right font-semibold tabular-nums">{e.totalScore}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader title={t("suggestionsModule.detail.actions")} actions={can.implement && <Button size="sm" variant="outline" onClick={() => setActionOpen(true)}><Plus className="h-4 w-4" />{t("suggestionsModule.detail.addAction")}</Button>} />
            {!actions || actions.length === 0 ? (
              <CardBody><p className="text-sm text-slate-500">{t("suggestionsModule.detail.noActions")}</p></CardBody>
            ) : (
              <Table>
                <THead><tr><TH>{t("actions.code")}</TH><TH>{t("actions.title")}</TH><TH>{t("actions.owner")}</TH><TH>{t("actions.status")}</TH><TH>{t("actions.priority")}</TH><TH>{t("actions.dueDate")}</TH></tr></THead>
                <TBody>
                  {actions.map((a) => (
                    <TR key={a.id}>
                      <TD className="font-mono text-xs">{a.code}</TD>
                      <TD><Link href={`/actions/${a.id}`} className="font-medium text-slate-900 hover:text-brand-700">{a.title}</Link></TD>
                      <TD className="whitespace-nowrap">{a.owner.fullName}</TD>
                      <TD><StatusBadge status={a.status} overdue={a.isOverdue} /></TD>
                      <TD><PriorityBadge priority={a.priority} /></TD>
                      <TD className="whitespace-nowrap">{formatDate(a.dueDate, locale)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title={t("suggestionsModule.detail.history")} />
          <CardBody>
            <ol className="relative space-y-4 border-l border-slate-200 pl-4">
              {[...s.events].reverse().map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-white" />
                  <p className="text-sm font-medium text-slate-800">{t(`suggestionsModule.event.${e.type}`)}</p>
                  {e.note && <p className="text-xs text-slate-600">{e.note}</p>}
                  <p className="text-xs text-slate-400">{e.user?.fullName ?? "—"} · {formatDateTime(e.createdAt, locale)}</p>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>

      <EvaluationDialog suggestionId={s.id} open={evalOpen} onClose={() => setEvalOpen(false)} />
      {editOpen && <EditDialog s={s} open onClose={() => setEditOpen(false)} />}
      {assignOpen && <AssignDialog s={s} open onClose={() => setAssignOpen(false)} onDone={apply} />}
      <SourceActionDialog open={actionOpen} onClose={() => setActionOpen(false)} path={`/suggestions/${s.id}/actions`} />
      <ConfirmDialog open={withdrawOpen} onClose={() => setWithdrawOpen(false)} onConfirm={() => post.mutate({ path: "withdraw" })} loading={post.isPending} title={t("suggestionsModule.detail.withdraw")} message={t("suggestionsModule.detail.withdrawConfirm")} />
      <Dialog
        open={implOpen}
        onClose={() => setImplOpen(false)}
        title={t("suggestionsModule.detail.markImplemented")}
        footer={<><Button variant="outline" onClick={() => setImplOpen(false)}>{t("common.cancel")}</Button><Button loading={post.isPending} onClick={() => post.mutate({ path: "implemented", body: { note: note || undefined } })}>{t("common.confirm")}</Button></>}
      >
        <Field label={t("suggestionsModule.detail.implementationNote")}><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </Dialog>
    </>
  );
}
