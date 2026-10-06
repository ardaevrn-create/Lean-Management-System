"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KAIZEN_TYPES, type KaizenDetail, type KaizenType } from "@lean/shared";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { cn, toDateInput } from "@/lib/utils";
import { Button, DatePicker, Dialog, Field, Input, MultiPicker, OrgUnitSelect, Textarea, UserPicker, type PickerOption } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth";

/** Kaizen oluşturma / düzenleme penceresi. Fotoğraflar ve kazançlar kaydın detay sayfasında girilir. */
export function KaizenFormDialog({ open, onClose, kaizen }: { open: boolean; onClose: () => void; kaizen?: KaizenDetail }) {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const { user } = useAuth();
  const [type, setType] = useState<KaizenType>("QUICK");
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [orgUnitId, setOrgUnitId] = useState<string | null>(null);
  const [leader, setLeader] = useState<PickerOption | null>(null);
  const [members, setMembers] = useState<PickerOption[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [standardization, setStandardization] = useState("");
  const [deployment, setDeployment] = useState("");

  useEffect(() => {
    if (!open) return;
    setType(kaizen?.type ?? "QUICK");
    setTitle(kaizen?.title ?? "");
    setProblem(kaizen?.problem ?? "");
    setRootCause(kaizen?.rootCause ?? "");
    setBefore(kaizen?.beforeDescription ?? "");
    setAfter(kaizen?.afterDescription ?? "");
    setOrgUnitId(kaizen?.orgUnit?.id ?? null);
    setLeader(kaizen ? { id: kaizen.leader.id, label: kaizen.leader.fullName } : user ? { id: user.id, label: user.fullName } : null);
    setMembers(kaizen?.members.map((m) => ({ id: m.id, label: m.fullName })) ?? []);
    setStart(toDateInput(kaizen?.startDate));
    setEnd(toDateInput(kaizen?.endDate));
    setStandardization(kaizen?.standardization ?? "");
    setDeployment(kaizen?.horizontalDeployment ?? "");
  }, [open, kaizen, user]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        type, title, problem, rootCause: rootCause || undefined, beforeDescription: before, afterDescription: after, orgUnitId,
        leaderId: leader?.id, memberIds: members.map((m) => m.id), startDate: start || null, endDate: end || null,
        standardization: standardization || undefined, horizontalDeployment: deployment || undefined,
      };
      return kaizen ? api.patch<KaizenDetail>(`/suggestions/kaizen/${kaizen.id}`, { ...body, rootCause: rootCause || null, standardization: standardization || null, horizontalDeployment: deployment || null }) : api.post<KaizenDetail>("/suggestions/kaizen", body);
    },
    onSuccess: (k) => {
      qc.invalidateQueries({ queryKey: ["suggestions"] });
      qc.setQueryData(["suggestions", "kaizen", k.id], k);
      toast.success(t("common.saved"));
      onClose();
      if (!kaizen) router.push(`/suggestions/kaizen/${k.id}`);
    },
    onError: toast.error,
  });

  const valid = title.trim() && problem.trim() && before.trim() && after.trim() && leader;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={kaizen ? t("suggestionsModule.kaizen.edit") : t("suggestionsModule.kaizen.new")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>{t("common.save")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("suggestionsModule.kaizen.type")}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {KAIZEN_TYPES.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setType(k)}
                className={cn("rounded-lg border p-2.5 text-left text-sm", type === k ? "border-brand-600 bg-brand-50" : "border-slate-300 hover:bg-slate-50")}
              >
                <span className="block font-medium text-slate-800">{t(`suggestionsModule.kaizenType.${k}`)}</span>
                <span className="block text-xs text-slate-500">{t(`suggestionsModule.kaizenTypeHint.${k}`)}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("suggestionsModule.form.title")} required>
          <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t("suggestionsModule.kaizen.problem")} required>
          <Textarea rows={2} value={problem} onChange={(e) => setProblem(e.target.value)} />
        </Field>
        <Field label={t("suggestionsModule.kaizen.rootCause")}>
          <Textarea rows={2} value={rootCause} onChange={(e) => setRootCause(e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("suggestionsModule.kaizen.beforeDesc")} required>
            <Textarea rows={3} value={before} onChange={(e) => setBefore(e.target.value)} />
          </Field>
          <Field label={t("suggestionsModule.kaizen.afterDesc")} required>
            <Textarea rows={3} value={after} onChange={(e) => setAfter(e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("suggestionsModule.form.area")}>
            <OrgUnitSelect value={orgUnitId} onChange={setOrgUnitId} />
          </Field>
          <Field label={t("suggestionsModule.kaizen.leader")} required>
            <UserPicker value={leader?.id} valueLabel={leader?.label} clearable={false} onChange={(id, o) => setLeader(id ? (o ?? { id, label: id }) : null)} />
          </Field>
          <Field label={t("suggestionsModule.kaizen.start")}>
            <DatePicker value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label={t("suggestionsModule.kaizen.end")}>
            <DatePicker value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <Field label={t("suggestionsModule.kaizen.team")}>
          <MultiPicker kind="user" selected={members} onChange={setMembers} placeholder={t("suggestionsModule.form.addPerson")} />
        </Field>
        <Field label={t("suggestionsModule.kaizen.standardization")} hint={t("suggestionsModule.kaizen.standardizationHint")}>
          <Textarea rows={2} value={standardization} onChange={(e) => setStandardization(e.target.value)} />
        </Field>
        <Field label={t("suggestionsModule.kaizen.deployment")}>
          <Textarea rows={2} value={deployment} onChange={(e) => setDeployment(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
