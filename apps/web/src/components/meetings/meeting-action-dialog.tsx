"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PRIORITIES, type ActionDetail, type Priority } from "@lean/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Button, DatePicker, Dialog, Field, Input, MultiPicker, Select, Textarea, UserPicker, type PickerOption } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

/** Toplantı içinden aksiyon açma: kaynak (MEETING) sunucu tarafından POST /meetings/:id/actions ile atanır. */
export function MeetingActionDialog({
  meetingId,
  open,
  onClose,
  defaultTitle,
}: {
  meetingId: string;
  open: boolean;
  onClose: () => void;
  defaultTitle?: string;
}) {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(user?.id ?? null);
  const [ownerLabel, setOwnerLabel] = useState<string | null>(user?.fullName ?? null);
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [supporters, setSupporters] = useState<PickerOption[]>([]);

  const create = useMutation({
    mutationFn: () =>
      api.post<ActionDetail>(`/meetings/${meetingId}/actions`, {
        title: title.trim(),
        description: description.trim() || undefined,
        ownerId,
        dueDate,
        priority,
        supporterIds: supporters.map((s) => s.id),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
      qc.invalidateQueries({ queryKey: ["actions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(t("actions.created"));
      setTitle("");
      setDescription("");
      setDueDate("");
      setSupporters([]);
      onClose();
    },
    onError: toast.error,
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("meetingsModule.room.addAction")}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!title.trim() || !ownerId || !dueDate} loading={create.isPending} onClick={() => create.mutate()}>
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
        <Field label={t("actions.supporters")}>
          <MultiPicker kind="user" selected={supporters} onChange={setSupporters} placeholder={t("actions.addSupporter")} />
        </Field>
      </div>
    </Dialog>
  );
}
