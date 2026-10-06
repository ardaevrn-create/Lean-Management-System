"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Download, KanbanSquare, List, Plus, X } from "lucide-react";
import {
  TAG_CATEGORIES, TAG_COLORS, type AbnormalityTagItem, type Paginated, type TagCategory, type TagColor,
} from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { Button, Card, DatePicker, Dialog, EmptyState, Field, LoadingBlock, Select, Table, TBody, TD, TH, THead, TR, Textarea, UserPicker } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { A, AreaSelect, EquipmentSelect, TagColorBadge, TagStatusBadge, fmtDay } from "./audit-bits";

/** Fotoğrafları etikete/cevaba yükler (kamera veya galeri). */
export async function uploadPhotos(entityType: string, entityId: string, files: File[]) {
  for (const file of files) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("entityType", entityType);
    fd.append("entityId", entityId);
    await api.upload("/attachments", fd);
  }
}

/* ------------------------------ Etiket aç ------------------------------ */

export function NewTagDialog({ open, onClose, defaultAreaId }: { open: boolean; onClose: () => void; defaultAreaId?: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const camRef = useRef<HTMLInputElement>(null);
  const [areaId, setAreaId] = useState(defaultAreaId ?? "");
  const [equipmentId, setEquipmentId] = useState("");
  const [color, setColor] = useState<TagColor>("RED");
  const [category, setCategory] = useState<TagCategory>("LEAK");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const create = useMutation({
    mutationFn: async () => {
      const tag = await api.post<AbnormalityTagItem>("/audits/tags", {
        areaId, equipmentId: equipmentId || undefined, color, category, description, assignedToId: assignee || undefined, dueDate: dueDate || undefined,
      });
      if (files.length) {
        try {
          await uploadPhotos("TPM_TAG", tag.id, files);
        } catch (e) {
          toast.error(e);
        }
      }
      return tag;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audits", "tags"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "me"] });
      toast.success(t(`${A}.tags.opened`));
      setDescription("");
      setFiles([]);
      setEquipmentId("");
      onClose();
    },
    onError: toast.error,
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t(`${A}.tags.newTitle`)}
      footer={
        <>
          <Button variant="outline" size="lg" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button size="lg" disabled={!areaId || !description.trim()} loading={create.isPending} onClick={() => create.mutate()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t(`${A}.tags.color`)}>
          <div className="grid grid-cols-2 gap-2">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "rounded-xl border-2 p-3 text-left transition-colors",
                  color === c ? (c === "RED" ? "border-red-500 bg-red-50" : "border-blue-500 bg-blue-50") : "border-slate-200 bg-white hover:bg-slate-50",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <span className={cn("h-4 w-4 rounded-full", c === "RED" ? "bg-red-500" : "bg-blue-500")} />
                  {t(`${A}.tagColorShort.${c}`)}
                </span>
                <span className="mt-1 block text-xs text-slate-500">{t(`${A}.tagColorHint.${c}`)}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label={t(`${A}.common.area`)} required>
          <AreaSelect
            className="h-11"
            value={areaId}
            onChange={(v) => {
              setAreaId(v);
              setEquipmentId("");
            }}
          />
        </Field>
        <Field label={t(`${A}.common.equipment`)}>
          <EquipmentSelect className="h-11" areaId={areaId} value={equipmentId} onChange={setEquipmentId} />
        </Field>
        <Field label={t(`${A}.tags.category`)}>
          <div className="flex flex-wrap gap-2">
            {TAG_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  category === c ? "border-brand-600 bg-brand-50 font-medium text-brand-700" : "border-slate-300 text-slate-600 hover:bg-slate-50",
                )}
              >
                {t(`${A}.tagCategory.${c}`)}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t(`${A}.tags.description`)} required>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t(`${A}.tags.descriptionPlaceholder`)} className="text-base" />
        </Field>
        <div>
          <input
            ref={camRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            hidden
            onChange={(e) => {
              setFiles((cur) => [...cur, ...Array.from(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => camRef.current?.click()}>
            <Camera className="h-5 w-5" />
            {t(`${A}.tags.photo`)}
          </Button>
          {files.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <li key={i} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                  {f.name.length > 22 ? `${f.name.slice(0, 20)}…` : f.name}
                  <button type="button" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} aria-label={t("common.delete")}>
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t(`${A}.tags.assignedTo`)}>
            <UserPicker value={assignee} onChange={(id) => setAssignee(id)} />
          </Field>
          <Field label={t(`${A}.tags.dueDate`)}>
            <DatePicker value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

/* ------------------------------ Detay ------------------------------ */

function TagDetailDialog({ tag, onClose }: { tag: AbnormalityTagItem | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [reassign, setReassign] = useState<string | null>(null);

  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post<AbnormalityTagItem>(`/audits/tags/${tag!.id}/${path}`, body),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["audits", "tags"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "me"] });
      if (v.path === "close") toast.success(t(`${A}.tags.closed`));
      onClose();
    },
    onError: toast.error,
  });
  const update = useMutation({
    mutationFn: () => api.patch<AbnormalityTagItem>(`/audits/tags/${tag!.id}`, { assignedToId: reassign }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audits", "tags"] });
      onClose();
    },
    onError: toast.error,
  });

  if (!tag) return null;
  const active = tag.status === "OPEN" || tag.status === "IN_PROGRESS";
  return (
    <Dialog open onClose={onClose} size="lg" title={`${tag.code} — ${t(`${A}.tags.details`)}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <TagColorBadge color={tag.color} />
          <TagStatusBadge status={tag.status} overdue={tag.isOverdue} />
          <span className="text-sm text-slate-500">{t(`${A}.tagCategory.${tag.category}`)}</span>
        </div>
        <p className="whitespace-pre-wrap text-base text-slate-900">{tag.description}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-slate-500">{t(`${A}.common.area`)}</dt>
            <dd>{tag.area.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">{t(`${A}.common.equipment`)}</dt>
            <dd>{tag.equipment?.name ?? "–"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">{t(`${A}.tags.assignee`)}</dt>
            <dd>{tag.assignedTo?.fullName ?? t(`${A}.tags.noAssignee`)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">{t(`${A}.common.dueDate`)}</dt>
            <dd>{fmtDay(tag.dueDate, locale)}</dd>
          </div>
          <div className="col-span-2 text-xs text-slate-500">
            {t(`${A}.tags.created`, { name: tag.openedBy.fullName })} · {fmtDay(tag.createdAt, locale)}
          </div>
        </dl>
        {tag.closeNote && (
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
            {tag.closeNote}
            {tag.closedAt && <span className="ml-2 text-xs text-emerald-700">{fmtDay(tag.closedAt, locale)}</span>}
          </p>
        )}
        <AttachmentsPanel entityType="TPM_TAG" entityId={tag.id} readOnly={!active && !tag.can.edit} />
        {active && tag.can.edit && (
          <Field label={t(`${A}.tags.reassign`)}>
            <div className="flex gap-2">
              <div className="flex-1">
                <UserPicker value={reassign} valueLabel={null} onChange={(id) => setReassign(id)} />
              </div>
              <Button variant="outline" disabled={!reassign} loading={update.isPending} onClick={() => update.mutate()}>
                {t("common.save")}
              </Button>
            </div>
          </Field>
        )}
        {active && tag.can.close && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <Field label={t(`${A}.tags.closeNote`)}>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t(`${A}.tags.closeNotePlaceholder`)} />
            </Field>
            <div className="flex flex-wrap gap-2">
              {tag.status === "OPEN" && (
                <Button variant="secondary" loading={act.isPending && act.variables?.path === "start"} onClick={() => act.mutate({ path: "start" })}>
                  {t(`${A}.tags.start`)}
                </Button>
              )}
              <Button loading={act.isPending && act.variables?.path === "close"} onClick={() => act.mutate({ path: "close", body: { closeNote: note || undefined } })}>
                {t(`${A}.tags.close`)}
              </Button>
              <Button variant="ghost" onClick={() => act.mutate({ path: "cancel" })}>
                {t(`${A}.tags.cancel`)}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/* ------------------------------ Kart ------------------------------ */

function TagCard({ tag, onOpen, locale }: { tag: AbnormalityTagItem; onOpen: () => void; locale: string }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full rounded-xl border border-l-4 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md",
        tag.color === "RED" ? "border-l-red-500" : "border-l-blue-500",
        tag.isOverdue ? "border-red-200" : "border-slate-200",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-slate-500">{tag.code}</span>
        <span className="text-xs text-slate-500">{t(`${A}.tagCategory.${tag.category}`)}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-900">{tag.description}</p>
      <p className="mt-1 truncate text-xs text-slate-500">
        {tag.area.name}
        {tag.equipment && ` · ${tag.equipment.name}`}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-xs">
        <span className="text-slate-600">{tag.assignedTo?.fullName ?? t(`${A}.tags.noAssignee`)}</span>
        <span className={tag.isOverdue ? "font-medium text-red-600" : "text-slate-500"}>{fmtDay(tag.dueDate, locale)}</span>
      </div>
    </button>
  );
}

/* ------------------------------ Sekme ------------------------------ */

export function TagsTab() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [color, setColor] = useState<TagColor | "">("");
  const [areaId, setAreaId] = useState("");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<AbnormalityTagItem | null>(null);

  const params = { view: scope, color: color || undefined, areaId: areaId || undefined };
  const { data, isLoading } = useQuery({
    queryKey: ["audits", "tags", params],
    queryFn: () => api.get<Paginated<AbnormalityTagItem>>("/audits/tags", { ...params, pageSize: 200, sort: "createdAt:desc" }),
  });
  const items = data?.items ?? [];
  const columns: { key: "OPEN" | "IN_PROGRESS" | "CLOSED"; label: string }[] = [
    { key: "OPEN", label: t(`${A}.tags.columnOpen`) },
    { key: "IN_PROGRESS", label: t(`${A}.tags.columnInProgress`) },
    { key: "CLOSED", label: t(`${A}.tags.columnClosed`) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button size="lg" onClick={() => setCreating(true)} className="sm:order-last sm:ml-auto">
          <Plus className="h-5 w-5" />
          {t(`${A}.tags.open`)}
        </Button>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={scope} onChange={(e) => setScope(e.target.value as "mine" | "all")}>
            <option value="mine">{t(`${A}.tags.mineOnly`)}</option>
            <option value="all">{t(`${A}.tags.allVisible`)}</option>
          </Select>
          <Select value={color} onChange={(e) => setColor(e.target.value as TagColor | "")}>
            <option value="">{t(`${A}.tags.allColors`)}</option>
            {TAG_COLORS.map((c) => (
              <option key={c} value={c}>
                {t(`${A}.tagColorShort.${c}`)}
              </option>
            ))}
          </Select>
          <AreaSelect value={areaId} onChange={setAreaId} placeholder={t(`${A}.common.area`)} className="col-span-2 sm:col-span-1" />
        </div>
        <div className="flex gap-1">
          <Button variant={viewMode === "board" ? "secondary" : "ghost"} size="sm" onClick={() => setViewMode("board")}>
            <KanbanSquare className="h-4 w-4" />
            {t(`${A}.tags.boardView`)}
          </Button>
          <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" onClick={() => setViewMode("list")}>
            <List className="h-4 w-4" />
            {t(`${A}.tags.listView`)}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => api.download("/audits/tags/export", "etiketler.xlsx", { ...params }).catch(toast.error)}>
            <Download className="h-4 w-4" />
            {t(`${A}.tags.export`)}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : !items.length ? (
        <Card>
          <EmptyState title={t(`${A}.tags.empty`)} />
        </Card>
      ) : viewMode === "board" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {columns.map((col) => {
            const colItems = items.filter((i) => i.status === col.key);
            return (
              <div key={col.key} className="rounded-xl bg-slate-100/70 p-2">
                <h3 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold text-slate-700">
                  {col.label}
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">{colItems.length}</span>
                </h3>
                <div className="space-y-2">
                  {colItems.map((tag) => (
                    <TagCard key={tag.id} tag={tag} locale={locale} onOpen={() => setSelected(tag)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>{t(`${A}.all.number`)}</TH>
                <TH>{t(`${A}.tags.color`)}</TH>
                <TH>{t(`${A}.tags.category`)}</TH>
                <TH>{t(`${A}.common.area`)}</TH>
                <TH>{t("common.description")}</TH>
                <TH>{t(`${A}.tags.assignee`)}</TH>
                <TH>{t(`${A}.common.dueDate`)}</TH>
                <TH>{t("common.status")}</TH>
              </tr>
            </THead>
            <TBody>
              {items.map((tag) => (
                <TR key={tag.id} className="cursor-pointer" onClick={() => setSelected(tag)}>
                  <TD className="whitespace-nowrap font-mono text-xs">{tag.code}</TD>
                  <TD>
                    <TagColorBadge color={tag.color} short />
                  </TD>
                  <TD>{t(`${A}.tagCategory.${tag.category}`)}</TD>
                  <TD>{tag.area.name}</TD>
                  <TD className="max-w-xs truncate">{tag.description}</TD>
                  <TD>{tag.assignedTo?.fullName ?? "–"}</TD>
                  <TD className="whitespace-nowrap">{fmtDay(tag.dueDate, locale)}</TD>
                  <TD>
                    <TagStatusBadge status={tag.status} overdue={tag.isOverdue} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      {creating && <NewTagDialog open onClose={() => setCreating(false)} />}
      <TagDetailDialog key={selected?.id ?? "none"} tag={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
