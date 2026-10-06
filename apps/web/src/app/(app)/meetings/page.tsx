"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Download, Plus, Repeat, Search } from "lucide-react";
import { MEETING_STATUSES, PERMISSIONS, type MeetingListItem, type MeetingStatus, type MeetingTypeItem, type Paginated } from "@lean/shared";
import { api, type QueryParams } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { Badge, Button, Card, EmptyState, Input, LoadingBlock, PageHeader, Pagination, Select, Table, TBody, TD, TH, THead, Tabs, TR } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { fmtDate, fmtTime, MeetingStatusBadge, useTenantTz } from "@/components/meetings/meeting-bits";
import { MeetingsCalendar } from "@/components/meetings/meetings-calendar";
import { MeetingTypesPanel } from "@/components/meetings/meeting-types-panel";
import { MeetingsStatsPanel } from "@/components/meetings/meetings-stats-panel";
import { NewMeetingDialog } from "@/components/meetings/new-meeting-dialog";

type Tab = "mine" | "calendar" | "types" | "stats";
const PAGE_SIZE = 20;

export default function MeetingsPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.MEETING_MANAGE);
  const [tab, setTab] = useState<Tab>("mine");
  const [creating, setCreating] = useState(false);

  const tabs = useMemo(
    () => [
      { value: "mine" as Tab, label: t("meetingsModule.tabs.mine") },
      { value: "calendar" as Tab, label: t("meetingsModule.tabs.calendar") },
      { value: "types" as Tab, label: t("meetingsModule.tabs.types") },
      { value: "stats" as Tab, label: t("meetingsModule.tabs.stats") },
    ],
    [t],
  );

  return (
    <>
      <PageHeader
        title={t("meetingsModule.title")}
        description={t("meetingsModule.subtitle")}
        actions={
          canManage && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              {t("meetingsModule.newMeeting")}
            </Button>
          )
        }
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-4" />
      {tab === "mine" && <MeetingsList />}
      {tab === "calendar" && <MeetingsCalendar />}
      {tab === "types" && <MeetingTypesPanel />}
      {tab === "stats" && <MeetingsStatsPanel />}
      <NewMeetingDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function MeetingsList() {
  const { t, locale } = useI18n();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const tz = useTenantTz();
  const canViewAll = hasPermission(PERMISSIONS.MEETING_VIEW) || hasPermission(PERMISSIONS.MEETING_MANAGE);
  const [view, setView] = useState<"mine" | "all">("mine");
  const [when, setWhen] = useState<"upcoming" | "past">("upcoming");
  const [typeId, setTypeId] = useState("");
  const [status, setStatus] = useState<MeetingStatus | "">("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounce(q);

  const { data: types } = useQuery({ queryKey: ["meetings", "types"], queryFn: () => api.get<MeetingTypeItem[]>("/meetings/types") });
  const filters: QueryParams = { view, when, typeId: typeId || undefined, status: status || undefined, q: dq || undefined };
  const params: QueryParams = { ...filters, page, pageSize: PAGE_SIZE, sort: when === "upcoming" ? "startAt:asc" : "startAt:desc" };
  const { data, isLoading } = useQuery({
    queryKey: ["meetings", "list", params],
    queryFn: () => api.get<Paginated<MeetingListItem>>("/meetings", params),
    placeholderData: (prev) => prev,
  });

  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  async function exportXlsx() {
    try {
      await api.download("/meetings/export", "toplantilar.xlsx", filters);
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <Card>
      <div className="space-y-3 border-b border-slate-100 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            {(["upcoming", "past"] as const).map((w) => (
              <button
                key={w}
                onClick={() => reset(setWhen)(w)}
                className={cn("px-4 py-1.5 text-sm", when === w ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}
              >
                {t(`meetingsModule.when.${w}`)}
              </button>
            ))}
          </div>
          {canViewAll && (
            <div className="flex overflow-hidden rounded-lg border border-slate-300">
              {(["mine", "all"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => reset(setView)(v)}
                  className={cn("px-4 py-1.5 text-sm", view === v ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}
                >
                  {t(`meetingsModule.view.${v}`)}
                </button>
              ))}
            </div>
          )}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input className="pl-9" placeholder={t("common.search")} value={q} onChange={(e) => reset(setQ)(e.target.value)} />
          </div>
          <Select className="md:w-56" value={typeId} onChange={(e) => reset(setTypeId)(e.target.value)}>
            <option value="">{t("meetingsModule.allTypes")}</option>
            {types?.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
          <Select className="md:w-44" value={status} onChange={(e) => reset(setStatus)(e.target.value as MeetingStatus | "")}>
            <option value="">{t("meetingsModule.allStatuses")}</option>
            {MEETING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`meetingsModule.status.${s}`)}
              </option>
            ))}
          </Select>
          <Button variant="outline" onClick={exportXlsx}>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">{t("common.exportExcel")}</span>
          </Button>
        </div>
      </div>

      {isLoading || !data ? (
        <LoadingBlock />
      ) : data.items.length === 0 ? (
        <EmptyState title={t("meetingsModule.empty")} />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>{t("meetingsModule.code")}</TH>
                <TH>{t("meetingsModule.titleField")}</TH>
                <TH>{t("meetingsModule.when.dateTime")}</TH>
                <TH>{t("meetingsModule.location")}</TH>
                <TH>{t("meetingsModule.organizer")}</TH>
                <TH>{t("common.status")}</TH>
                <TH>{t("meetingsModule.openActions")}</TH>
              </tr>
            </THead>
            <TBody>
              {data.items.map((m) => (
                <TR key={m.id}>
                  <TD className="whitespace-nowrap font-mono text-xs">{m.code}</TD>
                  <TD className="max-w-xs">
                    <Link href={`/meetings/${m.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {m.title}
                    </Link>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      {m.type && <span className="truncate">{m.type.name}</span>}
                      {m.seriesId && <Repeat className="h-3 w-3 shrink-0" aria-label={t("meetingsModule.recurring")} />}
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap">
                    <div>{fmtDate(m.startAt, tz, locale)}</div>
                    <div className="text-xs text-slate-500">
                      {fmtTime(m.startAt, tz, locale)}–{fmtTime(m.endAt, tz, locale)}
                    </div>
                  </TD>
                  <TD>{m.location ?? "—"}</TD>
                  <TD className="whitespace-nowrap">{m.organizer.fullName}</TD>
                  <TD>
                    <MeetingStatusBadge status={m.status} />
                  </TD>
                  <TD>{m.openActionCount > 0 ? <Badge tone="amber">{m.openActionCount}</Badge> : <span className="text-slate-400">0</span>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
        </>
      )}
    </Card>
  );
}
