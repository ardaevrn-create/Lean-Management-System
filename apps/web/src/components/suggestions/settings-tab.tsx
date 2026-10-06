"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { PRE_EVALUATION_MODES, type PreEvaluationMode, type SuggestionSettingsDto, type Team } from "@lean/shared";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Button, Card, CardBody, CardHeader, Field, Input, LoadingBlock, Select } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { sKey, useSuggestionSettings } from "./bits";

const numOrNull = (v: string) => (v === "" ? null : Number(v));

/** Öneri ayarları: kriterler/ağırlıklar, komite, hızlı onay, puan kuralları, ödül kademeleri (suggestion.manage). */
export function SettingsTab() {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useSuggestionSettings();
  const { data: teams } = useQuery({ queryKey: ["teams"], queryFn: () => api.get<Team[]>("/teams") });
  const [s, setS] = useState<SuggestionSettingsDto | null>(null);

  useEffect(() => {
    if (data) setS(structuredClone(data));
  }, [data]);

  const save = useMutation({
    mutationFn: (body: SuggestionSettingsDto) => api.put<SuggestionSettingsDto>("/suggestions/settings", body),
    onSuccess: (d) => {
      qc.setQueryData(sKey("settings"), d);
      toast.success(t("common.saved"));
    },
    onError: toast.error,
  });

  if (!s) return <LoadingBlock />;
  const set = (patch: Partial<SuggestionSettingsDto>) => setS({ ...s, ...patch });
  const weightSum = s.criteria.reduce((a, c) => a + (Number(c.weight) || 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={t("suggestionsModule.settings.criteria")}
          actions={
            <Button size="sm" variant="outline" onClick={() => set({ criteria: [...s.criteria, { key: `c${s.criteria.length + 1}`, label: "", weight: 10, max: 5 }] })}>
              <Plus className="h-4 w-4" />
              {t("suggestionsModule.settings.addCriterion")}
            </Button>
          }
        />
        <CardBody className="space-y-2">
          {s.criteria.map((c, i) => (
            <div key={i} className="grid grid-cols-12 items-end gap-2">
              <Field label={i === 0 ? t("suggestionsModule.settings.criterionName") : undefined} className="col-span-12 sm:col-span-6">
                <Input value={c.label} onChange={(e) => set({ criteria: s.criteria.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              </Field>
              <Field label={i === 0 ? t("suggestionsModule.settings.weight") : undefined} className="col-span-5 sm:col-span-2">
                <Input type="number" min={0} value={c.weight} onChange={(e) => set({ criteria: s.criteria.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)) })} />
              </Field>
              <Field label={i === 0 ? t("suggestionsModule.settings.max") : undefined} className="col-span-5 sm:col-span-2">
                <Input type="number" min={1} max={100} value={c.max} onChange={(e) => set({ criteria: s.criteria.map((x, j) => (j === i ? { ...x, max: Number(e.target.value) } : x)) })} />
              </Field>
              <div className="col-span-2 flex justify-end">
                <Button size="icon" variant="ghost" aria-label={t("common.delete")} onClick={() => set({ criteria: s.criteria.filter((_, j) => j !== i) })}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
          <p className={weightSum === 100 ? "text-xs text-slate-500" : "text-xs text-amber-600"}>{t("suggestionsModule.settings.weightSum", { n: weightSum })}</p>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("suggestionsModule.settings.flow")} />
          <CardBody className="space-y-3">
            <Field label={t("suggestionsModule.settings.preEvaluation")}>
              <Select value={s.preEvaluation} onChange={(e) => set({ preEvaluation: e.target.value as PreEvaluationMode })}>
                {PRE_EVALUATION_MODES.map((m) => (
                  <option key={m} value={m}>{t(`suggestionsModule.settings.mode.${m}`)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("suggestionsModule.settings.committee")} hint={t("suggestionsModule.settings.committeeHint")}>
              <Select value={s.committeeTeamId ?? ""} onChange={(e) => set({ committeeTeamId: e.target.value || null })}>
                <option value="">{t("suggestionsModule.settings.noCommittee")}</option>
                {teams?.filter((x) => x.type === "COMMITTEE").map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("suggestionsModule.settings.autoMin")} hint={t("suggestionsModule.settings.autoHint")}>
                <Input type="number" min={0} max={100} value={s.autoAcceptMinScore ?? ""} onChange={(e) => set({ autoAcceptMinScore: numOrNull(e.target.value) })} />
              </Field>
              <Field label={t("suggestionsModule.settings.autoCost")}>
                <Input type="number" min={0} value={s.autoAcceptMaxCost ?? ""} onChange={(e) => set({ autoAcceptMaxCost: numOrNull(e.target.value) })} />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("suggestionsModule.settings.points")} />
          <CardBody className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Field label={t("suggestionsModule.settings.submission")}>
                <Input type="number" min={0} value={s.pointRules.submission} onChange={(e) => set({ pointRules: { ...s.pointRules, submission: Number(e.target.value) } })} />
              </Field>
              <Field label={t("suggestionsModule.settings.implementation")}>
                <Input type="number" min={0} value={s.pointRules.implementation} onChange={(e) => set({ pointRules: { ...s.pointRules, implementation: Number(e.target.value) } })} />
              </Field>
              <Field label={t("suggestionsModule.settings.kaizenPublished")}>
                <Input type="number" min={0} value={s.pointRules.kaizenPublished} onChange={(e) => set({ pointRules: { ...s.pointRules, kaizenPublished: Number(e.target.value) } })} />
              </Field>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">{t("suggestionsModule.settings.bands")}</p>
              {s.pointRules.acceptanceBands.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">≥</span>
                  <Input className="w-24" type="number" min={0} max={100} value={b.minScore} onChange={(e) => set({ pointRules: { ...s.pointRules, acceptanceBands: s.pointRules.acceptanceBands.map((x, j) => (j === i ? { ...x, minScore: Number(e.target.value) } : x)) } })} />
                  <span className="text-sm text-slate-500">→</span>
                  <Input className="w-24" type="number" min={0} value={b.points} onChange={(e) => set({ pointRules: { ...s.pointRules, acceptanceBands: s.pointRules.acceptanceBands.map((x, j) => (j === i ? { ...x, points: Number(e.target.value) } : x)) } })} />
                  <span className="text-sm text-slate-500">{t("suggestionsModule.settings.pts")}</span>
                  <Button size="icon" variant="ghost" onClick={() => set({ pointRules: { ...s.pointRules, acceptanceBands: s.pointRules.acceptanceBands.filter((_, j) => j !== i) } })}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => set({ pointRules: { ...s.pointRules, acceptanceBands: [...s.pointRules.acceptanceBands, { minScore: 0, points: 10 }] } })}>
                <Plus className="h-4 w-4" />
                {t("suggestionsModule.settings.addBand")}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={t("suggestionsModule.settings.tiers")}
          actions={
            <Button size="sm" variant="outline" onClick={() => set({ rewardTiers: [...s.rewardTiers, { name: "", minPoints: 0 }] })}>
              <Plus className="h-4 w-4" />
              {t("suggestionsModule.settings.addTier")}
            </Button>
          }
        />
        <CardBody className="space-y-2">
          {s.rewardTiers.map((tier, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input className="max-w-xs" placeholder={t("suggestionsModule.settings.tierName")} value={tier.name} onChange={(e) => set({ rewardTiers: s.rewardTiers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <Input className="w-28" type="number" min={0} value={tier.minPoints} onChange={(e) => set({ rewardTiers: s.rewardTiers.map((x, j) => (j === i ? { ...x, minPoints: Number(e.target.value) } : x)) })} />
              <span className="text-sm text-slate-500">{t("suggestionsModule.settings.pts")}</span>
              <Button size="icon" variant="ghost" onClick={() => set({ rewardTiers: s.rewardTiers.filter((_, j) => j !== i) })}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" loading={save.isPending} disabled={s.criteria.some((c) => !c.label.trim()) || s.rewardTiers.some((x) => !x.name.trim())} onClick={() => save.mutate(s)}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
