"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, X } from "lucide-react";
import { PROBLEM_SEVERITIES, PROBLEM_SOURCES, type CreateProblemRequest, type ProblemDetail, type ProblemSeverity, type ProblemSource } from "@lean/shared";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button, Dialog, Field, Input, OrgUnitSelect, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

const SEV_STYLE: Record<ProblemSeverity, string> = {
  LOW: "border-slate-300 data-[on=true]:bg-slate-700 data-[on=true]:text-white",
  MEDIUM: "border-blue-300 data-[on=true]:bg-blue-600 data-[on=true]:text-white",
  HIGH: "border-amber-300 data-[on=true]:bg-amber-500 data-[on=true]:text-white",
  CRITICAL: "border-red-300 data-[on=true]:bg-red-600 data-[on=true]:text-white",
};

/** Saha çalışanı dostu basit bildirim: başlık, açıklama, alan, şiddet, fotoğraf. */
export function NewProblemDialog({ open, onClose, defaults }: { open: boolean; onClose: () => void; defaults?: Partial<CreateProblemRequest> }) {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(defaults?.title ?? "");
  const [description, setDescription] = useState(defaults?.description ?? "");
  const [orgUnitId, setOrgUnitId] = useState<string | null>(defaults?.orgUnitId ?? null);
  const [severity, setSeverity] = useState<ProblemSeverity>(defaults?.severity ?? "MEDIUM");
  const [source, setSource] = useState<ProblemSource>(defaults?.source ?? "PROCESS");
  const [files, setFiles] = useState<File[]>([]);

  const create = useMutation({
    mutationFn: async () => {
      const p = await api.post<ProblemDetail>("/problems", {
        title: title.trim(),
        description: description.trim() || undefined,
        orgUnitId: orgUnitId ?? undefined,
        severity,
        source,
        sourceId: defaults?.sourceId,
        sourceLabel: defaults?.sourceLabel,
      });
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("entityType", "PROBLEM");
        fd.append("entityId", p.id);
        await api.upload("/attachments", fd).catch(() => undefined);
      }
      return p;
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["problems"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(t("problemsModule.reported"));
      setTitle("");
      setDescription("");
      setFiles([]);
      onClose();
      router.push(`/problems/${p.id}`);
    },
    onError: toast.error,
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("problemsModule.reportTitle")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button size="lg" disabled={title.trim().length < 3} loading={create.isPending} onClick={() => create.mutate()}>
            {t("problemsModule.report")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("problemsModule.titleField")} required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-11 text-base" autoFocus maxLength={300} />
        </Field>
        <Field label={t("problemsModule.description")}>
          <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className="text-base" />
        </Field>
        <Field label={t("problemsModule.orgUnit")} hint={t("problemsModule.orgUnitHint")}>
          <OrgUnitSelect value={orgUnitId} onChange={setOrgUnitId} className="h-11" />
        </Field>
        <Field label={t("problemsModule.severityField")}>
          <div className="grid grid-cols-4 gap-2">
            {PROBLEM_SEVERITIES.map((s) => (
              <button
                key={s}
                type="button"
                data-on={severity === s}
                onClick={() => setSeverity(s)}
                className={cn("h-11 rounded-lg border bg-white text-sm font-medium", SEV_STYLE[s])}
              >
                {t(`problemsModule.severity.${s}`)}
              </button>
            ))}
          </div>
        </Field>
        {defaults?.source && (
          <Field label={t("problemsModule.sourceField")}>
            <Select value={source} onChange={(e) => setSource(e.target.value as ProblemSource)}>
              {PROBLEM_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {t(`problemsModule.source.${s}`)}
                </option>
              ))}
            </Select>
            {defaults.sourceLabel && <p className="mt-1 text-xs text-slate-500">{defaults.sourceLabel}</p>}
          </Field>
        )}
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            multiple
            hidden
            onChange={(e) => {
              setFiles((cur) => [...cur, ...Array.from(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <Button variant="outline" className="h-11 w-full" onClick={() => fileRef.current?.click()}>
            <Camera className="h-5 w-5" />
            {t("problemsModule.photos")}
          </Button>
          <p className="mt-1 text-xs text-slate-500">{t("problemsModule.photosHint")}</p>
          {files.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <li key={i} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs">
                  {f.name}
                  <button type="button" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Dialog>
  );
}
