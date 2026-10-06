"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { periodLabel, type KpiBrief, type KpiValueResult } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button, Dialog, Field, Input } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { liveStatus, parseDecimal, StatusChip } from "./kpi-bits";

/** Tek dönem için değer gir / düzelt (mevcut değer değişiyorsa gerekçe zorunlu → revizyon kaydı). */
export function ValueDialog({
  kpi, period, value, note, target, targetMax, onClose, onSaved,
}: {
  kpi: KpiBrief;
  period: string;
  value: number | null;
  note: string | null;
  target: number | null;
  targetMax: number | null;
  onClose: () => void;
  onSaved?: (r: KpiValueResult) => void;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [v, setV] = useState(value === null ? "" : String(value).replace(".", locale === "en" ? "." : ","));
  const [n, setN] = useState(note ?? "");
  const [reason, setReason] = useState("");
  const parsed = parseDecimal(v);
  const changed = value !== null && parsed !== null && parsed !== value;

  const save = useMutation({
    mutationFn: () => api.put<KpiValueResult>("/kpi/values", { kpiId: kpi.id, period, value: parsed, note: n.trim() || null, reason: changed ? reason.trim() : undefined }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["kpi"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(t("kpiModule.entry.saved"));
      onSaved?.(r);
      onClose();
    },
    onError: toast.error,
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${kpi.code} — ${periodLabel(period, locale)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={save.isPending} disabled={parsed === null || (changed && !reason.trim())} onClick={() => save.mutate()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={`${t("kpiModule.actual")} (${kpi.unit})`} required>
          <div className="flex items-center gap-3">
            <Input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} autoFocus />
            {parsed !== null && <StatusChip status={liveStatus(kpi, parsed, target, targetMax)} />}
          </div>
        </Field>
        <Field label={t("kpiModule.note")}>
          <Input value={n} onChange={(e) => setN(e.target.value)} />
        </Field>
        {changed && (
          <Field label={t("kpiModule.value.reason")} required hint={t("kpiModule.value.reasonHint")}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
      </div>
    </Dialog>
  );
}
