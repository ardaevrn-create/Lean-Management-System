"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Pencil, Plus, Printer, Send, XCircle } from "lucide-react";
import { KAIZEN_AFTER_TYPE, KAIZEN_BEFORE_TYPE, type ActionListItem, type KaizenDetail } from "@lean/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import {
  Badge, Button, Card, CardBody, CardHeader, Dialog, Field, LoadingBlock, PriorityBadge, StatusBadge, Table, TBody, TD, TH, THead, Textarea, TR,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { SourceActionDialog } from "@/components/suggestions/action-dialog";
import { KaizenStatusBadge, PhotoPanel, sKey } from "@/components/suggestions/bits";
import { GainsTable } from "@/components/suggestions/gains-table";
import { KaizenFormDialog } from "@/components/suggestions/kaizen-form-dialog";

export default function KaizenDetailPage() {
  const { id } = (useParams<{ id: string }>() as { id: string });
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const key = sKey("kaizen", id);
  const { data: k, isLoading, error } = useQuery({ queryKey: key, queryFn: () => api.get<KaizenDetail>(`/suggestions/kaizen/${id}`), retry: false });
  const { data: actions } = useQuery({ queryKey: sKey("kaizen-actions", id), enabled: !!k, queryFn: () => api.get<ActionListItem[]>(`/suggestions/kaizen/${id}/actions`) });
  const [editOpen, setEditOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post<KaizenDetail>(`/suggestions/kaizen/${id}/${path}`, body ?? {}),
    onSuccess: (d) => {
      qc.setQueryData(key, d);
      qc.invalidateQueries({ queryKey: ["suggestions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setRejectOpen(false);
      toast.success(t("common.saved"));
    },
    onError: toast.error,
  });

  if (isLoading) return <LoadingBlock />;
  if (!k || error) {
    return (
      <Card><CardBody>
        <p className="mb-3 text-sm text-slate-600">{t("suggestionsModule.detail.notFound")}</p>
        <Link href="/suggestions?tab=kaizen" className="text-sm font-medium text-brand-600">{t("suggestionsModule.detail.back")}</Link>
      </CardBody></Card>
    );
  }
  const can = k.can;
  const photosReadOnly = !can.edit;

  return (
    <>
      <Link href="/suggestions?tab=kaizen" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" />
        {t("suggestionsModule.detail.back")}
      </Link>

      <Card className="mb-4">
        <CardBody className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-slate-500">{k.code}</span>
                <KaizenStatusBadge status={k.status} />
                <Badge tone="indigo">{t(`suggestionsModule.kaizenType.${k.type}`)}</Badge>
              </div>
              <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{k.title}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {t("suggestionsModule.kaizen.leader")}: {k.leader.fullName} · {k.orgUnit?.name ?? "—"} · {formatDate(k.startDate, locale)} – {formatDate(k.endDate, locale)}
              </p>
              {k.suggestion && (
                <p className="mt-1 text-sm text-slate-600">
                  {t("suggestionsModule.detail.linkedSuggestion")}: <Link href={`/suggestions/${k.suggestion.id}`} className="font-medium text-brand-600 hover:underline">{k.suggestion.code} {k.suggestion.title}</Link>
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {can.edit && <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" />{t("common.edit")}</Button>}
              {can.submit && <Button loading={act.isPending} onClick={() => act.mutate({ path: "submit" })}><Send className="h-4 w-4" />{t("suggestionsModule.kaizen.submitForApproval")}</Button>}
              {can.approve && (
                <>
                  <Button loading={act.isPending} onClick={() => act.mutate({ path: "approve", body: { publish: true } })}><CheckCircle2 className="h-4 w-4" />{t("suggestionsModule.kaizen.approvePublish")}</Button>
                  <Button variant="outline" onClick={() => act.mutate({ path: "approve", body: { publish: false } })}>{t("suggestionsModule.kaizen.approveOnly")}</Button>
                  <Button variant="danger" onClick={() => setRejectOpen(true)}><XCircle className="h-4 w-4" />{t("suggestionsModule.decision.REJECT")}</Button>
                </>
              )}
              {k.status === "APPROVED" && (can.financeApprove || k.approvedBy?.id === user?.id) && (
                <Button loading={act.isPending} onClick={() => act.mutate({ path: "publish" })}>{t("suggestionsModule.kaizen.publish")}</Button>
              )}
              <Link href={`/suggestions/kaizen/${k.id}/print`}>
                <Button variant="outline"><Printer className="h-4 w-4" />{t("suggestionsModule.kaizen.printCard")}</Button>
              </Link>
            </div>
          </div>
          {k.rejectionReason && k.status === "REJECTED" && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800"><b>{t("suggestionsModule.detail.rejectionReason")}:</b> {k.rejectionReason}</div>
          )}
        </CardBody>
      </Card>

      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader title={<span className="text-red-700">{t("suggestionsModule.kaizen.before")}</span>} />
            <CardBody className="space-y-3">
              <p className="whitespace-pre-wrap text-sm text-slate-700">{k.beforeDescription}</p>
              <PhotoPanel entityType={KAIZEN_BEFORE_TYPE} entityId={k.id} readOnly={photosReadOnly} compact />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={<span className="text-emerald-700">{t("suggestionsModule.kaizen.after")}</span>} />
            <CardBody className="space-y-3">
              <p className="whitespace-pre-wrap text-sm text-slate-700">{k.afterDescription}</p>
              <PhotoPanel entityType={KAIZEN_AFTER_TYPE} entityId={k.id} readOnly={photosReadOnly} compact />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title={t("suggestionsModule.kaizen.problem")} />
          <CardBody className="grid gap-4 text-sm text-slate-700 md:grid-cols-2">
            <div><h4 className="mb-1 text-xs font-semibold uppercase text-slate-500">{t("suggestionsModule.kaizen.problem")}</h4><p className="whitespace-pre-wrap">{k.problem}</p></div>
            <div><h4 className="mb-1 text-xs font-semibold uppercase text-slate-500">{t("suggestionsModule.kaizen.rootCause")}</h4><p className="whitespace-pre-wrap">{k.rootCause ?? "—"}</p></div>
            <div><h4 className="mb-1 text-xs font-semibold uppercase text-slate-500">{t("suggestionsModule.kaizen.standardization")}</h4><p className="whitespace-pre-wrap">{k.standardization ?? "—"}</p></div>
            <div><h4 className="mb-1 text-xs font-semibold uppercase text-slate-500">{t("suggestionsModule.kaizen.deployment")}</h4><p className="whitespace-pre-wrap">{k.horizontalDeployment ?? "—"}</p></div>
            <div className="md:col-span-2">
              <h4 className="mb-1 text-xs font-semibold uppercase text-slate-500">{t("suggestionsModule.kaizen.team")}</h4>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="blue">{k.leader.fullName} ({t("suggestionsModule.kaizen.leader")})</Badge>
                {k.members.map((m) => (<Badge key={m.id} tone="gray">{m.fullName}</Badge>))}
              </div>
            </div>
          </CardBody>
        </Card>

        <GainsTable kaizen={k} canEdit={can.edit} canFinance={can.financeApprove} />

        <Card>
          <CardHeader title={t("suggestionsModule.detail.actions")} actions={can.createAction && <Button size="sm" variant="outline" onClick={() => setActionOpen(true)}><Plus className="h-4 w-4" />{t("suggestionsModule.detail.addAction")}</Button>} />
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

      <KaizenFormDialog open={editOpen} onClose={() => setEditOpen(false)} kaizen={k} />
      <SourceActionDialog open={actionOpen} onClose={() => setActionOpen(false)} path={`/suggestions/kaizen/${k.id}/actions`} />
      <Dialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={t("suggestionsModule.decision.REJECT")}
        footer={<><Button variant="outline" onClick={() => setRejectOpen(false)}>{t("common.cancel")}</Button><Button variant="danger" disabled={!reason.trim()} loading={act.isPending} onClick={() => act.mutate({ path: "reject", body: { reason } })}>{t("suggestionsModule.decision.REJECT")}</Button></>}
      >
        <Field label={t("suggestionsModule.detail.rejectionReason")} required><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Dialog>
    </>
  );
}
