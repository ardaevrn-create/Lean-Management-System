"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PRIORITIES, type ActionDetail, type CreateActionRequest, type Priority } from "@lean/shared";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Button, DatePicker, Dialog, Field, Input, MultiPicker, OrgUnitSelect, Select, Textarea, UserPicker, type PickerOption } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth";

export function NewActionDialog({
  open,
  onClose,
  onCreated,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (a: ActionDetail) => void;
  defaults?: Partial<CreateActionRequest>;
}) {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(user?.id ?? null);
  const [ownerLabel, setOwnerLabel] = useState<string | null>(user?.fullName ?? null);
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [orgUnitId, setOrgUnitId] = useState<string | null>(null);
  const [supporters, setSupporters] = useState<PickerOption[]>([]);

  const create = useMutation({
    mutationFn: (body: CreateActionRequest) => api.post<ActionDetail>("/actions", body),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["actions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(t("actions.created"));
      setTitle("");
      setDescription("");
      setDueDate("");
      setSupporters([]);
      onClose();
      onCreated?.(a);
    },
    onError: toast.error,
  });

  const valid = title.trim() && ownerId && dueDate;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("actions.new")}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!valid}
            loading={create.isPending}
            onClick={() =>
              create.mutate({
                ...defaults,
                title: title.trim(),
                description: description.trim() || undefined,
                ownerId: ownerId!,
                dueDate,
                priority,
                orgUnitId: orgUnitId ?? undefined,
                supporterIds: supporters.map((s) => s.id),
              })
            }
          >
            {t("common.create")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("actions.title")} required className="sm:col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label={t("actions.description")} className="sm:col-span-2">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label={t("actions.owner")} required>
          <UserPicker
            value={ownerId}
            valueLabel={ownerLabel}
            clearable={false}
            onChange={(id, o) => {
              setOwnerId(id);
              setOwnerLabel(o?.label ?? null);
            }}
          />
        </Field>
        <Field label={t("actions.dueDate")} required>
          <DatePicker value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label={t("actions.priority")}>
          <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`priority.${p}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("actions.orgUnit")}>
          <OrgUnitSelect value={orgUnitId} onChange={setOrgUnitId} />
        </Field>
        <Field label={t("actions.supporters")} className="sm:col-span-2">
          <MultiPicker kind="user" selected={supporters} onChange={setSupporters} placeholder={t("actions.addSupporter")} />
        </Field>
      </div>
    </Dialog>
  );
}
