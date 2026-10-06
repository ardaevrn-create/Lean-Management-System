"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { SUGGESTION_CATEGORIES, SUGGESTION_ATTACHMENT_TYPE, type SuggestionCategory, type SuggestionDetail } from "@lean/shared";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button, Dialog, Field, Input, MultiPicker, OrgUnitSelect, Textarea, type PickerOption } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { PhotoPanel } from "./bits";

/** Telefon öncelikli öneri formu: önce kayıt, ardından fotoğraf ekleme adımı. */
export function SubmitSuggestionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [current, setCurrent] = useState("");
  const [proposed, setProposed] = useState("");
  const [benefit, setBenefit] = useState("");
  const [category, setCategory] = useState<SuggestionCategory>("QUALITY");
  const [orgUnitId, setOrgUnitId] = useState<string | null>(null);
  const [selfImpl, setSelfImpl] = useState(false);
  const [cost, setCost] = useState("");
  const [saving, setSaving] = useState("");
  const [co, setCo] = useState<PickerOption[]>([]);
  const [created, setCreated] = useState<SuggestionDetail | null>(null);

  const reset = () => {
    setTitle(""); setCurrent(""); setProposed(""); setBenefit(""); setCategory("QUALITY"); setOrgUnitId(null);
    setSelfImpl(false); setCost(""); setSaving(""); setCo([]); setCreated(null);
  };
  const close = () => {
    onClose();
    reset();
  };

  const create = useMutation({
    mutationFn: () =>
      api.post<SuggestionDetail>("/suggestions", {
        title, currentState: current, proposedState: proposed, expectedBenefit: benefit, category, orgUnitId: orgUnitId ?? undefined,
        selfImplementable: selfImpl, estimatedCost: cost ? Number(cost) : undefined, estimatedSaving: saving ? Number(saving) : undefined,
        coSubmitterIds: co.map((c) => c.id),
      }),
    onSuccess: (s) => {
      setCreated(s);
      qc.invalidateQueries({ queryKey: ["suggestions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: toast.error,
  });

  const valid = title.trim() && current.trim() && proposed.trim() && benefit.trim();

  if (created) {
    return (
      <Dialog
        open={open}
        onClose={close}
        title={t("suggestionsModule.form.thanksTitle")}
        footer={
          <>
            <Button variant="outline" onClick={close}>
              {t("suggestionsModule.form.finish")}
            </Button>
            <Button
              onClick={() => {
                const id = created.id;
                close();
                router.push(`/suggestions/${id}`);
              }}
            >
              {t("suggestionsModule.form.openSuggestion")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">{created.code}</p>
              <p>{t("suggestionsModule.form.thanksBody")}</p>
            </div>
          </div>
          <PhotoPanel entityType={SUGGESTION_ATTACHMENT_TYPE} entityId={created.id} title={t("suggestionsModule.form.photosTitle")} />
          <p className="text-xs text-slate-500">{t("suggestionsModule.form.photosHint")}</p>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t("suggestionsModule.giveSuggestion")}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button size="lg" disabled={!valid} loading={create.isPending} onClick={() => create.mutate()}>
            {t("suggestionsModule.form.submit")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("suggestionsModule.form.title")} required>
          <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={t("suggestionsModule.form.titlePh")} className="h-11 text-base" />
        </Field>
        <Field label={t("suggestionsModule.form.current")} required>
          <Textarea rows={3} value={current} onChange={(e) => setCurrent(e.target.value)} className="text-base" />
        </Field>
        <Field label={t("suggestionsModule.form.proposed")} required>
          <Textarea rows={3} value={proposed} onChange={(e) => setProposed(e.target.value)} className="text-base" />
        </Field>
        <Field label={t("suggestionsModule.form.benefit")} required>
          <Textarea rows={2} value={benefit} onChange={(e) => setBenefit(e.target.value)} className="text-base" />
        </Field>
        <Field label={t("suggestionsModule.form.category")}>
          <div className="flex flex-wrap gap-2">
            {SUGGESTION_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  category === c ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                {t(`suggestionsModule.category.${c}`)}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("suggestionsModule.form.area")} hint={t("suggestionsModule.form.areaHint")}>
          <OrgUnitSelect value={orgUnitId} onChange={setOrgUnitId} className="h-11" />
        </Field>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3">
          <input type="checkbox" checked={selfImpl} onChange={(e) => setSelfImpl(e.target.checked)} className="mt-0.5 h-5 w-5 rounded border-slate-300 text-brand-600" />
          <span>
            <span className="block text-sm font-medium text-slate-800">{t("suggestionsModule.form.selfImpl")}</span>
            <span className="block text-xs text-slate-500">{t("suggestionsModule.form.selfImplHint")}</span>
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("suggestionsModule.form.cost")}>
            <Input type="number" inputMode="decimal" min={0} value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
          <Field label={t("suggestionsModule.form.saving")}>
            <Input type="number" inputMode="decimal" min={0} value={saving} onChange={(e) => setSaving(e.target.value)} />
          </Field>
        </div>
        <Field label={t("suggestionsModule.form.coSubmitters")}>
          <MultiPicker kind="user" selected={co} onChange={setCo} placeholder={t("suggestionsModule.form.addPerson")} />
        </Field>
      </div>
    </Dialog>
  );
}
