"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, UserX } from "lucide-react";
import type { CreatedCredential, Employee, Paginated } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { toDateInput } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import {
  Badge, Button, Card, Checkbox, ConfirmDialog, DatePicker, Dialog, EmployeePicker, EmptyState, Field, Input, LoadingBlock, OrgUnitSelect, PageHeader, Pagination, Table, TBody, TD, TH, THead, TR,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { CredentialDialog } from "@/components/credential-dialog";

interface FormState {
  id?: string;
  employeeNo: string;
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  phone: string;
  hireDate: string;
  orgUnitId: string | null;
  managerId: string | null;
  managerName: string | null;
  isActive: boolean;
  createUser: boolean;
  hasUser: boolean;
}

const emptyForm: FormState = {
  employeeNo: "", firstName: "", lastName: "", title: "", email: "", phone: "", hireDate: "",
  orgUnitId: null, managerId: null, managerName: null, isActive: true, createUser: false, hasUser: false,
};
const PAGE_SIZE = 20;

export default function EmployeesPage() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [orgUnitId, setOrgUnitId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<FormState | null>(null);
  const [credential, setCredential] = useState<CreatedCredential | null>(null);
  const [toDeactivate, setToDeactivate] = useState<Employee | null>(null);
  const dq = useDebounce(q);

  const params = { q: dq || undefined, orgUnitId: orgUnitId ?? undefined, includeSubUnits: orgUnitId ? true : undefined, page, pageSize: PAGE_SIZE };
  const { data, isLoading } = useQuery({
    queryKey: ["employees", "list", params],
    queryFn: () => api.get<Paginated<Employee>>("/employees", params),
    placeholderData: (p) => p,
  });

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const body = {
        employeeNo: f.employeeNo.trim(),
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim(),
        title: f.title.trim() || undefined,
        email: f.email.trim() || undefined,
        phone: f.phone.trim() || undefined,
        hireDate: f.hireDate || undefined,
        orgUnitId: f.orgUnitId ?? undefined,
        managerId: f.managerId ?? undefined,
      };
      return f.id
        ? api.patch<Employee>(`/employees/${f.id}`, { ...body, isActive: f.isActive })
        : api.post<Employee & { credential?: CreatedCredential }>("/employees", { ...body, createUser: f.createUser });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["org-units"] });
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("common.saved"));
      setForm(null);
      const cred = (res as { credential?: CreatedCredential }).credential;
      if (cred) setCredential(cred);
    },
    onError: toast.error,
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => api.del(`/employees/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success(t("employees.deactivated"));
      setToDeactivate(null);
    },
    onError: toast.error,
  });

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const valid = form && form.employeeNo.trim() && form.firstName.trim() && form.lastName.trim();

  return (
    <>
      <PageHeader
        title={t("nav.employees")}
        actions={
          <Button onClick={() => setForm({ ...emptyForm })}>
            <Plus className="h-4 w-4" />
            {t("employees.new")}
          </Button>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input className="pl-9" placeholder={t("employees.searchPlaceholder")} value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} />
          </div>
          <div className="md:w-64">
            <OrgUnitSelect value={orgUnitId} onChange={(v) => (setOrgUnitId(v), setPage(1))} placeholder={t("employees.allUnits")} />
          </div>
        </div>
        {isLoading || !data ? (
          <LoadingBlock />
        ) : data.items.length === 0 ? (
          <EmptyState title={t("employees.empty")} />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>{t("employees.no")}</TH>
                  <TH>{t("common.name")}</TH>
                  <TH>{t("employees.titleField")}</TH>
                  <TH>{t("employees.orgUnit")}</TH>
                  <TH>{t("employees.account")}</TH>
                  <TH>{t("common.status")}</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {data.items.map((e) => (
                  <TR key={e.id}>
                    <TD className="font-mono text-xs">{e.employeeNo}</TD>
                    <TD>
                      <div className="font-medium text-slate-900">{e.fullName}</div>
                      {e.email && <div className="text-xs text-slate-500">{e.email}</div>}
                    </TD>
                    <TD>{e.title ?? "-"}</TD>
                    <TD>{e.orgUnit?.name ?? "-"}</TD>
                    <TD>{e.user ? <Badge tone="green">{e.user.username}</Badge> : <span className="text-slate-400">-</span>}</TD>
                    <TD>
                      <Badge tone={e.isActive ? "green" : "muted"}>{e.isActive ? t("common.active") : t("common.inactive")}</Badge>
                    </TD>
                    <TD className="whitespace-nowrap text-right">
                      <button
                        title={t("common.edit")}
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                        onClick={() =>
                          setForm({
                            id: e.id, employeeNo: e.employeeNo, firstName: e.firstName, lastName: e.lastName, title: e.title ?? "",
                            email: e.email ?? "", phone: e.phone ?? "", hireDate: toDateInput(e.hireDate), orgUnitId: e.orgUnit?.id ?? null,
                            managerId: e.manager?.id ?? null, managerName: e.manager?.fullName ?? null, isActive: e.isActive,
                            createUser: false, hasUser: !!e.user,
                          })
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {e.isActive && (
                        <button title={t("employees.deactivate")} className="rounded p-1.5 text-red-500 hover:bg-red-50" onClick={() => setToDeactivate(e)}>
                          <UserX className="h-4 w-4" />
                        </button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
          </>
        )}
      </Card>

      <Dialog
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? t("employees.edit") : t("employees.new")}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setForm(null)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={!valid} loading={save.isPending} onClick={() => form && save.mutate(form)}>
              {t("common.save")}
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("employees.no")} required>
              <Input value={form.employeeNo} onChange={(e) => set("employeeNo", e.target.value)} autoFocus />
            </Field>
            <Field label={t("employees.titleField")}>
              <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <Field label={t("employees.firstName")} required>
              <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
            </Field>
            <Field label={t("employees.lastName")} required>
              <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
            </Field>
            <Field label={t("common.email")}>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label={t("common.phone")}>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label={t("employees.hireDate")}>
              <DatePicker value={form.hireDate} onChange={(e) => set("hireDate", e.target.value)} />
            </Field>
            <Field label={t("employees.orgUnit")}>
              <OrgUnitSelect value={form.orgUnitId} onChange={(v) => set("orgUnitId", v)} />
            </Field>
            <Field label={t("employees.manager")} className="sm:col-span-2">
              <EmployeePicker
                value={form.managerId}
                valueLabel={form.managerName}
                onChange={(id, o) => (set("managerId", id), set("managerName", o?.label ?? null))}
              />
            </Field>
            {form.id ? (
              <Checkbox label={t("common.active")} checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />
            ) : (
              <div className="sm:col-span-2">
                <Checkbox label={t("employees.createUser")} checked={form.createUser} onChange={(e) => set("createUser", e.target.checked)} />
                <p className="ml-6 text-xs text-slate-500">{t("employees.createUserHint")}</p>
              </div>
            )}
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!toDeactivate}
        onClose={() => setToDeactivate(null)}
        onConfirm={() => toDeactivate && deactivate.mutate(toDeactivate.id)}
        loading={deactivate.isPending}
        title={t("employees.deactivate")}
        message={t("employees.deactivateConfirm", { name: toDeactivate?.fullName ?? "" })}
        confirmLabel={t("employees.deactivate")}
      />
      <CredentialDialog credential={credential} onClose={() => setCredential(null)} />
    </>
  );
}
