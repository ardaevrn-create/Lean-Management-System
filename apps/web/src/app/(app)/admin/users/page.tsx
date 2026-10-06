"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, KeyRound, Plus, Search, ShieldCheck, Trash2, UserCheck, UserX, Users } from "lucide-react";
import type { CreatedCredential, Employee, Paginated, Role, UserListItem } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { downloadCsv, formatDateTime } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import {
  Badge, Button, Card, Checkbox, ConfirmDialog, Dialog, EmployeePicker, EmptyState, Field, Input, LoadingBlock, OrgUnitSelect, PageHeader, Pagination, Select, Table, TBody, TD, TH, THead, TR,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { CopyButton, CredentialDialog } from "@/components/credential-dialog";

const PAGE_SIZE = 20;

function useRoles() {
  return useQuery({ queryKey: ["roles"], queryFn: () => api.get<Role[]>("/roles"), staleTime: 60_000 });
}

export default function UsersPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [active, setActive] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounce(q);
  const [creating, setCreating] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [credential, setCredential] = useState<CreatedCredential | null>(null);
  const [rolesFor, setRolesFor] = useState<UserListItem | null>(null);
  const [resetFor, setResetFor] = useState<UserListItem | null>(null);

  const params = { q: dq || undefined, isActive: active || undefined, page, pageSize: PAGE_SIZE };
  const { data, isLoading } = useQuery({
    queryKey: ["users", "list", params],
    queryFn: () => api.get<Paginated<UserListItem>>("/users", params),
    placeholderData: (p) => p,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["users"] });
  const toggle = useMutation({
    mutationFn: (u: UserListItem) => api.patch<UserListItem>(`/users/${u.id}`, { isActive: !u.isActive }),
    onSuccess: () => (invalidate(), toast.success(t("common.saved"))),
    onError: toast.error,
  });
  const reset = useMutation({
    mutationFn: (u: UserListItem) => api.post<CreatedCredential>(`/users/${u.id}/reset-password`),
    onSuccess: (c) => (invalidate(), setResetFor(null), setCredential(c)),
    onError: toast.error,
  });

  return (
    <>
      <PageHeader
        title={t("nav.users")}
        actions={
          <>
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              <Users className="h-4 w-4" />
              {t("users.bulkFromEmployees")}
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              {t("users.new")}
            </Button>
          </>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input className="pl-9" placeholder={t("common.search")} value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} />
          </div>
          <Select className="md:w-48" value={active} onChange={(e) => (setActive(e.target.value), setPage(1))}>
            <option value="">{t("common.all")}</option>
            <option value="true">{t("common.active")}</option>
            <option value="false">{t("common.inactive")}</option>
          </Select>
        </div>
        {isLoading || !data ? (
          <LoadingBlock />
        ) : data.items.length === 0 ? (
          <EmptyState title={t("users.empty")} />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>{t("users.user")}</TH>
                  <TH>{t("users.roles")}</TH>
                  <TH>{t("employees.orgUnit")}</TH>
                  <TH>{t("users.lastLogin")}</TH>
                  <TH>{t("common.status")}</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {data.items.map((u) => (
                  <TR key={u.id}>
                    <TD>
                      <div className="font-medium text-slate-900">{u.fullName}</div>
                      <div className="font-mono text-xs text-slate-500">{u.username}</div>
                    </TD>
                    <TD>
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {u.roles.map((r, i) => (
                          <Badge key={i} tone="indigo">
                            {r.roleName}
                            {r.orgUnitName && <span className="text-indigo-400">· {r.orgUnitName}</span>}
                          </Badge>
                        ))}
                      </div>
                    </TD>
                    <TD>{u.orgUnitName ?? "-"}</TD>
                    <TD className="whitespace-nowrap text-xs">{formatDateTime(u.lastLoginAt, locale)}</TD>
                    <TD>
                      <Badge tone={u.isActive ? "green" : "muted"}>{u.isActive ? t("common.active") : t("common.inactive")}</Badge>
                      {u.mustChangePassword && <Badge tone="amber" className="ml-1">{t("users.mustChange")}</Badge>}
                    </TD>
                    <TD className="whitespace-nowrap text-right">
                      <button title={t("users.editRoles")} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setRolesFor(u)}>
                        <ShieldCheck className="h-4 w-4" />
                      </button>
                      <button title={t("users.resetPassword")} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setResetFor(u)}>
                        <KeyRound className="h-4 w-4" />
                      </button>
                      <button
                        title={u.isActive ? t("users.deactivate") : t("users.activate")}
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                        onClick={() => toggle.mutate(u)}
                      >
                        {u.isActive ? <UserX className="h-4 w-4 text-red-500" /> : <UserCheck className="h-4 w-4 text-emerald-600" />}
                      </button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
          </>
        )}
      </Card>

      <CreateUserDialog open={creating} onClose={() => setCreating(false)} onCreated={(c) => (setCreating(false), setCredential(c))} />
      <RolesDialog user={rolesFor} onClose={() => setRolesFor(null)} />
      <BulkDialog open={bulkOpen} onClose={() => setBulkOpen(false)} />
      <ConfirmDialog
        open={!!resetFor}
        onClose={() => setResetFor(null)}
        onConfirm={() => resetFor && reset.mutate(resetFor)}
        loading={reset.isPending}
        danger={false}
        title={t("users.resetPassword")}
        message={t("users.resetConfirm", { name: resetFor?.fullName ?? "" })}
      />
      <CredentialDialog credential={credential} onClose={() => setCredential(null)} />
    </>
  );
}

function CreateUserDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (c: CreatedCredential) => void }) {
  const t = useT2();
  const toast = useToast();
  const qc = useQueryClient();
  const roles = useRoles();
  const [f, setF] = useState({ username: "", fullName: "", email: "", password: "", employeeId: null as string | null, roleIds: [] as string[] });
  const create = useMutation({
    mutationFn: () =>
      api.post<CreatedCredential>("/users", {
        username: f.username.trim(),
        fullName: f.fullName.trim(),
        email: f.email.trim() || undefined,
        password: f.password || undefined,
        employeeId: f.employeeId ?? undefined,
        roleIds: f.roleIds.length ? f.roleIds : undefined,
      }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setF({ username: "", fullName: "", email: "", password: "", employeeId: null, roleIds: [] });
      onCreated(c);
    },
    onError: toast.error,
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("users.new")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!f.username.trim() || !f.fullName.trim()} loading={create.isPending} onClick={() => create.mutate()}>
            {t("common.create")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("auth.username")} required>
          <Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoFocus />
        </Field>
        <Field label={t("users.fullName")} required>
          <Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
        </Field>
        <Field label={t("common.email")}>
          <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label={t("auth.password")} hint={t("users.passwordHint")}>
          <Input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="off" />
        </Field>
        <Field label={t("users.linkedEmployee")} className="sm:col-span-2">
          <EmployeePicker value={f.employeeId} onChange={(id) => setF({ ...f, employeeId: id })} />
        </Field>
        <Field label={t("users.roles")} className="sm:col-span-2">
          <div className="grid gap-1.5 sm:grid-cols-2">
            {roles.data?.map((r) => (
              <Checkbox
                key={r.id}
                label={r.name}
                checked={f.roleIds.includes(r.id)}
                onChange={(e) => setF({ ...f, roleIds: e.target.checked ? [...f.roleIds, r.id] : f.roleIds.filter((x) => x !== r.id) })}
              />
            ))}
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

function useT2() {
  return useI18n().t;
}

function RolesDialog({ user, onClose }: { user: UserListItem | null; onClose: () => void }) {
  const t = useT2();
  const toast = useToast();
  const qc = useQueryClient();
  const roles = useRoles();
  const [rows, setRows] = useState<{ roleId: string; orgUnitId: string | null }[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (user && loadedFor !== user.id) {
    setLoadedFor(user.id);
    setRows(user.roles.map((r) => ({ roleId: r.roleId, orgUnitId: r.orgUnitId })));
  }
  const save = useMutation({
    mutationFn: () =>
      api.put<UserListItem>(`/users/${user!.id}/roles`, {
        assignments: rows.filter((r) => r.roleId).map((r) => ({ roleId: r.roleId, orgUnitId: r.orgUnitId ?? undefined })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("common.saved"));
      setLoadedFor(null);
      onClose();
    },
    onError: toast.error,
  });
  const close = () => (setLoadedFor(null), onClose());
  return (
    <Dialog
      open={!!user}
      onClose={close}
      title={`${t("users.editRoles")}: ${user?.fullName ?? ""}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-500">{t("users.scopeHint")}</p>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
            <Select value={r.roleId} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, roleId: e.target.value } : x)))}>
              <option value="">{t("common.select")}</option>
              {roles.data?.map((ro) => (
                <option key={ro.id} value={ro.id}>
                  {ro.name}
                </option>
              ))}
            </Select>
            <OrgUnitSelect value={r.orgUnitId} placeholder={t("users.wholeCompany")} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, orgUnitId: v } : x)))} />
            <button className="rounded p-1.5 text-red-500 hover:bg-red-50" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setRows([...rows, { roleId: "", orgUnitId: null }])}>
          <Plus className="h-4 w-4" />
          {t("users.addRole")}
        </Button>
      </div>
    </Dialog>
  );
}

function BulkDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT2();
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const dq = useDebounce(q);
  const [selected, setSelected] = useState<Record<string, Employee>>({});
  const [result, setResult] = useState<CreatedCredential[] | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["employees", "bulk", dq],
    enabled: open && !result,
    queryFn: () => api.get<Paginated<Employee>>("/employees", { q: dq || undefined, isActive: true, withoutUser: true, pageSize: 100 }),
  });
  const candidates = useMemo(() => data?.items.filter((e) => !e.user) ?? [], [data]);

  const run = useMutation({
    mutationFn: () => api.post<CreatedCredential[]>("/users/bulk-from-employees", { employeeIds: Object.keys(selected) }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: toast.error,
  });

  const close = () => (setResult(null), setSelected({}), setQ(""), onClose());
  const names = (c: CreatedCredential) => {
    const e = Object.values(selected).find((x) => x.id === c.employeeId);
    return e?.fullName ?? "";
  };
  const rows = () => [[t("users.fullName"), t("auth.username"), t("credential.tempPassword")], ...(result ?? []).map((c) => [names(c), c.username, c.temporaryPassword])];
  const count = Object.keys(selected).length;

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t("users.bulkFromEmployees")}
      size="xl"
      footer={
        result ? (
          <>
            <CopyButton text={rows().map((r) => r.join("\t")).join("\n")} label={t("common.copy")} />
            <Button variant="outline" onClick={() => downloadCsv("credentials.csv", rows())}>
              <Download className="h-4 w-4" />
              {t("users.downloadCsv")}
            </Button>
            <Button onClick={close}>{t("common.close")}</Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={close}>
              {t("common.cancel")}
            </Button>
            <Button disabled={!count} loading={run.isPending} onClick={() => run.mutate()}>
              {t("users.createAccounts", { count })}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t("credential.warning")}</p>
          <Table>
            <THead>
              <tr>
                <TH>{t("users.fullName")}</TH>
                <TH>{t("auth.username")}</TH>
                <TH>{t("credential.tempPassword")}</TH>
              </tr>
            </THead>
            <TBody>
              {result.map((c) => (
                <TR key={c.userId}>
                  <TD>{names(c)}</TD>
                  <TD className="font-mono text-xs">{c.username}</TD>
                  <TD className="font-mono text-xs font-semibold">{c.temporaryPassword}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{t("users.bulkHint")}</p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input className="pl-9" placeholder={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {isLoading ? (
            <LoadingBlock />
          ) : candidates.length === 0 ? (
            <EmptyState title={t("users.noCandidates")} />
          ) : (
            <>
              <Checkbox
                label={t("common.selectAll")}
                checked={candidates.every((e) => selected[e.id])}
                onChange={(ev) => setSelected(ev.target.checked ? { ...selected, ...Object.fromEntries(candidates.map((e) => [e.id, e])) } : {})}
              />
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {candidates.map((e) => (
                  <li key={e.id} className="px-3 py-2">
                    <Checkbox
                      label={
                        <span>
                          <span className="font-medium">{e.fullName}</span>
                          <span className="ml-2 text-xs text-slate-500">
                            {e.employeeNo} {e.orgUnit && `· ${e.orgUnit.name}`}
                          </span>
                        </span>
                      }
                      checked={!!selected[e.id]}
                      onChange={(ev) => {
                        const next = { ...selected };
                        if (ev.target.checked) next[e.id] = e;
                        else delete next[e.id];
                        setSelected(next);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
