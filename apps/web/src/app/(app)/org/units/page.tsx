"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Network, Pencil, Plus, Trash2, Users } from "lucide-react";
import { ORG_UNIT_TYPES, PERMISSIONS, type OrgUnit, type OrgUnitNode, type OrgUnitType } from "@lean/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  Badge, Button, Card, ConfirmDialog, Dialog, EmployeePicker, EmptyState, Field, Input, LoadingBlock, OrgUnitSelect, PageHeader, Select, useOrgTree,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";

interface FormState {
  id?: string;
  name: string;
  code: string;
  type: OrgUnitType;
  parentId: string | null;
  managerEmployeeId: string | null;
  managerName: string | null;
  sortOrder: string;
}

const emptyForm = (parentId: string | null = null): FormState => ({
  name: "", code: "", type: "DEPARTMENT", parentId, managerEmployeeId: null, managerName: null, sortOrder: "0",
});

function TreeNode({
  node, depth, canManage, onAdd, onEdit, onDelete,
}: {
  node: OrgUnitNode;
  depth: number;
  canManage: boolean;
  onAdd: (n: OrgUnitNode) => void;
  onEdit: (n: OrgUnitNode) => void;
  onDelete: (n: OrgUnitNode) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children?.length > 0;
  return (
    <li>
      <div
        className={cn("group flex items-center gap-2 rounded-lg py-1.5 pr-2 hover:bg-slate-50", !node.isActive && "opacity-50")}
        style={{ paddingLeft: depth * 20 + 8 }}
      >
        <button onClick={() => setOpen((o) => !o)} className={cn("h-5 w-5 text-slate-400", !hasChildren && "invisible")}>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <Network className="h-4 w-4 shrink-0 text-brand-500" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-900">{node.name}</span>
            {node.code && <span className="font-mono text-xs text-slate-400">{node.code}</span>}
            <Badge tone="indigo">{t(`orgType.${node.type}`)}</Badge>
          </div>
          {node.managerName && <p className="text-xs text-slate-500">{t("org.manager")}: {node.managerName}</p>}
        </div>
        <span className="hidden items-center gap-1 text-xs text-slate-500 sm:flex">
          <Users className="h-3.5 w-3.5" />
          {node.employeeCount}
        </span>
        {canManage && (
          <span className="flex gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
            <button title={t("org.addChild")} className="rounded p-1.5 text-slate-500 hover:bg-slate-200" onClick={() => onAdd(node)}>
              <Plus className="h-4 w-4" />
            </button>
            <button title={t("common.edit")} className="rounded p-1.5 text-slate-500 hover:bg-slate-200" onClick={() => onEdit(node)}>
              <Pencil className="h-4 w-4" />
            </button>
            <button title={t("common.delete")} className="rounded p-1.5 text-red-500 hover:bg-red-50" onClick={() => onDelete(node)}>
              <Trash2 className="h-4 w-4" />
            </button>
          </span>
        )}
      </div>
      {hasChildren && open && (
        <ul>
          {node.children.map((c) => (
            <TreeNode key={c.id} node={c} depth={depth + 1} canManage={canManage} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function OrgUnitsPage() {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.ORG_MANAGE);
  const { data, isLoading } = useOrgTree();
  const [form, setForm] = useState<FormState | null>(null);
  const [toDelete, setToDelete] = useState<OrgUnitNode | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["org-units"] });
  const save = useMutation({
    mutationFn: (f: FormState) => {
      const body = {
        name: f.name.trim(),
        code: f.code.trim() || undefined,
        type: f.type,
        parentId: f.parentId ?? undefined,
        managerEmployeeId: f.managerEmployeeId ?? undefined,
        sortOrder: Number(f.sortOrder) || 0,
      };
      return f.id ? api.patch<OrgUnit>(`/org-units/${f.id}`, { ...body, parentId: f.parentId, managerEmployeeId: f.managerEmployeeId }) : api.post<OrgUnit>("/org-units", body);
    },
    onSuccess: () => {
      invalidate();
      toast.success(t("common.saved"));
      setForm(null);
    },
    onError: toast.error,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/org-units/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success(t("common.deleted"));
      setToDelete(null);
    },
    onError: (e) => {
      toast.error(e);
      setToDelete(null);
    },
  });

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <>
      <PageHeader
        title={t("nav.orgUnits")}
        description={t("org.unitsDesc")}
        actions={
          canManage && (
            <Button onClick={() => setForm(emptyForm())}>
              <Plus className="h-4 w-4" />
              {t("org.addRoot")}
            </Button>
          )
        }
      />
      <Card className="p-2">
        {isLoading ? (
          <LoadingBlock />
        ) : !data?.length ? (
          <EmptyState title={t("org.noUnits")} />
        ) : (
          <ul>
            {data.map((n) => (
              <TreeNode
                key={n.id}
                node={n}
                depth={0}
                canManage={canManage}
                onAdd={(p) => setForm(emptyForm(p.id))}
                onEdit={(n) =>
                  setForm({
                    id: n.id, name: n.name, code: n.code ?? "", type: n.type, parentId: n.parentId,
                    managerEmployeeId: n.managerEmployeeId, managerName: n.managerName, sortOrder: String(n.sortOrder),
                  })
                }
                onDelete={setToDelete}
              />
            ))}
          </ul>
        )}
      </Card>

      <Dialog
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? t("org.editUnit") : t("org.newUnit")}
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("common.name")} required className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
            </Field>
            <Field label={t("common.code")}>
              <Input value={form.code} onChange={(e) => set("code", e.target.value)} />
            </Field>
            <Field label={t("common.type")} required>
              <Select value={form.type} onChange={(e) => set("type", e.target.value as OrgUnitType)}>
                {ORG_UNIT_TYPES.map((x) => (
                  <option key={x} value={x}>
                    {t(`orgType.${x}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("org.parent")}>
              <OrgUnitSelect value={form.parentId} onChange={(v) => set("parentId", v)} excludeId={form.id} placeholder={t("org.noParent")} />
            </Field>
            <Field label={t("common.sortOrder")}>
              <Input type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
            </Field>
            <Field label={t("org.manager")} className="sm:col-span-2">
              <EmployeePicker
                value={form.managerEmployeeId}
                valueLabel={form.managerName}
                onChange={(id, o) => {
                  set("managerEmployeeId", id);
                  set("managerName", o?.label ?? null);
                }}
              />
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
        message={t("org.deleteConfirm", { name: toDelete?.name ?? "" })}
        confirmLabel={t("common.delete")}
      />
    </>
  );
}
