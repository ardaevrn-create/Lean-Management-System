"use client";

import { useState } from "react";
import { Check, CheckCircle2, Circle, Undo2, XCircle } from "lucide-react";
import type { ProblemDetail, ProblemGateCode, ProblemPhase } from "@lean/shared";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button, Card, CardBody, Dialog, Field, Textarea } from "@/components/ui";
import { FLOW_PHASES, useDetailMutation } from "./problem-bits";

/** Aşamaya göre geçiş kontrol listesi kodları (sunucudaki kapılarla aynı) */
const PHASE_GATES: Partial<Record<ProblemPhase, ProblemGateCode[]>> = {
  DEFINITION: ["DEFINITION_INCOMPLETE"],
  CONTAINMENT: ["CONTAINMENT_REQUIRED"],
  ROOT_CAUSE: ["FISHBONE_REQUIRED", "FIVE_WHY_REQUIRED"],
  ACTIONS: ["ROOT_CAUSE_UNADDRESSED", "CORRECTIVE_REQUIRED", "ACTIONS_OPEN"],
  VERIFICATION: ["VERIFICATION_REQUIRED"],
};

export function PhaseStepper({ phase, onSelect }: { phase: ProblemPhase; onSelect: (p: ProblemPhase) => void }) {
  const t = useT();
  const cur = FLOW_PHASES.indexOf(phase);
  return (
    <ol className="flex gap-1 overflow-x-auto pb-1">
      {FLOW_PHASES.map((p, i) => {
        const done = phase === "CLOSED" ? true : i < cur;
        const active = i === cur;
        return (
          <li key={p} className="min-w-[88px] flex-1">
            <button
              type="button"
              onClick={() => onSelect(p)}
              className={cn(
                "flex w-full flex-col items-center gap-1 rounded-lg px-2 py-2 text-center transition-colors hover:bg-slate-50",
                phase === "CANCELLED" && "opacity-50",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
                  done ? "bg-emerald-600 text-white" : active ? "bg-brand-600 text-white ring-4 ring-brand-100" : "bg-slate-200 text-slate-500",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={cn("text-xs font-medium", active ? "text-brand-700" : "text-slate-600")}>{t(`problemsModule.phase.${p}`)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function PhasePanel({ problem, onSelect }: { problem: ProblemDetail; onSelect: (p: ProblemPhase) => void }) {
  const t = useT();
  const id = problem.id;
  const [confirm, setConfirm] = useState<"advance" | "back" | "cancel" | null>(null);
  const [note, setNote] = useState("");
  const gate = problem.gate;
  const codes = PHASE_GATES[problem.phase] ?? [];
  const next = gate.nextPhase;

  const done = () => {
    setConfirm(null);
    setNote("");
  };
  const advance = useDetailMutation(id, () => api.post<ProblemDetail>(`/problems/${id}/phase`, { to: next, note: note.trim() || undefined }), t("problemsModule.detail.advanced"), (d) => {
    done();
    onSelect(d.phase);
  });
  const back = useDetailMutation(
    id,
    () => {
      const i = FLOW_PHASES.indexOf(problem.phase);
      return api.post<ProblemDetail>(`/problems/${id}/phase`, { to: FLOW_PHASES[i - 1], note: note.trim() || undefined });
    },
    t("problemsModule.detail.advanced"),
    (d) => {
      done();
      onSelect(d.phase);
    },
  );
  const cancel = useDetailMutation(id, () => api.post<ProblemDetail>(`/problems/${id}/cancel`, { reason: note.trim() }), t("problemsModule.detail.cancelled"), done);

  const open = problem.phase !== "CLOSED" && problem.phase !== "CANCELLED";

  return (
    <Card>
      <CardBody className="space-y-3">
        <PhaseStepper phase={problem.phase} onSelect={onSelect} />
        {open && (
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("problemsModule.detail.checklist")}</p>
            <ul className="space-y-1.5">
              {codes.map((c) => {
                const ok = !gate.missing.includes(c);
                return (
                  <li key={c} className="flex items-start gap-2 text-sm">
                    {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
                    <span className={ok ? "text-slate-500 line-through" : "text-slate-800"}>{t(`problemsModule.gate.${c}`)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {open && next && (
            <Button disabled={!gate.canAdvance || !problem.can.advance} onClick={() => setConfirm("advance")}>
              {next === "CLOSED" ? t("problemsModule.phase.CLOSED") : t("problemsModule.detail.advance")}
            </Button>
          )}
          {problem.can.back && (
            <Button variant="outline" onClick={() => setConfirm("back")}>
              <Undo2 className="h-4 w-4" />
              {t("problemsModule.detail.backPhase")}
            </Button>
          )}
          {problem.can.cancel && (
            <Button variant="ghost" className="ml-auto text-red-600" onClick={() => setConfirm("cancel")}>
              <XCircle className="h-4 w-4" />
              {t("problemsModule.detail.cancelProblem")}
            </Button>
          )}
        </div>
      </CardBody>
      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        size="sm"
        title={
          confirm === "cancel"
            ? t("problemsModule.detail.cancelProblem")
            : confirm === "back"
              ? t("problemsModule.detail.backPhase")
              : next === "CLOSED"
                ? t("problemsModule.detail.closeConfirm")
                : t("problemsModule.detail.advanceTo", { phase: next ? t(`problemsModule.phase.${next}`) : "" })
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant={confirm === "cancel" ? "danger" : "primary"}
              disabled={confirm === "cancel" && note.trim().length < 3}
              loading={advance.isPending || back.isPending || cancel.isPending}
              onClick={() => (confirm === "advance" ? advance : confirm === "back" ? back : cancel).mutate(undefined as never)}
            >
              {t("common.confirm")}
            </Button>
          </>
        }
      >
        <Field label={confirm === "cancel" ? t("problemsModule.detail.cancelReason") : t("problemsModule.detail.note")}>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Dialog>
    </Card>
  );
}
