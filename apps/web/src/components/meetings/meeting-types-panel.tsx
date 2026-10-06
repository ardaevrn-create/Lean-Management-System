"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, FileText, Pencil, Plus, Power, Trash2, Wand2 } from "lucide-react";
import {
  MEETING_CATEGORIES, MEETING_FREQUENCIES, PERMISSIONS,
  type AgendaTemplateItem, type MeetingCategory, type MeetingFrequency, type MeetingTemplateInfo, type MeetingTypeItem,
} from "@lean/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import {
  Badge, Button, Card, Checkbox, Dialog, EmptyState, Field, Input, LoadingBlock, MultiPicker, OrgUnitSelect, Select, Table, TBody, TD, TH, THead, Textarea,
  TR, UserPicker, type PickerOption,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";

/** Toplantı tipleri: liste, yeni/düzenle, şablondan oluştur. */
export function MeetingTypesPanel() {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.MEETING_MANAGE);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<MeetingTypeItem | "new" | null>(null);
  const [templating, setTemplating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["meetings", "types", { showInactive }],
    queryFn: () => api.get<MeetingTypeItem[]>("/meetings/types", { includeInactive: showInactive || undefined }),
  });

  const toggle = useMutation({
    mutationFn: (x: MeetingTypeItem) => (x.isActive ? api.del(`/meetings/types/${x.id}`) : api.patch(`/meetings/types/${x.id}`, { isActive: true })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meetings", "types"] }),
    onError: toast.error,
  });

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3">
        <Checkbox label={t("meetingsModule.showInactive")} checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
        {canManage && (
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => setTemplating(true)}>
              <Wand2 className="h-4 w-4" />
              {t("meetingsModule.fromTemplate")}
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" />
              {t("meetingsModule.newType")}
            </Button>
          </div>
        )}
      </div>
      {isLoading || !data ? (
        <LoadingBlock />
      ) : data.length === 0 ? (
        <EmptyState
          title={t("meetingsModule.noTypes")}
          description={t("meetingsModule.noTypesDesc")}
          action={canManage && <Button onClick={() => setTemplating(true)}>{t("meetingsModule.fromTemplate")}</Button>}
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>{t("meetingsModule.name")}</TH>
              <TH>{t("meetingsModule.category")}</TH>
              <TH>{t("meetingsModule.frequency")}</TH>
              <TH>{t("meetingsModule.duration")}</TH>
              <TH>{t("meetingsModule.orgUnit")}</TH>
              <TH>{t("meetingsModule.facilitator")}</TH>
              <TH>{t("meetingsModule.agenda")}</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {data.map((x) => (
              <TR key={x.id} className={x.isActive ? undefined : "opacity-60"}>
                <TD>
                  <div className="font-medium text-slate-900">{x.name}</div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="font-mono">{x.code}</span>
                    {!x.isActive && <Badge tone="muted">{t("common.inactive")}</Badge>}
                  </div>
                </TD>
                <TD>
                  {t(`meetingsModule.categories.${x.category}`)}
                  {x.tier && <Badge tone="indigo" className="ml-1.5">Tier {x.tier}</Badge>}
                </TD>
                <TD>{t(`meetingsModule.frequencies.${x.frequency}`)}</TD>
                <TD className="whitespace-nowrap">{t("meetingsModule.minutes", { n: x.defaultDurationMin })}</TD>
                <TD>{x.orgUnit?.name ?? "—"}</TD>
                <TD>{x.facilitator?.fullName ?? "—"}</TD>
                <TD className="whitespace-nowrap">
                  {x.agendaTemplate.length} / {x.members.length}
                </TD>
                <TD>
                  {canManage && (
                    <div className="flex justify-end gap-1">
                      <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title={t("common.edit")} onClick={() => setEditing(x)}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                        title={x.isActive ? t("meetingsModule.deactivate") : t("meetingsModule.activate")}
                        onClick={() => toggle.mutate(x)}
                      >
                        <Power className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {editing && <TypeFormDialog type={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      <TemplateDialog open={templating} onClose={() => setTemplating(false)} />
    </Card>
  );
}

function TypeFormDialog({ type, onClose }: { type: MeetingTypeItem | null; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(type?.name ?? "");
  const [code, setCode] = useState(type?.code ?? "");
  const [description, setDescription] = useState(type?.description ?? "");
  const [category, setCategory] = useState<MeetingCategory>(type?.category ?? "OTHER");
  const [tier, setTier] = useState(type?.tier ? String(type.tier) : "");
  const [frequency, setFrequency] = useState<MeetingFrequency>(type?.frequency ?? "WEEKLY");
  const [duration, setDuration] = useState(String(type?.defaultDurationMin ?? 60));
  const [location, setLocation] = useState(type?.defaultLocation ?? "");
  const [orgUnitId, setOrgUnitId] = useState<string | null>(type?.orgUnit?.id ?? null);
  const [facilitatorId, setFacilitatorId] = useState<string | null>(type?.facilitator?.id ?? null);
  const [facilitatorLabel] = useState<string | null>(type?.facilitator?.fullName ?? null);
  const [members, setMembers] = useState<PickerOption[]>(type?.members.map((m) => ({ id: m.user.id, label: m.user.fullName })) ?? []);
  const [agenda, setAgenda] = useState<AgendaTemplateItem[]>(type?.agendaTemplate ?? []);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        code: code.trim(),
        description: description.trim() || null,
        category,
        tier: tier ? Number(tier) : null,
        frequency,
        defaultDurationMin: Number(duration) || 60,
        defaultLocation: location.trim() || null,
        orgUnitId,
        facilitatorId,
        members: members.map((m) => ({ userId: m.id })),
        agendaTemplate: agenda.filter((a) => a.title.trim()).map((a) => ({ title: a.title.trim(), durationMin: a.durationMin || undefined, description: a.description || undefined })),
      };
      return type ? api.patch(`/meetings/types/${type.id}`, body) : api.post("/meetings/types", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings", "types"] });
      toast.success(t("common.saved"));
      onClose();
    },
    onError: toast.error,
  });

  const setItem = (i: number, patch: Partial<AgendaTemplateItem>) => setAgenda((cur) => cur.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const move = (i: number, dir: -1 | 1) =>
    setAgenda((cur) => {
      const next = [...cur];
      const j = i + dir;
      if (j < 0 || j >= next.length) return cur;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={type ? t("meetingsModule.editType") : t("meetingsModule.newType")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!name.trim() || !/^[A-Za-z0-9_-]{2,40}$/.test(code.trim())} loading={save.isPending} onClick={() => save.mutate()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("meetingsModule.name")} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label={t("common.code")} required hint={t("meetingsModule.codeHint")}>
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label={t("common.description")} className="sm:col-span-2">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label={t("meetingsModule.category")}>
          <Select value={category} onChange={(e) => setCategory(e.target.value as MeetingCategory)}>
            {MEETING_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`meetingsModule.categories.${c}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("meetingsModule.tier")}>
          <Select value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="">—</option>
            <option value="1">{t("meetingsModule.tierLabels.1")}</option>
            <option value="2">{t("meetingsModule.tierLabels.2")}</option>
            <option value="3">{t("meetingsModule.tierLabels.3")}</option>
          </Select>
        </Field>
        <Field label={t("meetingsModule.frequency")}>
          <Select value={frequency} onChange={(e) => setFrequency(e.target.value as MeetingFrequency)}>
            {MEETING_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {t(`meetingsModule.frequencies.${f}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("meetingsModule.duration")}>
          <Input type="number" min={5} max={1440} value={duration} onChange={(e) => setDuration(e.target.value)} />
        </Field>
        <Field label={t("meetingsModule.location")}>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label={t("meetingsModule.orgUnit")}>
          <OrgUnitSelect value={orgUnitId} onChange={setOrgUnitId} />
        </Field>
        <Field label={t("meetingsModule.facilitator")}>
          <UserPicker value={facilitatorId} valueLabel={facilitatorLabel} onChange={(id) => setFacilitatorId(id)} />
        </Field>
        <Field label={t("meetingsModule.defaultParticipants")} className="sm:col-span-2">
          <MultiPicker kind="user" selected={members} onChange={setMembers} placeholder={t("meetingsModule.addParticipant")} />
        </Field>
        <div className="sm:col-span-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">{t("meetingsModule.agendaTemplate")}</span>
            <Button variant="outline" size="sm" onClick={() => setAgenda((cur) => [...cur, { title: "" }])}>
              <Plus className="h-3.5 w-3.5" />
              {t("meetingsModule.addAgendaItem")}
            </Button>
          </div>
          <div className="space-y-2">
            {agenda.length === 0 && <p className="text-sm text-slate-500">{t("meetingsModule.noAgenda")}</p>}
            {agenda.map((a, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2">
                <span className="w-5 text-center text-xs text-slate-400">{i + 1}</span>
                <Input className="min-w-48 flex-1" value={a.title} onChange={(e) => setItem(i, { title: e.target.value })} placeholder={t("meetingsModule.agendaTitle")} />
                <Input className="w-24" type="number" min={1} value={a.durationMin ?? ""} onChange={(e) => setItem(i, { durationMin: e.target.value ? Number(e.target.value) : undefined })} placeholder={t("meetingsModule.minShort")} />
                <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" disabled={i === agenda.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button className="rounded p-1.5 text-red-500 hover:bg-red-50" onClick={() => setAgenda((cur) => cur.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function TemplateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [orgUnitId, setOrgUnitId] = useState<string | null>(null);
  const [facilitatorId, setFacilitatorId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<PickerOption[]>([]);

  const { data } = useQuery({ queryKey: ["meetings", "templates"], queryFn: () => api.get<MeetingTemplateInfo[]>("/meetings/types/templates"), enabled: open });
  const tpl = data?.find((x) => x.key === selected);

  const create = useMutation({
    mutationFn: () =>
      api.post(`/meetings/types/templates/${selected}`, {
        name: name.trim() || undefined,
        orgUnitId: orgUnitId ?? undefined,
        facilitatorId: facilitatorId ?? undefined,
        participantIds: participants.map((p) => p.id),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings", "types"] });
      toast.success(t("meetingsModule.typeCreated"));
      setSelected(null);
      setName("");
      setParticipants([]);
      onClose();
    },
    onError: toast.error,
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title={t("meetingsModule.fromTemplate")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!selected} loading={create.isPending} onClick={() => create.mutate()}>
            {t("common.create")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          {data?.map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => {
                setSelected(x.key);
                setName(x.name);
              }}
              className={`w-full rounded-xl border p-3 text-left transition-colors ${selected === x.key ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:bg-slate-50"}`}
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-brand-600" />
                <span className="text-sm font-semibold text-slate-900">{x.name}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{x.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge>{t(`meetingsModule.frequencies.${x.frequency}`)}</Badge>
                <Badge>{t("meetingsModule.minutes", { n: x.durationMin })}</Badge>
                {x.tier && <Badge tone="indigo">Tier {x.tier}</Badge>}
                <Badge tone="blue">{t("meetingsModule.agendaCount", { n: x.agenda.length })}</Badge>
              </div>
            </button>
          ))}
        </div>
        <div>
          {!tpl ? (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">{t("meetingsModule.pickTemplate")}</p>
          ) : (
            <div className="space-y-3">
              <Field label={t("meetingsModule.name")}>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label={t("meetingsModule.orgUnit")}>
                <OrgUnitSelect value={orgUnitId} onChange={setOrgUnitId} />
              </Field>
              <Field label={t("meetingsModule.facilitator")}>
                <UserPicker value={facilitatorId} onChange={(id) => setFacilitatorId(id)} />
              </Field>
              <Field label={t("meetingsModule.defaultParticipants")}>
                <MultiPicker kind="user" selected={participants} onChange={setParticipants} placeholder={t("meetingsModule.addParticipant")} />
              </Field>
              <div>
                <p className="mb-1 text-sm font-medium text-slate-700">{t("meetingsModule.agendaTemplate")}</p>
                <ol className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                  {tpl.agenda.map((a, i) => (
                    <li key={i}>
                      <span className="mr-1.5 text-slate-400">{i + 1}.</span>
                      {a.title}
                      {a.durationMin && <span className="ml-1 text-xs text-slate-400">({t("meetingsModule.minutes", { n: a.durationMin })})</span>}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
