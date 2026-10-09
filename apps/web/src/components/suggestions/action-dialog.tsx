"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PRIORITIES, type Priority } from "@lean/shared";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Button, DatePicker, Dialog, Field, Input, Select, Textarea, UserPicker } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth";

/** Öneri / kaizen kaynağına bağlı aksiyon açar (ActionsService; sourceType API tarafında belirlenir). */
export function SourceActionDialog({ open, onClose, path }: { open: boolean; onClose: () => void; path: string }) {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState<{ id: string; label: string } | null>(user ? { id: user.id, label: user.fullName } : null);
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");

  const create = useMutation({
    mutationFn: () => api.post(path, { title, description: description || undefined, ownerId: owner!.id, dueDate, priority }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suggestions"] });
      qc.invalidateQueries({ queryKey: ["actions"] });
      toast.success(t("actions.created"));
      setTitle("");
      setDescription("");
      setDueDate("");
      onClose();
    },
    onError: toast.error,
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("suggestionsModule.detail.addAction")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button disabled={!title.trim() || !owner || !dueDate} loading={create.isPending} onClick={() => create.mutate()}>{t("common.create")}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t("actions.title")} required><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label={t("common.description")}><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label={t("actions.owner")} required>
          <UserPicker value={owner?.id} valueLabel={owner?.label} clearable={false} onChange={(id, o) => setOwner(id ? { id, label: o?.label ?? id } : null)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("actions.dueDate")} required><DatePicker value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          <Field label={t("actions.priority")}>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (<option key={p} value={p}>{t(`priority.${p}`)}</option>))}
            </Select>
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
