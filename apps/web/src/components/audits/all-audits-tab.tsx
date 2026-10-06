"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Download, Plus } from "lucide-react";
import { AUDIT_STATUSES, AUDIT_TEMPLATE_TYPES, PERMISSIONS, type AuditListItem, type AuditStatus, type AuditTemplateType, type Paginated } from "@lean/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useDebounce } from "@/hooks/use-debounce";
import { Button, Card, Checkbox, EmptyState, Input, LoadingBlock, Pagination, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { A, AreaSelect, AuditStatusBadge, ScoreBadge, fmtDay } from "./audit-bits";
import { NewAuditDialog } from "./new-audit-dialog";

const PAGE_SIZE = 20;

export function AllAuditsTab() {
  const { t, locale } = useI18n();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canManage = hasPermission(PERMISSIONS.AUDIT_MANAGE);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<AuditStatus | "">("");
  const [type, setType] = useState<AuditTemplateType | "">("");
  const [areaId, setAreaId] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [assign, setAssign] = useState(false);
  const dq = useDebounce(q);

  const params = {
    view: "all", q: dq || undefined, status: status || undefined, templateType: type || undefined, areaId: areaId || undefined,
    overdue: overdue || undefined, from: from || undefined, to: to || undefined,
  } as const;
  const { data, isLoading } = useQuery({
    queryKey: ["audits", "list", "all", params, page],
    queryFn: () => api.get<Paginated<AuditListItem>>("/audits", { ...params, page, pageSize: PAGE_SIZE, sort: "dueDate:desc" }),
  });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Input value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder={t(`${A}.common.search`)} className="sm:col-span-2" />
          <Select value={status} onChange={(e) => reset(setStatus)(e.target.value as AuditStatus | "")}>
            <option value="">{t(`${A}.all.allStatuses`)}</option>
            {AUDIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`${A}.status.${s}`)}
              </option>
            ))}
          </Select>
          <Select value={type} onChange={(e) => reset(setType)(e.target.value as AuditTemplateType | "")}>
            <option value="">{t(`${A}.all.allTypes`)}</option>
            {AUDIT_TEMPLATE_TYPES.map((s) => (
              <option key={s} value={s}>
                {t(`${A}.templateType.${s}`)}
              </option>
            ))}
          </Select>
          <AreaSelect value={areaId} onChange={reset(setAreaId)} placeholder={t(`${A}.common.area`)} />
          <Input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label={t(`${A}.common.from`)} />
          <Input type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label={t(`${A}.common.to`)} />
          <div className="flex items-center justify-between gap-2">
            <Checkbox label={t(`${A}.all.onlyOverdue`)} checked={overdue} onChange={(e) => reset(setOverdue)(e.target.checked)} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => api.download("/audits/export", "denetimler.xlsx", { ...params }).catch(toast.error)}>
            <Download className="h-4 w-4" />
            {t(`${A}.all.export`)}
          </Button>
          {canManage && (
            <Button onClick={() => setAssign(true)}>
              <Plus className="h-4 w-4" />
              {t(`${A}.all.newAudit`)}
            </Button>
          )}
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <LoadingBlock />
        ) : !data?.items.length ? (
          <EmptyState title={t(`${A}.all.empty`)} />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>{t(`${A}.all.number`)}</TH>
                  <TH>{t(`${A}.common.area`)}</TH>
                  <TH>{t(`${A}.common.template`)}</TH>
                  <TH>{t(`${A}.common.auditor`)}</TH>
                  <TH>{t(`${A}.common.dueDate`)}</TH>
                  <TH>{t("common.status")}</TH>
                  <TH>{t(`${A}.common.score`)}</TH>
                  <TH>{t(`${A}.common.findings`)}</TH>
                </tr>
              </THead>
              <TBody>
                {data.items.map((a) => (
                  <TR key={a.id} className={a.isOverdue ? "bg-red-50/40" : undefined}>
                    <TD className="whitespace-nowrap font-mono text-xs">
                      <Link href={`/audits/${a.id}`} className="text-brand-700 hover:underline">
                        {a.code}
                      </Link>
                    </TD>
                    <TD className="font-medium text-slate-900">{a.area.name}</TD>
                    <TD>{a.template.name}</TD>
                    <TD>{a.auditor.fullName}</TD>
                    <TD className="whitespace-nowrap">{fmtDay(a.dueDate, locale)}</TD>
                    <TD>
                      <AuditStatusBadge status={a.status} overdue={a.isOverdue} />
                    </TD>
                    <TD>
                      <ScoreBadge pct={a.scorePct} />
                    </TD>
                    <TD className="tabular-nums">{a.findingCount || "–"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
          </>
        )}
      </Card>
      <NewAuditDialog open={assign} onClose={() => setAssign(false)} canAssign />
    </div>
  );
}
