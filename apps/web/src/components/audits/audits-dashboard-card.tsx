"use client";

import Link from "next/link";
import { ClipboardCheck, Tag, AlertTriangle } from "lucide-react";
import type { AuditsDashboardWidget } from "@lean/shared";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Card, CardBody } from "@/components/ui";
import { A } from "./audit-bits";

function Stat({ label, value, icon, tone, href }: { label: string; value: number; icon: React.ReactNode; tone: string; href: string }) {
  return (
    <Link href={href}>
      <Card className="transition-shadow hover:shadow-md">
        <CardBody className="flex items-center gap-4">
          <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", tone)}>{icon}</span>
          <div>
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
            <p className="text-sm text-slate-500">{label}</p>
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}

/** Ana sayfa kartı: dashboard widgets.audits varsa ve yapılacak iş içeriyorsa gösterilir. */
export function AuditsDashboardCard({ widget }: { widget: unknown }) {
  const { t } = useI18n();
  const w = widget as AuditsDashboardWidget | undefined;
  if (!w || (w.myDue === 0 && w.myOverdue === 0 && w.tagsAssigned === 0)) return null;
  return (
    <div>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <ClipboardCheck className="h-4 w-4" />
        {t(`${A}.home.title`)}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label={t(`${A}.home.myDue`)} value={w.myDue} icon={<ClipboardCheck className="h-5 w-5" />} tone="bg-blue-50 text-blue-600" href="/audits?tab=mine" />
        <Stat
          label={t(`${A}.home.myOverdue`)}
          value={w.myOverdue}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={w.myOverdue > 0 ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"}
          href="/audits?tab=mine"
        />
        <Stat label={t(`${A}.home.tagsAssigned`)} value={w.tagsAssigned} icon={<Tag className="h-5 w-5" />} tone="bg-amber-50 text-amber-600" href="/audits?tab=tags" />
      </div>
    </div>
  );
}
