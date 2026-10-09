"use client";

import { useState } from "react";
import { PROBLEM_METHODS, PROBLEM_SEVERITIES, type ProblemDetail } from "@lean/shared";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { toDateInput } from "@/lib/utils";
import {
  Button, Card, CardBody, CardHeader, Checkbox, DatePicker, Field, Input, MultiPicker, Select, Textarea, UserPicker, type PickerOption,
} from "@/components/ui";
import { useDetailMutation } from "./problem-bits";
import { ContainmentActions } from "./problem-actions";

const localInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function DefinitionSection({ problem }: { problem: ProblemDetail }) {
  const t = useT();
  const id = problem.id;
  const ro = !problem.can.edit;
  const [f, setF] = useState({
    title: problem.title,
    description: problem.description ?? "",
    severity: problem.severity,
    method: problem.method,
    what: problem.what ?? "",
    whereText: problem.whereText ?? "",
    occurredAt: localInput(problem.occurredAt),
    who: problem.who ?? "",
    how: problem.how ?? "",
    howMuch: problem.howMuch ?? "",
    isNot: problem.isNot ?? "",
    customerName: problem.customerName ?? "",
    customerRef: problem.customerRef ?? "",
    costImpact: problem.costImpact === null ? "" : String(problem.costImpact),
    targetCloseDate: toDateInput(problem.targetCloseDate),
  });
  const [ownerId, setOwnerId] = useState<string | null>(problem.owner.id);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((cur) => ({ ...cur, [k]: v }));
  const orNull = (s: string) => s.trim() || null;

  const save = useDetailMutation(
    id,
    () =>
      api.patch<ProblemDetail>(`/problems/${id}`, {
        title: f.title.trim(),
        description: orNull(f.description),
        severity: f.severity,
        method: f.method,
        what: orNull(f.what),
        whereText: orNull(f.whereText),
        occurredAt: f.occurredAt ? new Date(f.occurredAt).toISOString() : null,
        who: orNull(f.who),
        how: orNull(f.how),
        howMuch: orNull(f.howMuch),
        isNot: orNull(f.isNot),
        customerName: orNull(f.customerName),
        customerRef: orNull(f.customerRef),
        costImpact: f.costImpact === "" ? null : Number(f.costImpact),
        targetCloseDate: f.targetCloseDate || null,
        ...(problem.can.close && ownerId && ownerId !== problem.owner.id ? { ownerId } : {}),
      }),
    t("problemsModule.def.saved"),
  );

  const teamOptions: PickerOption[] = problem.members.map((m) => ({ id: m.userId, label: m.user.fullName }));
  const team = useDetailMutation(id, (items: PickerOption[]) =>
    api.put<ProblemDetail>(`/problems/${id}/team`, {
      members: items.map((o) => ({ userId: o.id, role: problem.members.find((m) => m.userId === o.id)?.role ?? undefined })),
    }),
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t("problemsModule.def.title")} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label={t("problemsModule.titleField")} className="sm:col-span-2">
            <Input value={f.title} disabled={ro} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field label={t("problemsModule.description")} className="sm:col-span-2">
            <Textarea value={f.description} disabled={ro} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field label={t("problemsModule.def.what")} required>
            <Textarea rows={2} value={f.what} disabled={ro} onChange={(e) => set("what", e.target.value)} />
          </Field>
          <Field label={t("problemsModule.def.where")} required>
            <Textarea rows={2} value={f.whereText} disabled={ro} onChange={(e) => set("whereText", e.target.value)} />
          </Field>
          <Field label={t("problemsModule.def.when")} required>
            <Input type="datetime-local" value={f.occurredAt} disabled={ro} onChange={(e) => set("occurredAt", e.target.value)} />
          </Field>
          <Field label={t("problemsModule.def.who")}>
            <Input value={f.who} disabled={ro} onChange={(e) => set("who", e.target.value)} />
          </Field>
          <Field label={t("problemsModule.def.how")}>
            <Textarea rows={2} value={f.how} disabled={ro} onChange={(e) => set("how", e.target.value)} />
          </Field>
          <Field label={t("problemsModule.def.howMuch")}>
            <Textarea rows={2} value={f.howMuch} disabled={ro} onChange={(e) => set("howMuch", e.target.value)} />
          </Field>
          <Field label={t("problemsModule.def.isNot")} className="sm:col-span-2">
            <Textarea rows={2} value={f.isNot} disabled={ro} onChange={(e) => set("isNot", e.target.value)} />
          </Field>
          <Field label={t("problemsModule.severityField")}>
            <Select value={f.severity} disabled={ro} onChange={(e) => set("severity", e.target.value as typeof f.severity)}>
              {PROBLEM_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {t(`problemsModule.severity.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("problemsModule.methodField")}>
            <Select value={f.method} disabled={ro} onChange={(e) => set("method", e.target.value as typeof f.method)}>
              {PROBLEM_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`problemsModule.method.${m}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("problemsModule.def.customer")}>
            <Input value={f.customerName} disabled={ro} onChange={(e) => set("customerName", e.target.value)} />
          </Field>
          <Field label={t("problemsModule.def.customerRef")}>
            <Input value={f.customerRef} disabled={ro} onChange={(e) => set("customerRef", e.target.value)} />
          </Field>
          <Field label={t("problemsModule.def.costImpact")}>
            <Input type="number" min={0} value={f.costImpact} disabled={ro} onChange={(e) => set("costImpact", e.target.value)} />
          </Field>
          <Field label={t("problemsModule.def.targetClose")}>
            <DatePicker value={f.targetCloseDate} disabled={ro} onChange={(e) => set("targetCloseDate", e.target.value)} />
          </Field>
          <Field label={t("problemsModule.owner")} className="sm:col-span-2">
            <UserPicker value={ownerId} valueLabel={problem.owner.fullName} clearable={false} onChange={(i) => setOwnerId(i)} />
          </Field>
          {!ro && (
            <div className="sm:col-span-2">
              <Button disabled={!f.title.trim()} loading={save.isPending} onClick={() => save.mutate(undefined as never)}>
                {t("common.save")}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("problemsModule.def.team")} />
        <CardBody className="space-y-2">
          <p className="text-xs text-slate-500">{t("problemsModule.def.teamHint")}</p>
          <p className="text-sm">
            <span className="font-medium">{problem.owner.fullName}</span> <span className="text-slate-500">({t("problemsModule.report2.leader")})</span>
          </p>
          {ro ? (
            <p className="text-sm text-slate-600">{problem.members.map((m) => m.user.fullName).join(", ")}</p>
          ) : (
            <MultiPicker kind="user" selected={teamOptions} onChange={(items) => team.mutate(items)} placeholder={t("problemsModule.def.addMember")} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export function ContainmentSection({ problem }: { problem: ProblemDetail }) {
  const t = useT();
  const id = problem.id;
  const ro = !problem.can.edit;
  const [text, setText] = useState(problem.containment ?? "");
  const [notNeeded, setNotNeeded] = useState(problem.containmentNotNeeded);
  const [reason, setReason] = useState(problem.containmentSkipReason ?? "");
  const save = useDetailMutation(
    id,
    () =>
      api.patch<ProblemDetail>(`/problems/${id}`, {
        containment: text.trim() || null,
        containmentNotNeeded: notNeeded,
        containmentSkipReason: reason.trim() || null,
      }),
    t("problemsModule.def.saved"),
  );
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t("problemsModule.contain.title")} />
        <CardBody className="space-y-3">
          <Field label={t("problemsModule.contain.text")}>
            <Textarea rows={4} value={text} disabled={ro} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Checkbox checked={notNeeded} disabled={ro} onChange={(e) => setNotNeeded(e.target.checked)} label={t("problemsModule.contain.notNeeded")} />
          {notNeeded && (
            <Field label={t("problemsModule.contain.skipReason")}>
              <Input value={reason} disabled={ro} onChange={(e) => setReason(e.target.value)} />
            </Field>
          )}
          {!ro && (
            <Button loading={save.isPending} onClick={() => save.mutate(undefined as never)}>
              {t("common.save")}
            </Button>
          )}
        </CardBody>
      </Card>
      <ContainmentActions problem={problem} />
    </div>
  );
}
