"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { KAIZEN_GAIN_METRICS, KAIZEN_GAIN_TYPES, type KaizenDetail, type KaizenGainDto, type KaizenGainMetric, type KaizenGainType } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Badge, Button, Card, CardHeader, Dialog, Field, Input, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { money, sKey } from "./bits";

function GainDialog({ kaizenId, gain, open, onClose }: { kaizenId: string; gain?: KaizenGainDto; open: boolean; onClose: () => void }) {
  const t = useI18n().t;
  const toast = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState<KaizenGainType>(gain?.type ?? "TANGIBLE");
  const [metric, setMetric] = useState<KaizenGainMetric>(gain?.metric ?? "COST_TL");
  const [description, setDescription] = useState(gain?.description ?? "");
  const [before, setBefore] = useState(gain?.beforeValue?.toString() ?? "");
  const [after, setAfter] = useState(gain?.afterValue?.toString() ?? "");
  const [saving, setSaving] = useState(gain?.annualSaving?.toString() ?? "");
  const save = useMutation({
    mutationFn: () => {
      const body = {
        type, metric, description, beforeValue: before === "" ? null : Number(before), afterValue: after === "" ? null : Number(after),
        annualSaving: type === "TANGIBLE" && saving !== "" ? Number(saving) : null,
      };
      return gain ? api.patch<KaizenDetail>(`/suggestions/kaizen/${kaizenId}/gains/${gain.id}`, body) : api.post<KaizenDetail>(`/suggestions/kaizen/${kaizenId}/gains`, body);
    },
    onSuccess: (d) => {
      qc.setQueryData(sKey("kaizen", d.id), d);
      qc.invalidateQueries({ queryKey: sKey("kaizen") });
      onClose();
    },
    onError: toast.error,
  });
  return (
    <Dialog open={open} onClose={onClose} title={gain ? t("suggestionsModule.gains.edit") : t("suggestionsModule.gains.add")}
      footer={<><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button disabled={!description.trim()} loading={save.isPending} onClick={() => save.mutate()}>{t("common.save")}</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("suggestionsModule.gains.type")}>
            <Select value={type} onChange={(e) => setType(e.target.value as KaizenGainType)}>
              {KAIZEN_GAIN_TYPES.map((x) => (<option key={x} value={x}>{t(`suggestionsModule.gainType.${x}`)}</option>))}
            </Select>
          </Field>
          <Field label={t("suggestionsModule.gains.metric")}>
            <Select value={metric} onChange={(e) => setMetric(e.target.value as KaizenGainMetric)}>
              {KAIZEN_GAIN_METRICS.map((x) => (<option key={x} value={x}>{t(`suggestionsModule.metric.${x}`)}</option>))}
            </Select>
          </Field>
        </div>
        <Field label={t("common.description")} required><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("suggestionsModule.gains.before")}><Input type="number" value={before} onChange={(e) => setBefore(e.target.value)} /></Field>
          <Field label={t("suggestionsModule.gains.after")}><Input type="number" value={after} onChange={(e) => setAfter(e.target.value)} /></Field>
        </div>
        {type === "TANGIBLE" && (
          <Field label={t("suggestionsModule.kaizen.annualSaving")} hint={t("suggestionsModule.gains.savingHint")}>
            <Input type="number" min={0} value={saving} onChange={(e) => setSaving(e.target.value)} />
          </Field>
        )}
      </div>
    </Dialog>
  );
}

/** Kazanç tablosu: somut/soyut kazançlar, yıllık kazanç toplamı, finans doğrulaması (M7-05/06). */
export function GainsTable({ kaizen, canEdit, canFinance }: { kaizen: KaizenDetail; canEdit: boolean; canFinance: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<KaizenGainDto | "new" | null>(null);

  const refresh = (d: KaizenDetail) => {
    qc.setQueryData(sKey("kaizen", d.id), d);
    qc.invalidateQueries({ queryKey: sKey("kaizen") });
  };
  const approve = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) => api.post<KaizenDetail>(`/suggestions/kaizen/${kaizen.id}/gains/${id}/finance-approval`, { approved }),
    onSuccess: refresh,
    onError: toast.error,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del<KaizenDetail>(`/suggestions/kaizen/${kaizen.id}/gains/${id}`),
    onSuccess: refresh,
    onError: toast.error,
  });

  return (
    <Card>
      <CardHeader
        title={t("suggestionsModule.gains.title")}
        actions={canEdit && <Button size="sm" variant="outline" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />{t("suggestionsModule.gains.add")}</Button>}
      />
      {kaizen.gains.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">{t("suggestionsModule.gains.empty")}</p>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>{t("suggestionsModule.gains.type")}</TH>
              <TH>{t("suggestionsModule.gains.metric")}</TH>
              <TH>{t("common.description")}</TH>
              <TH className="text-right">{t("suggestionsModule.gains.before")}</TH>
              <TH className="text-right">{t("suggestionsModule.gains.after")}</TH>
              <TH className="text-right">{t("suggestionsModule.kaizen.annualSaving")}</TH>
              <TH>{t("suggestionsModule.gains.finance")}</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {kaizen.gains.map((g) => (
              <TR key={g.id}>
                <TD><Badge tone={g.type === "TANGIBLE" ? "green" : "gray"}>{t(`suggestionsModule.gainType.${g.type}`)}</Badge></TD>
                <TD>{t(`suggestionsModule.metric.${g.metric}`)}</TD>
                <TD className="max-w-xs">{g.description}</TD>
                <TD className="text-right tabular-nums">{g.beforeValue ?? "—"}</TD>
                <TD className="text-right tabular-nums">{g.afterValue ?? "—"}</TD>
                <TD className="whitespace-nowrap text-right font-medium tabular-nums">{g.type === "TANGIBLE" ? money(g.annualSaving, locale) : "—"}</TD>
                <TD>
                  {g.type === "TANGIBLE" && g.annualSaving !== null ? (
                    g.financeApproved ? (
                      <button className="text-left" disabled={!canFinance} onClick={() => approve.mutate({ id: g.id, approved: false })} title={canFinance ? t("suggestionsModule.gains.revoke") : undefined}>
                        <Badge tone="green"><BadgeCheck className="h-3.5 w-3.5" />{t("suggestionsModule.gains.approved")}</Badge>
                        <span className="block text-[11px] text-slate-400">{g.financeApprovedBy?.fullName}</span>
                      </button>
                    ) : canFinance ? (
                      <Button size="sm" variant="outline" loading={approve.isPending} onClick={() => approve.mutate({ id: g.id, approved: true })}>{t("suggestionsModule.gains.approve")}</Button>
                    ) : (
                      <Badge tone="amber">{t("suggestionsModule.gains.pending")}</Badge>
                    )
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </TD>
                <TD className="whitespace-nowrap">
                  {canEdit && (
                    <>
                      <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setEditing(g)} aria-label={t("common.edit")}><Pencil className="h-4 w-4" /></button>
                      <button className="rounded p-1.5 text-red-500 hover:bg-red-50" onClick={() => remove.mutate(g.id)} aria-label={t("common.delete")}><Trash2 className="h-4 w-4" /></button>
                    </>
                  )}
                </TD>
              </TR>
            ))}
            <TR className="bg-slate-50 font-semibold">
              <TD colSpan={5} className="text-right">{t("suggestionsModule.gains.total")}</TD>
              <TD className="whitespace-nowrap text-right tabular-nums">{money(kaizen.totalAnnualSaving, locale)}</TD>
              <TD colSpan={2} className="whitespace-nowrap text-xs font-normal text-emerald-700">{t("suggestionsModule.gains.approvedTotal")}: {money(kaizen.approvedAnnualSaving, locale)}</TD>
            </TR>
          </TBody>
        </Table>
      )}
      {editing && <GainDialog kaizenId={kaizen.id} gain={editing === "new" ? undefined : editing} open onClose={() => setEditing(null)} />}
    </Card>
  );
}
