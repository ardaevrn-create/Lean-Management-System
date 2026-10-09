"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AuditDetail } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button, DatePicker, Dialog, Field, Select, UserPicker } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { A, AreaSelect, EquipmentSelect, useTemplates } from "./audit-bits";

/** Plansız (ad-hoc) denetim: saha çalışanı kendisi başlatır; yönetici başkasına atayabilir. */
export function NewAuditDialog({ open, onClose, canAssign }: { open: boolean; onClose: () => void; canAssign: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: templates } = useTemplates(false, open);
  const [templateId, setTemplateId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [auditorId, setAuditorId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const created = await api.post<AuditDetail>("/audits", {
        templateId, areaId, equipmentId: equipmentId || undefined, auditorId: auditorId || undefined, dueDate: dueDate || undefined,
      });
      // Kendi denetimi ise hemen başlat
      return auditorId ? created : api.post<AuditDetail>(`/audits/${created.id}/start`);
    },
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["audits"] });
      toast.success(t(`${A}.adhoc.created`));
      onClose();
      router.push(`/audits/${a.id}`);
    },
    onError: toast.error,
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={canAssign ? t(`${A}.adhoc.assignTitle`) : t(`${A}.adhoc.title`)}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!templateId || !areaId} loading={create.isPending} onClick={() => create.mutate()}>
            {auditorId ? t(`${A}.adhoc.create`) : t(`${A}.adhoc.startNow`)}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-500">{canAssign ? t(`${A}.adhoc.assignHint`) : t(`${A}.adhoc.hint`)}</p>
        <Field label={t(`${A}.common.template`)} required>
          <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">{t(`${A}.common.selectTemplate`)}</option>
            {templates?.map((tp) => (
              <option key={tp.id} value={tp.id}>
                {tp.name} ({t(`${A}.common.version`, { n: tp.version })})
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t(`${A}.common.area`)} required>
          <AreaSelect
            value={areaId}
            onChange={(v) => {
              setAreaId(v);
              setEquipmentId("");
            }}
          />
        </Field>
        <Field label={t(`${A}.common.equipment`)}>
          <EquipmentSelect areaId={areaId} value={equipmentId} onChange={setEquipmentId} />
        </Field>
        {canAssign && (
          <>
            <Field label={t(`${A}.adhoc.auditor`)}>
              <UserPicker value={auditorId} onChange={(id) => setAuditorId(id)} />
            </Field>
            <Field label={t(`${A}.common.dueDate`)}>
              <DatePicker value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </>
        )}
      </div>
    </Dialog>
  );
}
