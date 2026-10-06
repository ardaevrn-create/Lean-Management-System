"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MessageSquare, Play, Send, Undo2 } from "lucide-react";
import type { CatchballListItem, CatchballType, HoshinGoalDetail } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn, formatDateTime } from "@/lib/utils";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, LoadingBlock, Textarea, useToast } from "@/components/ui";
import { fmtNum, GoalLink, GoalStatusBadge, HOSHIN_KEY, LevelBadge } from "./strategy-bits";

const ENTRY_TONE: Record<CatchballType, string> = {
  PROPOSAL: "border-blue-200 bg-blue-50",
  COUNTER_PROPOSAL: "border-amber-200 bg-amber-50",
  AGREEMENT: "border-emerald-200 bg-emerald-50",
  REJECTION: "border-red-200 bg-red-50",
  COMMENT: "border-slate-200 bg-white",
};

/** Catchball yazışması + öneri / karşı öneri / onay / red formu. */
export function CatchballThread({ goal }: { goal: HoshinGoalDetail }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState("");
  const st = goal.catchballState;
  const open = goal.status === "PROPOSED" || goal.status === "IN_CATCHBALL";
  const lastOffer = [...goal.catchball].reverse().find((e) => e.type === "PROPOSAL" || e.type === "COUNTER_PROPOSAL");
  const canAgree = open && st.canRespond && !!lastOffer && lastOffer.side !== st.mySide;

  const send = useMutation({
    mutationFn: (type: CatchballType) =>
      api.post(`/hoshin/goals/${goal.id}/catchball`, { type, message: message.trim() || undefined, proposedTarget: target.trim() === "" ? undefined : Number(target), side: st.mySide ?? undefined }),
    onSuccess: () => {
      setMessage("");
      setTarget("");
      qc.invalidateQueries({ queryKey: HOSHIN_KEY });
    },
    onError: toast.error,
  });
  const activate = useMutation({
    mutationFn: () => api.post(`/hoshin/goals/${goal.id}/activate`),
    onSuccess: () => {
      toast.success(t("strategyModule.catchball.activated"));
      qc.invalidateQueries({ queryKey: HOSHIN_KEY });
    },
    onError: toast.error,
  });

  return (
    <div className="space-y-3">
      {goal.catchball.length === 0 ? (
        <p className="text-sm text-slate-500">{t("strategyModule.catchball.noEntries")}</p>
      ) : (
        <ol className="space-y-2">
          {goal.catchball.map((e) => (
            <li key={e.id} className={cn("rounded-lg border px-3 py-2 text-sm", ENTRY_TONE[e.type], e.side === "CHILD" ? "ml-6" : "mr-6")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-800">
                  {e.user.fullName} <span className="font-normal text-slate-500">· {t(`strategyModule.catchball.type.${e.type}`)}</span>
                </span>
                <span className="text-xs text-slate-500">{formatDateTime(e.createdAt, locale)}</span>
              </div>
              {e.proposedTarget !== null && (
                <p className="mt-0.5 text-slate-700">{t("strategyModule.catchball.proposedTarget")}: <b className="tabular-nums">{fmtNum(e.proposedTarget, goal.unit)}</b></p>
              )}
              {e.message && <p className="mt-0.5 whitespace-pre-wrap text-slate-700">{e.message}</p>}
            </li>
          ))}
        </ol>
      )}

      {goal.status === "AGREED" && (
        <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
          {t("strategyModule.catchball.agreedInfo", { target: fmtNum(goal.targetValue, goal.unit) })}
        </p>
      )}

      {(st.canRespond || st.canPropose) && (open || goal.status === "DRAFT") && (
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <Field label={t("strategyModule.catchball.proposedTarget")} className="sm:col-span-1">
              <Input type="number" step="any" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={fmtNum(goal.targetValue, undefined)} />
            </Field>
            <Field label={t("strategyModule.catchball.message")} className="sm:col-span-3">
              <Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {goal.status === "DRAFT" && st.canPropose && (
              <Button size="sm" loading={send.isPending} onClick={() => send.mutate("PROPOSAL")}>
                <Send className="h-4 w-4" />
                {t("strategyModule.catchball.propose")}
              </Button>
            )}
            {open && st.canRespond && (
              <>
                <Button size="sm" variant="outline" disabled={!message.trim()} onClick={() => send.mutate("COMMENT")}>
                  <MessageSquare className="h-4 w-4" />
                  {t("strategyModule.catchball.comment")}
                </Button>
                <Button size="sm" variant="outline" disabled={!lastOffer || lastOffer.side === st.mySide} onClick={() => send.mutate("COUNTER_PROPOSAL")}>
                  {t("strategyModule.catchball.counter")}
                </Button>
                <Button size="sm" variant="outline" disabled={!message.trim()} onClick={() => send.mutate("REJECTION")}>
                  <Undo2 className="h-4 w-4" />
                  {t("strategyModule.catchball.reject")}
                </Button>
                <Button size="sm" disabled={!canAgree} onClick={() => send.mutate("AGREEMENT")}>
                  <Check className="h-4 w-4" />
                  {t("strategyModule.catchball.agree")}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {st.canActivate && (goal.status === "AGREED" || goal.status === "DRAFT") && (
        <div className="flex justify-end">
          <Button size="sm" variant={goal.status === "AGREED" ? "primary" : "outline"} loading={activate.isPending} onClick={() => activate.mutate()}>
            <Play className="h-4 w-4" />
            {t("strategyModule.catchball.activate")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function CatchballTab() {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: [...HOSHIN_KEY, "catchball"], queryFn: () => api.get<CatchballListItem[]>("/hoshin/catchball") });
  const current = selected ?? data?.[0]?.goal.id ?? null;
  const detail = useQuery({
    queryKey: [...HOSHIN_KEY, "goal", current],
    enabled: !!current,
    queryFn: () => api.get<HoshinGoalDetail>(`/hoshin/goals/${current}`),
  });

  if (isLoading || !data) return <LoadingBlock />;
  if (data.length === 0) return <EmptyState title={t("strategyModule.catchball.empty")} description={t("strategyModule.catchball.emptyDesc")} />;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader title={t("strategyModule.catchball.list")} />
        <ul className="divide-y divide-slate-100">
          {data.map((i) => (
            <li key={i.goal.id}>
              <button
                type="button"
                onClick={() => setSelected(i.goal.id)}
                className={cn("w-full px-4 py-3 text-left hover:bg-slate-50", current === i.goal.id && "bg-brand-50/60")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900"><span className="mr-1 font-mono text-brand-700">{i.goal.code}</span>{i.goal.title}</span>
                  {i.awaitingMe && <Badge tone="amber">{t("strategyModule.catchball.awaitingMe")}</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {i.goal.parentCode && `${i.goal.parentCode} → `}
                  {i.goal.owner?.fullName ?? "–"} · {t("strategyModule.catchball.side." + i.mySide)}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <GoalStatusBadge status={i.goal.status} />
                  <span className="text-xs tabular-nums text-slate-500">{fmtNum(i.goal.targetValue, i.goal.unit)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="lg:col-span-2">
        {!detail.data ? (
          <LoadingBlock />
        ) : (
          <>
            <CardHeader
              title={
                <span className="inline-flex flex-wrap items-center gap-2">
                  <LevelBadge level={detail.data.level} />
                  <GoalLink id={detail.data.id} code={detail.data.code} title={detail.data.title} />
                </span>
              }
              actions={<GoalStatusBadge status={detail.data.status} />}
            />
            <CardBody>
              <CatchballThread goal={detail.data} />
            </CardBody>
          </>
        )}
      </Card>
    </div>
  );
}
