"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ClipboardCheck, Play, Plus } from "lucide-react";
import { PERMISSIONS, type AuditListItem, type Paginated } from "@lean/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button, Card, EmptyState, LoadingBlock } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { A, AuditStatusBadge, fmtDay } from "./audit-bits";
import { NewAuditDialog } from "./new-audit-dialog";

/** Denetçinin açık denetimleri: büyük, dokunmatik dostu kartlar. */
export function MyAuditsTab() {
  const { t, locale } = useI18n();
  const { hasPermission } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [adhoc, setAdhoc] = useState(false);
  const canPerform = hasPermission(PERMISSIONS.AUDIT_PERFORM);

  const { data, isLoading } = useQuery({
    queryKey: ["audits", "list", "mine"],
    queryFn: () => api.get<Paginated<AuditListItem>>("/audits", { view: "mine", open: true, pageSize: 100, sort: "dueDate:asc" }),
  });

  const start = useMutation({
    mutationFn: (id: string) => api.post(`/audits/${id}/start`),
    onSuccess: (_r, id) => {
      qc.invalidateQueries({ queryKey: ["audits"] });
      router.push(`/audits/${id}`);
    },
    onError: toast.error,
  });

  return (
    <div className="space-y-4">
      {canPerform && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setAdhoc(true)}>
            <Plus className="h-4 w-4" />
            {t(`${A}.mine.adhoc`)}
          </Button>
        </div>
      )}
      {isLoading ? (
        <LoadingBlock />
      ) : !data?.items.length ? (
        <Card>
          <EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title={t(`${A}.mine.empty`)} description={t(`${A}.mine.emptyHint`)} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((a) => (
            <Card key={a.id} className={cn("flex flex-col overflow-hidden", a.isOverdue && "border-red-300")}>
              <Link href={`/audits/${a.id}`} className="flex-1 space-y-2 p-4 hover:bg-slate-50/60">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs text-slate-500">{a.code}</span>
                  <AuditStatusBadge status={a.status} overdue={a.isOverdue} />
                </div>
                <h3 className="text-lg font-semibold leading-snug text-slate-900">{a.area.name}</h3>
                <p className="text-sm text-slate-600">
                  {a.template.name}
                  {a.equipment && <span className="text-slate-500"> · {a.equipment.name}</span>}
                </p>
                <p className={cn("flex items-center gap-1.5 text-sm", a.isOverdue ? "font-medium text-red-600" : "text-slate-500")}>
                  <CalendarClock className="h-4 w-4" />
                  {t(`${A}.dueOn`, { date: fmtDay(a.dueDate, locale) })}
                  {a.isOverdue && ` · ${t(`${A}.daysOverdue`, { n: a.daysOverdue })}`}
                </p>
                {a.status === "IN_PROGRESS" && (
                  <div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${a.questionCount ? (a.answeredCount / a.questionCount) * 100 : 0}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{t(`${A}.mine.progress`, { done: a.answeredCount, total: a.questionCount })}</p>
                  </div>
                )}
              </Link>
              <div className="border-t border-slate-100 p-3">
                {a.status === "PLANNED" ? (
                  <Button size="lg" className="w-full" loading={start.isPending && start.variables === a.id} onClick={() => start.mutate(a.id)}>
                    <Play className="h-5 w-5" />
                    {t(`${A}.mine.start`)}
                  </Button>
                ) : (
                  <Button size="lg" variant="secondary" className="w-full" onClick={() => router.push(`/audits/${a.id}`)}>
                    {t(`${A}.mine.continue`)}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <NewAuditDialog open={adhoc} onClose={() => setAdhoc(false)} canAssign={false} />
    </div>
  );
}
