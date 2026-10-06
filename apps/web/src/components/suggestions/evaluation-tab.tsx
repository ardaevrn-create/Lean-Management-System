"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import {
  averageScore, canFastTrack, weightedScore, type EvaluationCriterion, type EvaluationStage, type Paginated, type SuggestionDetail, type SuggestionListItem,
} from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { Badge, Button, Card, Dialog, EmptyState, Field, LoadingBlock, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { CategoryBadge, money, sKey, SuggestionStatusBadge, useSuggestionSettings } from "./bits";

/** Kriter başına dokunmatik dostu puan düğmeleri + canlı ağırlıklı toplam. */
export function ScoreForm({
  criteria, scores, onChange,
}: {
  criteria: EvaluationCriterion[];
  scores: Record<string, number>;
  onChange: (s: Record<string, number>) => void;
}) {
  const t = useI18n().t;
  const total = weightedScore(criteria, scores);
  const complete = criteria.every((c) => typeof scores[c.key] === "number");
  return (
    <div className="space-y-3">
      {criteria.map((c) => (
        <div key={c.key}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">{c.label}</span>
            <span className="text-xs text-slate-400">%{c.weight}</span>
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: c.max + 1 }, (_, v) => (
              <button
                key={v}
                type="button"
                onClick={() => onChange({ ...scores, [c.key]: v })}
                className={cn(
                  "h-10 flex-1 rounded-lg border text-sm font-semibold transition-colors",
                  scores[c.key] === v ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
        <span className="text-sm text-slate-600">{t("suggestionsModule.eval.weightedTotal")}</span>
        <span className={cn("text-xl font-semibold tabular-nums", complete ? "text-brand-700" : "text-slate-400")}>{total}</span>
      </div>
    </div>
  );
}

/** Ön değerlendirme / komite puanlama ve karar penceresi. */
export function EvaluationDialog({ suggestionId, open, onClose }: { suggestionId: string | null; open: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: settings } = useSuggestionSettings();
  const { data: s, isLoading } = useQuery({
    queryKey: sKey("detail", suggestionId),
    enabled: open && !!suggestionId,
    queryFn: () => api.get<SuggestionDetail>(`/suggestions/${suggestionId}`),
  });
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");

  const stage: EvaluationStage | null = s?.can.preEvaluate ? "PRE" : s?.can.committeeScore || s?.can.decide ? "COMMITTEE" : null;

  useEffect(() => {
    if (!s || !stage) return;
    setScores({});
    setComment("");
  }, [s?.id, stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = (data: SuggestionDetail) => {
    qc.setQueryData(sKey("detail", suggestionId), data);
    qc.invalidateQueries({ queryKey: ["suggestions"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const send = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) => api.post<SuggestionDetail>(`/suggestions/${suggestionId}/${path}`, body),
    onSuccess: (d) => {
      refresh(d);
      toast.success(t("suggestionsModule.eval.saved"));
      onClose();
    },
    onError: toast.error,
  });

  if (!open) return null;
  const criteria = settings?.criteria ?? [];
  const complete = criteria.length > 0 && criteria.every((c) => typeof scores[c.key] === "number");
  const total = weightedScore(criteria, scores);
  const commScores = s?.evaluations.filter((e) => e.stage === "COMMITTEE").map((e) => e.totalScore) ?? [];
  const fast = settings && s ? canFastTrack(settings, complete ? total : null, s.estimatedCost) : false;

  const pre = (decision: string) => send.mutate({ path: "pre-evaluation", body: { scores, decision, comment: comment || undefined, reason: comment || undefined } });
  const decide = (decision: string) => send.mutate({ path: "decision", body: { decision, reason: comment || undefined, note: comment || undefined } });

  return (
    <Dialog open={open} onClose={onClose} title={s ? `${s.code} — ${s.title}` : t("suggestionsModule.eval.title")} size="lg">
      {isLoading || !s || !settings ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-4">
          <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <SuggestionStatusBadge status={s.status} />
              <CategoryBadge category={s.category} />
              <span className="text-slate-500">{s.submittedBy.fullName}</span>
              {s.estimatedCost !== null && <span className="text-slate-500">{t("suggestionsModule.form.cost")}: {money(s.estimatedCost, locale)}</span>}
            </div>
            <p><span className="font-medium">{t("suggestionsModule.form.current")}:</span> {s.currentState}</p>
            <p><span className="font-medium">{t("suggestionsModule.form.proposed")}:</span> {s.proposedState}</p>
            <p><span className="font-medium">{t("suggestionsModule.form.benefit")}:</span> {s.expectedBenefit}</p>
          </div>

          {!stage && <p className="text-sm text-slate-500">{t("suggestionsModule.eval.nothingToDo")}</p>}

          {(s.can.preEvaluate || s.can.committeeScore) && (
            <>
              <h4 className="text-sm font-semibold text-slate-700">
                {s.can.preEvaluate ? t("suggestionsModule.stage.PRE") : t("suggestionsModule.stage.COMMITTEE")}
              </h4>
              <ScoreForm criteria={criteria} scores={scores} onChange={setScores} />
            </>
          )}

          {s.can.committeeScore && commScores.length > 0 && (
            <p className="text-xs text-slate-500">
              {t("suggestionsModule.eval.committeeSoFar", { n: commScores.length, avg: averageScore(commScores) ?? 0 })}
            </p>
          )}

          <Field label={t("suggestionsModule.eval.comment")} hint={t("suggestionsModule.eval.commentHint")}>
            <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>

          {s.can.preEvaluate && (
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={!complete} loading={send.isPending} onClick={() => pre("FORWARD")}>
                {t("suggestionsModule.decision.FORWARD")}
              </Button>
              <Button variant="outline" disabled={!complete || !fast} title={t("suggestionsModule.eval.fastHint")} onClick={() => pre("ACCEPT")}>
                {t("suggestionsModule.decision.FAST")}
              </Button>
              <Button variant="outline" disabled={!comment.trim()} onClick={() => pre("REVISE")}>
                {t("suggestionsModule.decision.REVISE")}
              </Button>
              <Button variant="danger" disabled={!comment.trim()} onClick={() => pre("REJECT")}>
                {t("suggestionsModule.decision.REJECT")}
              </Button>
            </div>
          )}

          {s.can.committeeScore && (
            <Button className="w-full" disabled={!complete} loading={send.isPending} onClick={() => send.mutate({ path: "committee-evaluation", body: { scores, comment: comment || undefined } })}>
              {t("suggestionsModule.eval.saveScore")}
            </Button>
          )}

          {s.can.decide && (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <h4 className="text-sm font-semibold text-slate-700">{t("suggestionsModule.eval.finalDecision")}</h4>
              <div className="grid grid-cols-3 gap-2">
                <Button onClick={() => decide("ACCEPT")} loading={send.isPending}>{t("suggestionsModule.decision.ACCEPT")}</Button>
                <Button variant="outline" onClick={() => decide("HOLD")}>{t("suggestionsModule.decision.HOLD")}</Button>
                <Button variant="danger" disabled={!comment.trim()} onClick={() => decide("REJECT")}>{t("suggestionsModule.decision.REJECT")}</Button>
              </div>
              <p className="text-xs text-slate-500">{t("suggestionsModule.eval.decisionHint")}</p>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

export function EvaluationTab() {
  const { t, locale } = useI18n();
  const [stage, setStage] = useState<"" | "PRE" | "COMMITTEE">("");
  const [openId, setOpenId] = useState<string | null>(null);
  const params = { view: "queue", stage: stage || undefined, pageSize: 50 };
  const { data, isLoading } = useQuery({
    queryKey: sKey("list", params),
    queryFn: () => api.get<Paginated<SuggestionListItem>>("/suggestions", params),
  });

  return (
    <div className="space-y-3">
      <div className="flex overflow-hidden rounded-lg border border-slate-300 sm:w-fit">
        {(["", "PRE", "COMMITTEE"] as const).map((s) => (
          <button key={s} onClick={() => setStage(s)} className={cn("flex-1 px-4 py-1.5 text-sm", stage === s ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}>
            {s ? t(`suggestionsModule.stage.${s}`) : t("common.all")}
          </button>
        ))}
      </div>
      <Card>
        {isLoading || !data ? (
          <LoadingBlock />
        ) : data.items.length === 0 ? (
          <EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title={t("suggestionsModule.eval.emptyQueue")} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.items.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <Link href={`/suggestions/${s.id}`} className="block truncate font-medium text-slate-900 hover:text-brand-700">{s.title}</Link>
                  <p className="text-xs text-slate-500">
                    <span className="font-mono">{s.code}</span> · {s.submittedBy.fullName} · {s.orgUnit?.name ?? "—"} · {formatDate(s.submittedAt, locale)}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <SuggestionStatusBadge status={s.status} />
                    <CategoryBadge category={s.category} />
                    {s.awaitingMe && <Badge tone="amber">{t(`suggestionsModule.stage.${s.awaitingMe}`)}</Badge>}
                  </div>
                </div>
                <Button onClick={() => setOpenId(s.id)}>{t("suggestionsModule.eval.evaluate")}</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <EvaluationDialog suggestionId={openId} open={!!openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
