"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Plus, Share2, XCircle } from "lucide-react";
import {
  PRIORITIES, PROBLEM_ACTION_KINDS, type Priority, type ProblemActionItem, type ProblemActionKind, type ProblemDetail,
  type ProblemVerificationResult,
} from "@lean/shared";
import { api } from "@/lib/api";
import { useT, useI18n } from "@/lib/i18n";
import { formatDate, formatDateTime, toDateInput } from "@/lib/utils";
import {
  Badge, Button, Card, CardBody, CardHeader, Checkbox, DatePicker, Dialog, Field, flattenOrgTree, Input, OrgUnitSelect, PriorityBadge, Select,
  StatusBadge, Textarea, useOrgTree, UserPicker,
} from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useDetailMutation } from "./problem-bits";

function ActionList({ items }: { items: ProblemActionItem[] }) {
  const t = useT();
  const { locale } = useI18n();
  if (items.length === 0) return <p className="px-4 py-3 text-sm text-slate-500">{t("problemsModule.actions.empty")}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map(({ action: a }) => (
        <li key={a.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="min-w-0 flex-1">
            <Link href={`/actions/${a.id}`} className="font-medium text-slate-900 hover:text-brand-700">
              <span className="mr-2 font-mono text-xs text-slate-500">{a.code}</span>
              {a.title}
            </Link>
            <p className="text-xs text-slate-500">
              {a.owner.fullName}
              {a.orgUnit && ` · ${a.orgUnit.name}`} · {formatDate(a.dueDate, locale)}
              {a.isOverdue && <span className="ml-1 font-medium text-red-600">({t("problemsModule.overdueDays", { n: a.overdueDays })})</span>}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <PriorityBadge priority={a.priority} />
            <StatusBadge status={a.status} overdue={a.isOverdue} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ContainmentActions({ problem }: { problem: ProblemDetail }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader
        title={t("problemsModule.contain.actions")}
        actions={
          problem.can.edit && (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("problemsModule.actions.add")}
            </Button>
          )
        }
      />
      <ActionList items={problem.actions.filter((a) => a.kind === "CONTAINMENT")} />
      {open && <AddActionDialog problem={problem} defaultKind="CONTAINMENT" onClose={() => setOpen(false)} />}
    </Card>
  );
}

export function ActionsSection({ problem }: { problem: ProblemDetail }) {
  const t = useT();
  const [add, setAdd] = useState<ProblemActionKind | null>(null);
  const [horizontal, setHorizontal] = useState(false);
  const kinds = PROBLEM_ACTION_KINDS.filter((k) => k !== "CONTAINMENT");
  return (
    <div className="space-y-4">
      {problem.can.edit && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAdd("CORRECTIVE")}>
            <Plus className="h-4 w-4" />
            {t("problemsModule.actions.add")}
          </Button>
          <Button variant="outline" onClick={() => setHorizontal(true)}>
            <Share2 className="h-4 w-4" />
            {t("problemsModule.actions.horizontal")}
          </Button>
        </div>
      )}
      {problem.whyChains.length > 0 && (
        <Card>
          <CardBody className="space-y-1.5">
            {problem.whyChains.map((c) => (
              <div key={c.id} className="flex items-start gap-2 text-sm">
                {c.actionCount > 0 ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
                <span className="min-w-0">
                  <span className="font-medium">{c.rootCause || c.causeText}</span>
                  <span className="text-slate-500"> · {c.actionCount} {t("problemsModule.kind.CORRECTIVE").toLowerCase()}</span>
                </span>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
      {kinds.map((kind) => (
        <Card key={kind}>
          <CardHeader
            title={t(`problemsModule.kind.${kind}`)}
            actions={
              problem.can.edit && (
                <Button size="sm" variant="ghost" onClick={() => (kind === "HORIZONTAL" ? setHorizontal(true) : setAdd(kind))}>
                  <Plus className="h-4 w-4" />
                  {t("problemsModule.actions.addKind", { kind: t(`problemsModule.kind.${kind}`).toLowerCase() })}
                </Button>
              )
            }
          />
          <ActionList items={problem.actions.filter((a) => a.kind === kind)} />
        </Card>
      ))}
      {add && <AddActionDialog problem={problem} defaultKind={add} onClose={() => setAdd(null)} />}
      {horizontal && <HorizontalDialog problem={problem} onClose={() => setHorizontal(false)} />}
    </div>
  );
}

function AddActionDialog({ problem, defaultKind, onClose }: { problem: ProblemDetail; defaultKind: ProblemActionKind; onClose: () => void }) {
  const t = useT();
  const { user } = useAuth();
  const [kind, setKind] = useState<ProblemActionKind>(defaultKind);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(user?.id ?? null);
  const [ownerLabel, setOwnerLabel] = useState<string | null>(user?.fullName ?? null);
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [chainId, setChainId] = useState("");
  const [orgUnitId, setOrgUnitId] = useState<string | null>(null);

  const create = useDetailMutation(
    problem.id,
    () =>
      api.post<ProblemDetail>(`/problems/${problem.id}/actions`, {
        kind,
        title: title.trim(),
        description: description.trim() || undefined,
        ownerId,
        dueDate,
        priority,
        rootCauseChainId: chainId || undefined,
        orgUnitId: kind === "HORIZONTAL" ? orgUnitId ?? undefined : undefined,
      }),
    t("problemsModule.actions.created"),
    onClose,
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("problemsModule.actions.add")}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!title.trim() || !ownerId || !dueDate || (kind === "HORIZONTAL" && !orgUnitId)} loading={create.isPending} onClick={() => create.mutate(undefined as never)}>
            {t("common.create")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("problemsModule.actions.kind")}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as ProblemActionKind)}>
            {PROBLEM_ACTION_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`problemsModule.kind.${k}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("problemsModule.actions.rootCause")}>
          <Select value={chainId} onChange={(e) => setChainId(e.target.value)}>
            <option value="">{t("problemsModule.actions.noRootCause")}</option>
            {problem.whyChains.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rootCause || c.causeText}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("problemsModule.actions.title2")} required className="sm:col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label={t("problemsModule.description")} className="sm:col-span-2">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label={t("problemsModule.actions.ownerLabel")} required>
          <UserPicker value={ownerId} valueLabel={ownerLabel} clearable={false} onChange={(i, o) => (setOwnerId(i), setOwnerLabel(o?.label ?? null))} />
        </Field>
        <Field label={t("problemsModule.actions.due")} required>
          <DatePicker value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label={t("problemsModule.actions.priority")}>
          <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`priority.${p}`)}
              </option>
            ))}
          </Select>
        </Field>
        {kind === "HORIZONTAL" && (
          <Field label={t("problemsModule.actions.orgUnitTarget")} required>
            <OrgUnitSelect value={orgUnitId} onChange={setOrgUnitId} />
          </Field>
        )}
      </div>
    </Dialog>
  );
}

/** Yatay yaygınlaştırma: birden çok birim seç, her biri için HORIZONTAL aksiyon aç. */
function HorizontalDialog({ problem, onClose }: { problem: ProblemDetail; onClose: () => void }) {
  const t = useT();
  const { user } = useAuth();
  const { data: tree } = useOrgTree();
  const units = useMemo(() => flattenOrgTree(tree ?? []).filter((u) => u.node.id !== problem.orgUnit.id), [tree, problem.orgUnit.id]);
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState(`${problem.code}: `);
  const [dueDate, setDueDate] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(user?.id ?? null);
  const [ownerLabel, setOwnerLabel] = useState<string | null>(user?.fullName ?? null);
  const [chainId, setChainId] = useState("");

  const create = useDetailMutation(
    problem.id,
    () =>
      api.post<ProblemDetail>(`/problems/${problem.id}/horizontal`, {
        orgUnitIds: picked, title: title.trim(), dueDate, ownerId, rootCauseChainId: chainId || undefined,
      }),
    t("problemsModule.actions.created"),
    onClose,
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("problemsModule.actions.horizontal")}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!picked.length || !title.trim() || !dueDate || !ownerId} loading={create.isPending} onClick={() => create.mutate(undefined as never)}>
            {t("problemsModule.actions.horizontalCreate")} ({picked.length})
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{t("problemsModule.actions.horizontalHint")}</p>
        <Field label={t("problemsModule.actions.targetUnits")}>
          <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {units.map(({ node, depth }) => (
              <div key={node.id} style={{ paddingLeft: depth * 14 }} className="py-1">
                <Checkbox
                  checked={picked.includes(node.id)}
                  onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, node.id] : cur.filter((x) => x !== node.id)))}
                  label={node.name}
                />
              </div>
            ))}
          </div>
        </Field>
        <Field label={t("problemsModule.actions.title2")} required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("problemsModule.actions.due")} required>
            <DatePicker value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label={t("problemsModule.actions.fallbackOwner")} required>
            <UserPicker value={ownerId} valueLabel={ownerLabel} clearable={false} onChange={(i, o) => (setOwnerId(i), setOwnerLabel(o?.label ?? null))} />
          </Field>
        </div>
        <Field label={t("problemsModule.actions.rootCause")}>
          <Select value={chainId} onChange={(e) => setChainId(e.target.value)}>
            <option value="">{t("problemsModule.actions.noRootCause")}</option>
            {problem.whyChains.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rootCause || c.causeText}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

export function VerificationSection({ problem }: { problem: ProblemDetail }) {
  const t = useT();
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(toDateInput(problem.verificationDate));
  const savePlan = useDetailMutation(problem.id, () => api.patch<ProblemDetail>(`/problems/${problem.id}`, { verificationDate: date || null }), t("problemsModule.def.saved"));
  const canAdd = problem.can.edit && problem.phase === "VERIFICATION";
  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <Field label={t("problemsModule.verify.planned")}>
            <DatePicker value={date} disabled={!problem.can.edit} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {problem.can.edit && (
            <Button variant="outline" loading={savePlan.isPending} onClick={() => savePlan.mutate(undefined as never)}>
              {t("common.save")}
            </Button>
          )}
          <div className="ml-auto">
            {canAdd ? (
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                {t("problemsModule.verify.add")}
              </Button>
            ) : (
              <p className="text-xs text-slate-500">{t("problemsModule.verify.onlyInPhase")}</p>
            )}
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t("problemsModule.verify.title")} />
        {problem.verifications.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-500">{t("problemsModule.verify.empty")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {[...problem.verifications].reverse().map((v) => (
              <li key={v.id} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Badge tone={v.result === "EFFECTIVE" ? "green" : "red"}>{t(`problemsModule.verify.${v.result}`)}</Badge>
                  <span className="text-xs text-slate-500">
                    {v.verifiedBy.fullName} · {formatDateTime(v.verifiedAt, locale)}
                  </span>
                </div>
                {v.note && <p className="mt-1 text-sm text-slate-700">{v.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {open && <VerificationDialog problem={problem} onClose={() => setOpen(false)} />}
    </div>
  );
}

function VerificationDialog({ problem, onClose }: { problem: ProblemDetail; onClose: () => void }) {
  const t = useT();
  const [result, setResult] = useState<ProblemVerificationResult>("EFFECTIVE");
  const [note, setNote] = useState("");
  const add = useDetailMutation(
    problem.id,
    () => api.post<ProblemDetail>(`/problems/${problem.id}/verifications`, { result, note: note.trim() || undefined }),
    undefined,
    onClose,
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title={t("problemsModule.verify.add")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant={result === "NOT_EFFECTIVE" ? "danger" : "primary"} loading={add.isPending} onClick={() => add.mutate(undefined as never)}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("problemsModule.verify.result")}>
          <Select value={result} onChange={(e) => setResult(e.target.value as ProblemVerificationResult)}>
            <option value="EFFECTIVE">{t("problemsModule.verify.EFFECTIVE")}</option>
            <option value="NOT_EFFECTIVE">{t("problemsModule.verify.NOT_EFFECTIVE")}</option>
          </Select>
        </Field>
        {result === "NOT_EFFECTIVE" && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{t("problemsModule.verify.notEffectiveWarn")}</p>}
        <Field label={t("problemsModule.verify.note")}>
          <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
