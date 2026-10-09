"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import type { Team } from "@lean/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import {
  Badge, Button, Card, CardBody, ConfirmDialog, Dialog, EmployeePicker, EmptyState, Field, Input, LoadingBlock, PageHeader, Select, Textarea,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";

const TEAM_TYPES: Team["type"][] = ["COMMITTEE", "KAIZEN_TEAM", "FIVE_S_TEAM", "HOSHIN_TEAM", "OTHER"];

interface Member {
  employeeId: string;
  fullName: string;
  role: string;
}
interface FormState {
  id?: string;
  name: string;
  type: Team["type"];
  description: string;
  members: Member[];
}

export default function TeamsPage() {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("org.manage");
  const { data, isLoading } = useQuery({ queryKey: ["teams"], queryFn: () => api.get<Team[]>("/teams") });
  const [form, setForm] = useState<FormState | null>(null);
  const [toDelete, setToDelete] = useState<Team | null>(null);

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const body = {
        name: f.name.trim(),
        type: f.type,
        description: f.description.trim() || undefined,
        members: f.members.map((m) => ({ employeeId: m.employeeId, role: m.role.trim() || undefined })),
      };
      return f.id ? api.patch<Team>(`/teams/${f.id}`, body) : api.post<Team>("/teams", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      toast.success(t("common.saved"));
      setForm(null);
    },
    onError: toast.error,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/teams/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      toast.success(t("common.deleted"));
      setToDelete(null);
    },
    onError: toast.error,
  });

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <>
      <PageHeader
        title={t("nav.teams")}
        actions={
          canManage && (
            <Button onClick={() => setForm({ name: "", type: "KAIZEN_TEAM", description: "", members: [] })}>
              <Plus className="h-4 w-4" />
              {t("teams.new")}
            </Button>
          )
        }
      />
      {isLoading ? (
        <LoadingBlock />
      ) : !data?.length ? (
        <Card>
          <EmptyState title={t("teams.empty")} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((team) => (
            <Card key={team.id}>
              <CardBody className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-slate-900">{team.name}</h3>
                    <Badge tone="indigo" className="mt-1">
                      {t(`teamType.${team.type}`)}
                    </Badge>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0">
                      <button
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                        title={t("common.edit")}
                        onClick={() =>
                          setForm({
                            id: team.id, name: team.name, type: team.type, description: team.description ?? "",
                            members: team.members.map((m) => ({ employeeId: m.employeeId, fullName: m.fullName, role: m.role ?? "" })),
                          })
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button className="rounded p-1.5 text-red-500 hover:bg-red-50" title={t("common.delete")} onClick={() => setToDelete(team)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
                {team.description && <p className="text-sm text-slate-600">{team.description}</p>}
                <div>
                  <p className="mb-1 text-xs text-slate-500">{t("teams.members")} ({team.members.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {team.members.map((m) => (
                      <Badge key={m.employeeId} tone="gray">
                        {m.fullName}
                        {m.role && <span className="text-slate-400">· {m.role}</span>}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? t("teams.edit") : t("teams.new")}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setForm(null)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={!form?.name.trim()} loading={save.isPending} onClick={() => form && save.mutate(form)}>
              {t("common.save")}
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("common.name")} required>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
              </Field>
              <Field label={t("common.type")}>
                <Select value={form.type} onChange={(e) => set("type", e.target.value as Team["type"])}>
                  {TEAM_TYPES.map((x) => (
                    <option key={x} value={x}>
                      {t(`teamType.${x}`)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label={t("common.description")}>
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
            <Field label={t("teams.members")}>
              <div className="space-y-2">
                {form.members.map((m, i) => (
                  <div key={m.employeeId} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{m.fullName}</span>
                    <Input
                      className="w-40"
                      placeholder={t("teams.role")}
                      value={m.role}
                      onChange={(e) => set("members", form.members.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}
                    />
                    <button className="rounded p-1.5 text-slate-400 hover:text-red-500" onClick={() => set("members", form.members.filter((_, j) => j !== i))}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <EmployeePicker
                  key={form.members.length}
                  value={null}
                  clearable={false}
                  placeholder={t("teams.addMember")}
                  onChange={(id, o) => {
                    if (id && o && !form.members.some((m) => m.employeeId === id)) set("members", [...form.members, { employeeId: id, fullName: o.label, role: "" }]);
                  }}
                />
              </div>
            </Field>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        loading={remove.isPending}
        title={t("common.delete")}
        message={t("teams.deleteConfirm", { name: toDelete?.name ?? "" })}
        confirmLabel={t("common.delete")}
      />
    </>
  );
}
