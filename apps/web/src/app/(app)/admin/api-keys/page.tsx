"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  Badge, Button, Card, Checkbox, ConfirmDialog, DatePicker, Dialog, EmptyState, Field, Input, LoadingBlock, PageHeader, Table, TBody, TD, TH, THead, TR,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { CopyButton } from "@/components/credential-dialog";

interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  permissions: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}
interface CreatedKey extends Omit<ApiKeyItem, "lastUsedAt" | "revokedAt" | "createdAt"> {
  key: string;
}

export default function ApiKeysPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => api.get<ApiKeyItem[]>("/api-keys") });
  const perms = useQuery({ queryKey: ["roles", "permissions"], queryFn: () => api.get<{ code: string; group: string }[]>("/roles/permissions"), staleTime: 5 * 60_000 });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [expires, setExpires] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [toRevoke, setToRevoke] = useState<ApiKeyItem | null>(null);

  const label = (c: string) => (t(`perm.${c}`) === `perm.${c}` ? c : t(`perm.${c}`));
  const sorted = useMemo(() => perms.data ?? [], [perms.data]);

  const create = useMutation({
    mutationFn: () => api.post<CreatedKey>("/api-keys", { name: name.trim(), permissions: selected, expiresAt: expires || undefined }),
    onSuccess: (k) => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      setOpen(false);
      setName("");
      setExpires("");
      setSelected([]);
      setCreated(k);
    },
    onError: toast.error,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.del(`/api-keys/${id}`),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ["api-keys"] }), setToRevoke(null), toast.success(t("common.saved"))),
    onError: toast.error,
  });

  return (
    <>
      <PageHeader
        title={t("nav.apiKeys")}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("apiKeys.new")}
          </Button>
        }
      />
      <Card>
        {keys.isLoading ? (
          <LoadingBlock />
        ) : !keys.data?.length ? (
          <EmptyState title={t("apiKeys.empty")} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t("common.name")}</TH>
                <TH>{t("apiKeys.prefix")}</TH>
                <TH>{t("apiKeys.permissions")}</TH>
                <TH>{t("apiKeys.expiresAt")}</TH>
                <TH>{t("apiKeys.lastUsed")}</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {keys.data.map((k) => (
                <TR key={k.id}>
                  <TD className="font-medium text-slate-900">{k.name}</TD>
                  <TD className="font-mono text-xs">{k.prefix}…</TD>
                  <TD>
                    <Badge tone="indigo">{k.permissions.length}</Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-xs">{k.expiresAt ? formatDate(k.expiresAt, locale) : t("apiKeys.never")}</TD>
                  <TD className="whitespace-nowrap text-xs">{k.lastUsedAt ? formatDateTime(k.lastUsedAt, locale) : "-"}</TD>
                  <TD className="text-right">
                    {k.revokedAt ? (
                      <Badge tone="muted">{t("apiKeys.revoked")}</Badge>
                    ) : (
                      <button title={t("apiKeys.revoke")} className="rounded p-1.5 text-red-500 hover:bg-red-50" onClick={() => setToRevoke(k)}>
                        <Ban className="h-4 w-4" />
                      </button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("apiKeys.new")}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={!name.trim() || !selected.length} loading={create.isPending} onClick={() => create.mutate()}>
              {t("common.create")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("common.name")} required>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label={t("apiKeys.expiresAt")}>
              <DatePicker value={expires} onChange={(e) => setExpires(e.target.value)} />
            </Field>
          </div>
          <Field label={t("apiKeys.permissions")} required>
            <div className="grid max-h-64 gap-1.5 overflow-y-auto rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
              {sorted.map((p) => (
                <Checkbox
                  key={p.code}
                  label={label(p.code)}
                  checked={selected.includes(p.code)}
                  onChange={(e) => setSelected(e.target.checked ? [...selected, p.code] : selected.filter((c) => c !== p.code))}
                />
              ))}
            </div>
          </Field>
        </div>
      </Dialog>

      <Dialog open={!!created} onClose={() => setCreated(null)} title={t("apiKeys.createdTitle")} footer={<Button onClick={() => setCreated(null)}>{t("common.close")}</Button>}>
        {created && (
          <div className="space-y-4">
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t("apiKeys.onceWarning")}</p>
            <p className="break-all rounded-lg bg-slate-100 p-3 font-mono text-sm">{created.key}</p>
            <CopyButton text={created.key} />
            <p className="text-sm text-slate-600">{t("apiKeys.usageNote")}</p>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!toRevoke}
        onClose={() => setToRevoke(null)}
        onConfirm={() => toRevoke && revoke.mutate(toRevoke.id)}
        loading={revoke.isPending}
        title={t("apiKeys.revoke")}
        message={t("apiKeys.revokeConfirm", { name: toRevoke?.name ?? "" })}
        confirmLabel={t("apiKeys.revoke")}
      />
    </>
  );
}
