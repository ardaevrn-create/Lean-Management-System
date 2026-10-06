"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, FilePlus2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  AUDIT_AREA_TYPES, AUDIT_SCALE_TYPES, AUDIT_TEMPLATE_TYPES, EQUIPMENT_CRITICALITIES, auditScaleMax,
  type AuditAreaItem, type AuditAreaType, type AuditBuiltinTemplateInfo, type AuditScaleType, type AuditTemplateDetail, type AuditTemplateItem,
  type AuditTemplateType, type EquipmentCriticality, type EquipmentItem,
} from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  Badge, Button, Card, CardBody, Dialog, EmptyState, Field, Input, LoadingBlock, OrgUnitSelect, Select, Table, Tabs, TBody, TD, TH, THead, TR, Textarea, UserPicker,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { A, useAreas, useEquipment, useTemplates } from "./audit-bits";

/* ------------------------------ Şablon editörü ------------------------------ */

interface QDraft { text: string; guidance: string; weight: string; photoRequiredBelow: string }
interface SDraft { title: string; weight: string; questions: QDraft[] }

const emptyQ = (): QDraft => ({ text: "", guidance: "", weight: "1", photoRequiredBelow: "" });

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function TemplateEditor({ templateId, onClose }: { templateId: string | "new"; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const isNew = templateId === "new";
  const { data: existing, isLoading } = useQuery({
    queryKey: ["audits", "templates", "detail", templateId],
    queryFn: () => api.get<AuditTemplateDetail>(`/audits/templates/${templateId}`),
    enabled: !isNew,
  });

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<AuditTemplateType>("CUSTOM");
  const [areaType, setAreaType] = useState<AuditAreaType>("ANY");
  const [scale, setScale] = useState<AuditScaleType>("ZERO_TO_FOUR");
  const [description, setDescription] = useState("");
  const [sections, setSections] = useState<SDraft[]>([{ title: "", weight: "1", questions: [emptyQ()] }]);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  if (existing && loadedId !== existing.id) {
    setLoadedId(existing.id);
    setName(existing.name);
    setCode(existing.code);
    setType(existing.type);
    setAreaType(existing.areaType);
    setScale(existing.scaleType);
    setDescription(existing.description ?? "");
    setSections(
      existing.sections.map((s) => ({
        title: s.title,
        weight: String(s.weight),
        questions: s.questions.map((q) => ({ text: q.text, guidance: q.guidance ?? "", weight: String(q.weight), photoRequiredBelow: q.photoRequiredBelow ? String(q.photoRequiredBelow) : "" })),
      })),
    );
  }

  const setSection = (i: number, patch: Partial<SDraft>) => setSections((cur) => cur.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const setQuestion = (i: number, qi: number, patch: Partial<QDraft>) =>
    setSections((cur) => cur.map((s, j) => (j === i ? { ...s, questions: s.questions.map((q, k) => (k === qi ? { ...q, ...patch } : q)) } : s)));

  const save = useMutation({
    mutationFn: () => {
      if (sections.some((s) => !s.questions.length)) throw new Error(t(`${A}.defs.needSections`));
      const payload = sections.map((s) => ({
        title: s.title.trim(),
        weight: Number(s.weight) || 1,
        questions: s.questions.filter((q) => q.text.trim()).map((q) => ({
          text: q.text.trim(), guidance: q.guidance.trim() || null, weight: Number(q.weight) || 1, photoRequiredBelow: q.photoRequiredBelow ? Number(q.photoRequiredBelow) : null,
        })),
      }));
      if (payload.some((s) => !s.title || !s.questions.length)) throw new Error(t(`${A}.defs.needSections`));
      return isNew
        ? api.post<AuditTemplateDetail>("/audits/templates", { name, code, type, areaType, scaleType: scale, description: description || undefined, sections: payload })
        : api.patch<AuditTemplateDetail>(`/audits/templates/${templateId}`, { name, type, areaType, scaleType: scale, description: description || null, sections: payload });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["audits", "templates"] });
      toast.success(r.versioned ? t(`${A}.defs.versionedNotice`, { n: r.version }) : t(`${A}.defs.saved`));
      onClose();
    },
    onError: toast.error,
  });

  const max = auditScaleMax(scale);

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={isNew ? t(`${A}.defs.newTemplate`) : t(`${A}.defs.editTemplate`)}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!name.trim() || (isNew && !code.trim())} loading={save.isPending} onClick={() => save.mutate()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      {!isNew && isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-4">
          {!isNew && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{t(`${A}.defs.versionHint`)}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={t(`${A}.defs.name`)} required className="sm:col-span-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={t(`${A}.defs.code`)} required={isNew}>
              <Input value={code} disabled={!isNew} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </Field>
            <Field label={t(`${A}.defs.type`)}>
              <Select value={type} onChange={(e) => setType(e.target.value as AuditTemplateType)}>
                {AUDIT_TEMPLATE_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {t(`${A}.templateType.${v}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t(`${A}.defs.areaType`)}>
              <Select value={areaType} onChange={(e) => setAreaType(e.target.value as AuditAreaType)}>
                {AUDIT_AREA_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {t(`${A}.areaType.${v}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t(`${A}.defs.scaleType`)}>
              <Select value={scale} onChange={(e) => setScale(e.target.value as AuditScaleType)}>
                {AUDIT_SCALE_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {t(`${A}.scale.${v}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t(`${A}.defs.description`)} className="sm:col-span-3">
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </div>

          {sections.map((s, i) => (
            <Card key={i} className="border-slate-300">
              <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 bg-slate-50 p-3">
                <Field label={`${i + 1}. ${t(`${A}.defs.sectionTitle`)}`} className="min-w-48 flex-1">
                  <Input value={s.title} onChange={(e) => setSection(i, { title: e.target.value })} />
                </Field>
                <Field label={t(`${A}.defs.sectionWeight`)} className="w-28">
                  <Input type="number" min={0} step="0.5" value={s.weight} onChange={(e) => setSection(i, { weight: e.target.value })} />
                </Field>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setSections((c) => move(c, i, -1))} aria-label="up">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setSections((c) => move(c, i, 1))} aria-label="down">
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" title={t(`${A}.defs.removeSection`)} onClick={() => setSections((c) => c.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
              <CardBody className="space-y-3">
                {s.questions.map((q, qi) => (
                  <div key={qi} className="rounded-lg border border-slate-200 p-2">
                    <div className="flex items-start gap-2">
                      <span className="mt-2 w-6 text-center text-xs text-slate-400">{qi + 1}</span>
                      <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-6">
                        <Field className="sm:col-span-6">
                          <Input value={q.text} placeholder={t(`${A}.defs.questionText`)} onChange={(e) => setQuestion(i, qi, { text: e.target.value })} />
                        </Field>
                        <Field className="sm:col-span-6">
                          <Input value={q.guidance} placeholder={t(`${A}.defs.guidance`)} onChange={(e) => setQuestion(i, qi, { guidance: e.target.value })} />
                        </Field>
                        <Field label={t(`${A}.defs.weight`)} className="sm:col-span-2">
                          <Input type="number" min={0} step="0.5" value={q.weight} onChange={(e) => setQuestion(i, qi, { weight: e.target.value })} />
                        </Field>
                        <Field label={t(`${A}.defs.photoBelow`)} className="sm:col-span-4">
                          <Select value={q.photoRequiredBelow} onChange={(e) => setQuestion(i, qi, { photoRequiredBelow: e.target.value })}>
                            <option value="">{t(`${A}.defs.photoNone`)}</option>
                            {Array.from({ length: max }, (_, k) => k + 1).map((v) => (
                              <option key={v} value={v}>
                                {`< ${v}`}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                      <div className="flex flex-col">
                        <Button variant="ghost" size="icon" onClick={() => setSection(i, { questions: move(s.questions, qi, -1) })} aria-label="up">
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setSection(i, { questions: move(s.questions, qi, 1) })} aria-label="down">
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title={t(`${A}.defs.removeQuestion`)} onClick={() => setSection(i, { questions: s.questions.filter((_, k) => k !== qi) })}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setSection(i, { questions: [...s.questions, emptyQ()] })}>
                  <Plus className="h-3.5 w-3.5" />
                  {t(`${A}.defs.addQuestion`)}
                </Button>
              </CardBody>
            </Card>
          ))}
          <Button variant="secondary" onClick={() => setSections((c) => [...c, { title: "", weight: "1", questions: [emptyQ()] }])}>
            <Plus className="h-4 w-4" />
            {t(`${A}.defs.addSection`)}
          </Button>
        </div>
      )}
    </Dialog>
  );
}

/* ------------------------------ Şablonlar ------------------------------ */

function BuiltinDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["audits", "builtin"], queryFn: () => api.get<AuditBuiltinTemplateInfo[]>("/audits/templates/builtin"), enabled: open });
  const imp = useMutation({
    mutationFn: (key: string) => api.post(`/audits/templates/builtin/${key}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audits", "templates"] });
      toast.success(t(`${A}.defs.imported`));
    },
    onError: toast.error,
  });
  return (
    <Dialog open={open} onClose={onClose} size="lg" title={t(`${A}.defs.builtinTitle`)}>
      <p className="mb-3 text-sm text-slate-500">{t(`${A}.defs.builtinHint`)}</p>
      <ul className="space-y-2">
        {data?.map((b) => (
          <li key={b.key} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{b.name}</p>
              <p className="text-xs text-slate-500">{b.description}</p>
              <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
                <Badge tone="indigo">{t(`${A}.templateType.${b.type}`)}</Badge>
                <Badge>{t(`${A}.scale.${b.scaleType}`)}</Badge>
                <Badge>{t(`${A}.defs.sections`, { n: b.sectionCount })}</Badge>
                <Badge>{t(`${A}.defs.questions`, { n: b.questionCount })}</Badge>
              </p>
            </div>
            <Button size="sm" loading={imp.isPending && imp.variables === b.key} onClick={() => imp.mutate(b.key)}>
              <FilePlus2 className="h-4 w-4" />
              {t(`${A}.defs.import`)}
            </Button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

function TemplatesPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [showOld, setShowOld] = useState(false);
  const { data, isLoading } = useTemplates(showOld);
  const [editing, setEditing] = useState<string | null>(null);
  const [builtin, setBuiltin] = useState(false);
  const toggle = useMutation({
    mutationFn: (tp: AuditTemplateItem) => (tp.isActive ? api.del(`/audits/templates/${tp.id}`) : api.patch(`/audits/templates/${tp.id}`, { isActive: true })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audits", "templates"] }),
    onError: toast.error,
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          {t(`${A}.defs.archived`)} / {t("common.inactive")}
        </label>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBuiltin(true)}>
            <FilePlus2 className="h-4 w-4" />
            {t(`${A}.defs.importBuiltin`)}
          </Button>
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            {t(`${A}.defs.newTemplate`)}
          </Button>
        </div>
      </div>
      <Card>
        {isLoading ? (
          <LoadingBlock />
        ) : !data?.length ? (
          <EmptyState title={t(`${A}.defs.noTemplates`)} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t(`${A}.defs.code`)}</TH>
                <TH>{t(`${A}.defs.name`)}</TH>
                <TH>{t(`${A}.defs.type`)}</TH>
                <TH>{t(`${A}.defs.scaleType`)}</TH>
                <TH>{t(`${A}.defs.questions`, { n: "" }).trim()}</TH>
                <TH>{t("common.status")}</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {data.map((tp) => (
                <TR key={tp.id} className={cn(!tp.isActive && "opacity-60")}>
                  <TD className="font-mono text-xs">
                    {tp.code} <span className="text-slate-400">{t(`${A}.common.version`, { n: tp.version })}</span>
                  </TD>
                  <TD className="font-medium text-slate-900">{tp.name}</TD>
                  <TD>{t(`${A}.templateType.${tp.type}`)}</TD>
                  <TD>{t(`${A}.scale.${tp.scaleType}`)}</TD>
                  <TD className="tabular-nums">
                    {tp.sectionCount} / {tp.questionCount}
                  </TD>
                  <TD>{tp.isActive ? <Badge tone="green">{t("common.active")}</Badge> : <Badge tone="muted">{t("common.inactive")}</Badge>}</TD>
                  <TD className="whitespace-nowrap text-right">
                    {tp.isActive && (
                      <Button variant="ghost" size="sm" onClick={() => setEditing(tp.id)}>
                        <Pencil className="h-3.5 w-3.5" />
                        {t("common.edit")}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => toggle.mutate(tp)}>
                      {tp.isActive ? t(`${A}.defs.deactivate`) : t(`${A}.defs.activate`)}
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      {editing && <TemplateEditor key={editing} templateId={editing} onClose={() => setEditing(null)} />}
      <BuiltinDialog open={builtin} onClose={() => setBuiltin(false)} />
    </div>
  );
}

/* ------------------------------ Alanlar ------------------------------ */

function AreaDialog({ area, onClose }: { area: AuditAreaItem | "new"; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const editing = area === "new" ? null : area;
  const [code, setCode] = useState(editing?.code ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [orgUnitId, setOrgUnitId] = useState<string | null>(editing?.orgUnit.id ?? null);
  const [responsible, setResponsible] = useState<{ id: string; label: string } | null>(editing?.responsible ? { id: editing.responsible.id, label: editing.responsible.fullName } : null);
  const [areaType, setAreaType] = useState<AuditAreaType>(editing?.areaType ?? "PRODUCTION");
  const save = useMutation({
    mutationFn: () => {
      const body = { code, name, orgUnitId, responsibleId: responsible?.id ?? null, areaType };
      return editing ? api.patch(`/audits/areas/${editing.id}`, body) : api.post("/audits/areas", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audits", "areas"] });
      toast.success(t(`${A}.defs.saved`));
      onClose();
    },
    onError: toast.error,
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? t(`${A}.defs.editArea`) : t(`${A}.defs.newArea`)}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!code.trim() || !name.trim() || !orgUnitId} loading={save.isPending} onClick={() => save.mutate()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label={t(`${A}.defs.code`)} required>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </Field>
          <Field label={t(`${A}.defs.name`)} required className="col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <Field label={t(`${A}.common.orgUnit`)} required>
          <OrgUnitSelect value={orgUnitId} onChange={setOrgUnitId} />
        </Field>
        <Field label={t(`${A}.common.responsible`)}>
          <UserPicker value={responsible?.id} valueLabel={responsible?.label} onChange={(id, opt) => setResponsible(id && opt ? { id, label: opt.label } : null)} />
        </Field>
        <Field label={t(`${A}.defs.areaType`)}>
          <Select value={areaType} onChange={(e) => setAreaType(e.target.value as AuditAreaType)}>
            {AUDIT_AREA_TYPES.map((v) => (
              <option key={v} value={v}>
                {t(`${A}.areaType.${v}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

function AreasPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useAreas(true);
  const [editing, setEditing] = useState<AuditAreaItem | "new" | null>(null);
  const toggle = useMutation({
    mutationFn: (a: AuditAreaItem) => api.patch(`/audits/areas/${a.id}`, { isActive: !a.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audits", "areas"] }),
    onError: toast.error,
  });
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" />
          {t(`${A}.defs.newArea`)}
        </Button>
      </div>
      <Card>
        {isLoading ? (
          <LoadingBlock />
        ) : !data?.length ? (
          <EmptyState title={t(`${A}.defs.noAreas`)} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t(`${A}.defs.code`)}</TH>
                <TH>{t(`${A}.defs.name`)}</TH>
                <TH>{t(`${A}.common.orgUnit`)}</TH>
                <TH>{t(`${A}.common.responsible`)}</TH>
                <TH>{t(`${A}.defs.areaType`)}</TH>
                <TH>{t(`${A}.common.equipment`)}</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {data.map((a) => (
                <TR key={a.id} className={cn(!a.isActive && "opacity-60")}>
                  <TD className="font-mono text-xs">{a.code}</TD>
                  <TD className="font-medium text-slate-900">{a.name}</TD>
                  <TD>{a.orgUnit.name}</TD>
                  <TD>{a.responsible?.fullName ?? "–"}</TD>
                  <TD>{t(`${A}.areaType.${a.areaType}`)}</TD>
                  <TD className="tabular-nums">{a.equipmentCount}</TD>
                  <TD className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(a)}>
                      <Pencil className="h-3.5 w-3.5" />
                      {t("common.edit")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggle.mutate(a)}>
                      {a.isActive ? t(`${A}.defs.deactivate`) : t(`${A}.defs.activate`)}
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      {editing && <AreaDialog key={editing === "new" ? "new" : editing.id} area={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/* ------------------------------ Ekipman ------------------------------ */

function EquipmentDialog({ item, onClose }: { item: EquipmentItem | "new"; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: areas } = useAreas();
  const editing = item === "new" ? null : item;
  const [code, setCode] = useState(editing?.code ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [areaId, setAreaId] = useState(editing?.area.id ?? "");
  const [criticality, setCriticality] = useState<EquipmentCriticality>(editing?.criticality ?? "B");
  const save = useMutation({
    mutationFn: () => {
      const body = { code, name, areaId, criticality };
      return editing ? api.patch(`/audits/equipment/${editing.id}`, body) : api.post("/audits/equipment", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audits", "equipment"] });
      qc.invalidateQueries({ queryKey: ["audits", "areas"] });
      toast.success(t(`${A}.defs.saved`));
      onClose();
    },
    onError: toast.error,
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? t(`${A}.defs.editEquipment`) : t(`${A}.defs.newEquipment`)}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!code.trim() || !name.trim() || !areaId} loading={save.isPending} onClick={() => save.mutate()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label={t(`${A}.defs.code`)} required>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </Field>
          <Field label={t(`${A}.defs.name`)} required className="col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <Field label={t(`${A}.common.area`)} required>
          <Select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            <option value="">{t(`${A}.common.selectArea`)}</option>
            {areas?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t(`${A}.defs.criticality`)}>
          <Select value={criticality} onChange={(e) => setCriticality(e.target.value as EquipmentCriticality)}>
            {EQUIPMENT_CRITICALITIES.map((v) => (
              <option key={v} value={v}>
                {t(`${A}.criticality.${v}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

function EquipmentPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useEquipment(null, true);
  const [editing, setEditing] = useState<EquipmentItem | "new" | null>(null);
  const toggle = useMutation({
    mutationFn: (e: EquipmentItem) => api.patch(`/audits/equipment/${e.id}`, { isActive: !e.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audits", "equipment"] }),
    onError: toast.error,
  });
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" />
          {t(`${A}.defs.newEquipment`)}
        </Button>
      </div>
      <Card>
        {isLoading ? (
          <LoadingBlock />
        ) : !data?.length ? (
          <EmptyState title={t(`${A}.defs.noEquipment`)} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t(`${A}.defs.code`)}</TH>
                <TH>{t(`${A}.defs.name`)}</TH>
                <TH>{t(`${A}.common.area`)}</TH>
                <TH>{t(`${A}.defs.criticality`)}</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {data.map((e) => (
                <TR key={e.id} className={cn(!e.isActive && "opacity-60")}>
                  <TD className="font-mono text-xs">{e.code}</TD>
                  <TD className="font-medium text-slate-900">{e.name}</TD>
                  <TD>{e.area.name}</TD>
                  <TD>
                    <Badge tone={e.criticality === "A" ? "red" : e.criticality === "B" ? "amber" : "gray"}>{t(`${A}.criticality.${e.criticality}`)}</Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(e)}>
                      <Pencil className="h-3.5 w-3.5" />
                      {t("common.edit")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggle.mutate(e)}>
                      {e.isActive ? t(`${A}.defs.deactivate`) : t(`${A}.defs.activate`)}
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      {editing && <EquipmentDialog key={editing === "new" ? "new" : editing.id} item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/* ------------------------------ Sekme ------------------------------ */

export function DefinitionsTab() {
  const { t } = useI18n();
  const [sub, setSub] = useState<"templates" | "areas" | "equipment">("templates");
  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { value: "templates" as const, label: t(`${A}.defs.tabs.templates`) },
          { value: "areas" as const, label: t(`${A}.defs.tabs.areas`) },
          { value: "equipment" as const, label: t(`${A}.defs.tabs.equipment`) },
        ]}
        value={sub}
        onChange={setSub}
      />
      {sub === "templates" ? <TemplatesPanel /> : sub === "areas" ? <AreasPanel /> : <EquipmentPanel />}
    </div>
  );
}
