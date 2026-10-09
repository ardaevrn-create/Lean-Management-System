"use client";

import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AuditLogItem, Paginated } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { Badge, Card, EmptyState, Input, LoadingBlock, PageHeader, Pagination, Table, TBody, TD, TH, THead, TR, UserPicker } from "@/components/ui";

const PAGE_SIZE = 30;

export default function AuditLogsPage() {
  const { t, locale } = useI18n();
  const [entity, setEntity] = useState("");
  const [entityId, setEntityId] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const dEntity = useDebounce(entity);
  const dEntityId = useDebounce(entityId);

  const params = { entity: dEntity || undefined, entityId: dEntityId || undefined, userId: userId ?? undefined, page, pageSize: PAGE_SIZE };
  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => api.get<Paginated<AuditLogItem>>("/audit-logs", params),
    placeholderData: (p) => p,
  });

  return (
    <>
      <PageHeader title={t("nav.auditLogs")} />
      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-3">
          <Input placeholder={t("audit.entity")} value={entity} onChange={(e) => (setEntity(e.target.value), setPage(1))} />
          <Input placeholder={t("audit.entityId")} value={entityId} onChange={(e) => (setEntityId(e.target.value), setPage(1))} />
          <UserPicker value={userId} placeholder={t("audit.user")} onChange={(id) => (setUserId(id), setPage(1))} />
        </div>
        {isLoading || !data ? (
          <LoadingBlock />
        ) : data.items.length === 0 ? (
          <EmptyState title={t("audit.empty")} />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH className="w-8" />
                  <TH>{t("audit.date")}</TH>
                  <TH>{t("audit.user")}</TH>
                  <TH>{t("audit.action")}</TH>
                  <TH>{t("audit.entity")}</TH>
                  <TH>{t("audit.entityId")}</TH>
                </tr>
              </THead>
              <TBody>
                {data.items.map((l) => (
                  <Fragment key={l.id}>
                    <TR className="cursor-pointer" onClick={() => setOpen(open === l.id ? null : l.id)}>
                      <TD>{open === l.id ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}</TD>
                      <TD className="whitespace-nowrap text-xs">{formatDateTime(l.createdAt, locale)}</TD>
                      <TD>{l.user?.fullName ?? "-"}</TD>
                      <TD>
                        <Badge tone={l.action === "DELETE" ? "red" : l.action === "CREATE" ? "green" : "blue"}>{l.action}</Badge>
                      </TD>
                      <TD>{l.entity}</TD>
                      <TD className="font-mono text-xs text-slate-500">{l.entityId}</TD>
                    </TR>
                    {open === l.id && (
                      <tr>
                        <td colSpan={6} className="bg-slate-50 px-6 py-3">
                          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-700">{JSON.stringify(l.diff, null, 2)}</pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </TBody>
            </Table>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
