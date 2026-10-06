"use client";

import { useEffect, useState } from "react";
import { ArrowDown, CheckCircle2, CircleDashed, Plus, Star, Trash2 } from "lucide-react";
import type { ProblemCauseCategory, ProblemCauseItem, ProblemDetail, ProblemWhyChainItem } from "@lean/shared";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, CardBody, CardHeader, Checkbox, ConfirmDialog, Dialog, Field, Input, Textarea } from "@/components/ui";
import { CATEGORY_COLORS, useDetailMutation } from "./problem-bits";
import { FishboneCards, FishboneSvg } from "./fishbone-diagram";

type DialogState = { mode: "add"; category: ProblemCauseCategory; parentId?: string } | { mode: "edit"; cause: ProblemCauseItem } | null;

export function RootCauseSection({ problem }: { problem: ProblemDetail }) {
  const t = useT();
  const [dialog, setDialog] = useState<DialogState>(null);
  const canEdit = problem.can.edit;
  const candidates = problem.causes.filter((c) => c.isCandidate);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t("problemsModule.fish.title")} />
        <CardBody>
          <p className="mb-3 text-xs text-slate-500">{t("problemsModule.fish.hint")}</p>
          <div className="hidden md:block">
            <FishboneSvg
              title={problem.title}
              causes={problem.causes}
              onAdd={canEdit ? (category) => setDialog({ mode: "add", category }) : undefined}
              onSelect={canEdit ? (cause) => setDialog({ mode: "edit", cause }) : undefined}
            />
          </div>
          <div className="md:hidden">
            <FishboneCards
              causes={problem.causes}
              onAdd={canEdit ? (category) => setDialog({ mode: "add", category }) : undefined}
              onSelect={canEdit ? (cause) => setDialog({ mode: "edit", cause }) : undefined}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("problemsModule.why.title")} />
        <CardBody className="space-y-4">
          {candidates.length === 0 && <p className="text-sm text-slate-500">{t("problemsModule.why.noCandidates")}</p>}
          {candidates.map((c) => (
            <WhyEditor key={c.id} problem={problem} cause={c} chain={problem.whyChains.find((w) => w.causeId === c.id)} />
          ))}
        </CardBody>
      </Card>

      {dialog && (
        <CauseDialog
          key={dialog.mode === "edit" ? dialog.cause.id : `add-${dialog.category}-${dialog.parentId ?? ""}`}
          problem={problem}
          state={dialog}
          onClose={() => setDialog(null)}
          onAddSub={(c) => setDialog({ mode: "add", category: c.category, parentId: c.id })}
        />
      )}
    </div>
  );
}

function CauseDialog({ problem, state, onClose, onAddSub }: { problem: ProblemDetail; state: NonNullable<DialogState>; onClose: () => void; onAddSub: (c: ProblemCauseItem) => void }) {
  const t = useT();
  const id = problem.id;
  const editing = state.mode === "edit" ? state.cause : null;
  const live = editing ? problem.causes.find((c) => c.id === editing.id) : null;
  const [text, setText] = useState(editing?.text ?? "");
  const [candidate, setCandidate] = useState(editing?.isCandidate ?? false);
  const [parentId, setParentId] = useState<string | undefined>(state.mode === "add" ? state.parentId : undefined);
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmUnstar, setConfirmUnstar] = useState(false);
  const category = state.mode === "add" ? state.category : state.cause.category;
  const hasChain = !!editing && problem.whyChains.some((w) => w.causeId === editing.id);

  const add = useDetailMutation(id, (v: { text: string }) =>
    api.post<ProblemDetail>(`/problems/${id}/causes`, { category, text: v.text, parentId: parentId ?? null, isCandidate: candidate }),
  );
  const update = useDetailMutation(id, (v: Record<string, unknown>) => api.patch<ProblemDetail>(`/problems/${id}/causes/${editing!.id}`, v), undefined, onClose);
  const del = useDetailMutation(id, () => api.del<ProblemDetail>(`/problems/${id}/causes/${editing!.id}`), undefined, onClose);

  const children = editing ? problem.causes.filter((c) => c.parentId === editing.id) : [];
  const col = CATEGORY_COLORS[category];

  const save = () => {
    if (!text.trim()) return;
    if (state.mode === "add") add.mutate({ text: text.trim() }, { onSuccess: () => setText("") });
    else if (candidate === false && editing?.isCandidate && hasChain) setConfirmUnstar(true);
    else update.mutate({ text: text.trim(), isCandidate: candidate });
  };

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: col.stroke }} />
            {t(`problemsModule.category.${category}`)} — {state.mode === "add" ? t("problemsModule.fish.addCause") : t("common.edit")}
          </span>
        }
        footer={
          <>
            {editing && live && (
              <Button variant="danger" className="mr-auto" onClick={() => setConfirmDel(true)}>
                <Trash2 className="h-4 w-4" />
                {t("problemsModule.fish.deleteCause")}
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              {t("common.close")}
            </Button>
            <Button disabled={!text.trim()} loading={add.isPending || update.isPending} onClick={save}>
              {state.mode === "add" ? t("problemsModule.fish.addAnother") : t("common.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t("problemsModule.fish.causeText")}>
            <Input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              maxLength={500}
            />
          </Field>
          {state.mode === "add" && (
            <Field label={t("problemsModule.fish.addSub")}>
              <select
                className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                value={parentId ?? ""}
                onChange={(e) => setParentId(e.target.value || undefined)}
              >
                <option value="">—</option>
                {problem.causes.filter((c) => c.category === category && !c.parentId).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.text}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Checkbox checked={candidate} onChange={(e) => setCandidate(e.target.checked)} label={t("problemsModule.fish.candidate")} />
          {editing && !editing.parentId && (
            <Button variant="outline" size="sm" onClick={() => onAddSub(editing)}>
              <Plus className="h-4 w-4" />
              {t("problemsModule.fish.addSub")}
            </Button>
          )}
          {children.length > 0 && (
            <ul className="space-y-1 text-sm text-slate-600">
              {children.map((c) => (
                <li key={c.id}>↳ {c.text}</li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={() => del.mutate(undefined as never)}
        loading={del.isPending}
        title={t("problemsModule.fish.deleteCause")}
        message={t("problemsModule.fish.deleteConfirm")}
        confirmLabel={t("common.delete")}
      />
      <ConfirmDialog
        open={confirmUnstar}
        onClose={() => setConfirmUnstar(false)}
        onConfirm={() => update.mutate({ text: text.trim(), isCandidate: false })}
        loading={update.isPending}
        title={t("problemsModule.fish.candidate")}
        message={t("problemsModule.fish.removeCandidateConfirm")}
      />
    </>
  );
}

/** Tek aday neden için 5 Neden zinciri editörü. */
function WhyEditor({ problem, cause, chain }: { problem: ProblemDetail; cause: ProblemCauseItem; chain?: ProblemWhyChainItem }) {
  const t = useT();
  const id = problem.id;
  const canEdit = problem.can.edit;
  const col = CATEGORY_COLORS[cause.category];
  const initial = () => {
    const a = chain?.steps.map((s) => s.answer) ?? [];
    while (a.length < 3) a.push("");
    return a;
  };
  const [steps, setSteps] = useState<string[]>(initial);
  const [rootCause, setRootCause] = useState(chain?.rootCause ?? "");
  const [confirmed, setConfirmed] = useState(chain?.confirmed ?? false);
  const [confirmDel, setConfirmDel] = useState(false);
  const serverKey = JSON.stringify([chain?.id, chain?.steps.map((s) => s.answer), chain?.rootCause, chain?.confirmed]);

  useEffect(() => {
    setSteps(initial());
    setRootCause(chain?.rootCause ?? "");
    setConfirmed(chain?.confirmed ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  const start = useDetailMutation(id, () => api.post<ProblemDetail>(`/problems/${id}/why-chains`, { causeId: cause.id }));
  const save = useDetailMutation(
    id,
    async () => {
      await api.put<ProblemDetail>(`/problems/${id}/why-chains/${chain!.id}/steps`, {
        steps: steps.filter((s) => s.trim()).map((answer) => ({ answer: answer.trim() })),
      });
      return api.patch<ProblemDetail>(`/problems/${id}/why-chains/${chain!.id}`, { rootCause: rootCause.trim() || null, confirmed });
    },
    t("problemsModule.why.saved"),
  );
  const del = useDetailMutation(id, () => api.del<ProblemDetail>(`/problems/${id}/why-chains/${chain!.id}`), undefined, () => setConfirmDel(false));

  const filled = steps.filter((s) => s.trim()).length;
  const complete = filled >= 3 && rootCause.trim().length > 0;

  return (
    <div className="rounded-lg border bg-white" style={{ borderColor: col.stroke }}>
      <div className="flex flex-wrap items-center gap-2 rounded-t-lg px-3 py-2" style={{ background: col.fill, color: col.text }}>
        <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
        <span className="min-w-0 flex-1 text-sm font-semibold">{cause.text}</span>
        <Badge tone="gray">{t(`problemsModule.category.${cause.category}`)}</Badge>
        {chain &&
          (complete ? (
            <Badge tone="green">
              <CheckCircle2 className="h-3 w-3" />
              {t("problemsModule.why.complete")}
            </Badge>
          ) : (
            <Badge tone="amber">
              <CircleDashed className="h-3 w-3" />
              {t("problemsModule.why.progress", { n: Math.min(filled, 3) })}
            </Badge>
          ))}
      </div>
      <div className="p-3">
        {!chain ? (
          canEdit ? (
            <Button size="sm" loading={start.isPending} onClick={() => start.mutate(undefined as never)}>
              {t("problemsModule.why.start")}
            </Button>
          ) : null
        ) : (
          <div className="space-y-1">
            {steps.map((s, i) => (
              <div key={i}>
                <div className="flex items-start gap-2">
                  <span className="mt-2 w-16 shrink-0 text-xs font-semibold text-slate-500">{t("problemsModule.why.step", { n: i + 1 })}</span>
                  <Input
                    value={s}
                    disabled={!canEdit}
                    placeholder={t("problemsModule.why.stepPlaceholder")}
                    onChange={(e) => setSteps((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                </div>
                <div className="flex justify-start pl-6 text-slate-300">
                  <ArrowDown className="h-4 w-4" />
                </div>
              </div>
            ))}
            {canEdit && steps.length < 10 && (
              <Button variant="ghost" size="sm" onClick={() => setSteps((cur) => [...cur, ""])}>
                <Plus className="h-4 w-4" />
                {t("problemsModule.why.addStep")}
              </Button>
            )}
            <Field label={t("problemsModule.why.rootCause")} className="pt-2">
              <Textarea value={rootCause} disabled={!canEdit} rows={2} onChange={(e) => setRootCause(e.target.value)} />
            </Field>
            <Checkbox checked={confirmed} disabled={!canEdit} onChange={(e) => setConfirmed(e.target.checked)} label={t("problemsModule.why.confirmed")} />
            <p className={cn("text-xs", complete ? "text-emerald-600" : "text-amber-700")}>{complete ? t("problemsModule.why.complete") : t("problemsModule.why.incomplete")}</p>
            {canEdit && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" loading={save.isPending} onClick={() => save.mutate(undefined as never)}>
                  {t("problemsModule.why.save")}
                </Button>
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setConfirmDel(true)}>
                  <Trash2 className="h-4 w-4" />
                  {t("problemsModule.why.delete")}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={() => del.mutate(undefined as never)}
        loading={del.isPending}
        title={t("problemsModule.why.delete")}
        message={t("problemsModule.why.deleteConfirm")}
        confirmLabel={t("common.delete")}
      />
    </div>
  );
}
