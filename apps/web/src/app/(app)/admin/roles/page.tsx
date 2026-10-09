"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import type { Role } from "@lean/shared";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Badge, Button, Card, CardBody, Checkbox, ConfirmDialog, Dialog, EmptyState, Field, Input, LoadingBlock, PageHeader, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

interface Permission {
  code: string;
  group: string;
}
interface FormState {
  id?: string;
  code: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
}

export default function RolesPage() {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api.get<Role[]>("/roles") });
  const perms = useQuery({ queryKey: ["roles", "permissions"], queryFn: () => api.get<Permission[]>("/roles/permissions"), staleTime: 5 * 60_000 });
  const [form, setForm] = useState<FormState | null>(null);
  const [toDelete, setToDelete] = useState<Role | null>(null);

  const grouped = useMemo(() => {
    const m = new Map<string, Permission[]>();
    perms.data?.forEach((p) => m.set(p.group, [...(m.get(p.group) ?? []), p]));
    return [...m.entries()];
  }, [perms.data]);

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const body = { code: f.code.trim(), name: f.name.trim(), description: f.description.trim() || undefined, permissions: f.permissions };
      return f.id ? api.patch<Role>(`/roles/${f.id}`, body) : api.post<Role>("/roles", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      toast.success(t("common.saved"));
      setForm(null);
    },
    onError: toast.error,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/roles/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      toast.success(t("common.deleted"));
      setToDelete(null);
    },
    onError: (e) => (toast.error(e), setToDelete(null)),
  });

  const toggle = (code: string, on: boolean) =>
    setForm((f) => (f ? { ...f, permissions: on ? [...f.permissions, code] : f.permissions.filter((c) => c !== code) } : f));
  const toggleGroup = (items: Permission[], on: boolean) =>
    setForm((f) => {
      if (!f) return f;
      const codes = new Set(items.map((i) => i.code));
      return { ...f, permissions: on ? [...new Set([...f.permissions, ...codes])] : f.permissions.filter((c) => !codes.has(c)) };
    });

  return (
    <>
      <PageHeader
        title={t("nav.roles")}
        actions={
          <Button onClick={() => setForm({ code: "", name: "", description: "", permissions: [], isSystem: false })}>
            <Plus className="h-4 w-4" />
            {t("roles.new")}
          </Button>
        }
      />
      {roles.isLoading ? (
        <LoadingBlock />
      ) : !roles.data?.length ? (
        <Card>
          <EmptyState title={t("roles.empty")} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roles.data.map((r) => (
            <Card key={r.id}>
              <CardBody className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-1.5 truncate font-semibold text-slate-900">
                      {r.isSystem && <Lock className="h-3.5 w-3.5 text-slate-400" />}
                      {r.name}
                    </h3>
                    <p className="font-mono text-xs text-slate-500">{r.code}</p>
                  </div>
                  <div className="flex shrink-0">
                    <button
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                      title={t("common.edit")}
                      onClick={() => setForm({ id: r.id, code: r.code, name: r.name, description: r.description ?? "", permissions: r.permissions, isSystem: r.isSystem })}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {!r.isSystem && (
                      <button className="rounded p-1.5 text-red-500 hover:bg-red-50" title={t("common.delete")} onClick={() => setToDelete(r)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                {r.description && <p className="text-sm text-slate-600">{r.description}</p>}
                <div className="flex gap-2 pt-1">
                  <Badge tone="indigo">{t("roles.permCount", { count: r.permissions.length })}</Badge>
                  <Badge tone="gray">{t("roles.userCount", { count: r.userCount })}</Badge>
                  {r.isSystem && <Badge tone="amber">{t("roles.system")}</Badge>}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? t("roles.edit") : t("roles.new")}
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setForm(null)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={!form?.name.trim() || !form?.code.trim()} loading={save.isPending} onClick={() => form && save.mutate(form)}>
              {t("common.save")}
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("common.code")} required>
                <Input value={form.code} disabled={form.isSystem} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s+/g, "_") })} />
              </Field>
              <Field label={t("common.name")} required>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label={t("common.description")} className="sm:col-span-2">
                <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">{t("roles.permissions")}</p>
              <div className="grid gap-4 md:grid-cols-2">
                {grouped.map(([group, items]) => (
                  <div key={group} className="rounded-lg border border-slate-200 p-3">
                    <Checkbox
                      className="mb-2 font-semibold"
                      label={t(`permGroup.${group}`) === `permGroup.${group}` ? group : t(`permGroup.${group}`)}
                      checked={items.every((i) => form.permissions.includes(i.code))}
                      onChange={(e) => toggleGroup(items, e.target.checked)}
                    />
                    <div className="space-y-1.5 pl-6">
                      {items.map((p) => (
                        <Checkbox
                          key={p.code}
                          className="flex"
                          label={
                            <span>
                              {t(`perm.${p.code}`) === `perm.${p.code}` ? p.code : t(`perm.${p.code}`)}
                              <span className="ml-1.5 font-mono text-[11px] text-slate-400">{p.code}</span>
                            </span>
                          }
                          checked={form.permissions.includes(p.code)}
                          onChange={(e) => toggle(p.code, e.target.checked)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        loading={remove.isPending}
        title={t("common.delete")}
        message={t("roles.deleteConfirm", { name: toDelete?.name ?? "" })}
        confirmLabel={t("common.delete")}
      />
    </>
  );
}
