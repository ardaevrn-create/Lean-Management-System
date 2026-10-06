"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Trash2, UploadCloud } from "lucide-react";
import type { AttachmentItem } from "@lean/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn, formatBytes, formatDate } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

/** Her varlığa dosya eki: sürükle-bırak yükleme, listeleme, indirme, silme. */
export function AttachmentsPanel({ entityType, entityId, readOnly }: { entityType: string; entityId: string; readOnly?: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [toDelete, setToDelete] = useState<AttachmentItem | null>(null);
  const key = ["attachments", entityType, entityId];

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api.get<AttachmentItem[]>("/attachments", { entityType, entityId }),
  });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("entityType", entityType);
        fd.append("entityId", entityId);
        await api.upload("/attachments", fd);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success(t("attachments.uploaded"));
    },
    onError: (e) => {
      qc.invalidateQueries({ queryKey: key });
      toast.error(e);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/attachments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setToDelete(null);
    },
    onError: toast.error,
  });

  const pick = (files: FileList | null) => {
    if (files && files.length) upload.mutate(Array.from(files));
  };

  return (
    <Card>
      <CardHeader title={t("attachments.title")} />
      <CardBody className="space-y-3">
        {!readOnly && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
              dragging ? "border-brand-500 bg-brand-50" : "border-slate-300 hover:border-slate-400",
            )}
          >
            {upload.isPending ? <Spinner /> : <UploadCloud className="h-6 w-6 text-slate-400" />}
            <p className="mt-2 text-sm text-slate-600">{t("attachments.dropHint")}</p>
            <input ref={inputRef} type="file" multiple hidden onChange={(e) => (pick(e.target.files), (e.target.value = ""))} />
          </div>
        )}
        {isLoading && <Spinner />}
        {data?.length === 0 && <p className="text-sm text-slate-500">{t("attachments.empty")}</p>}
        <ul className="divide-y divide-slate-100">
          {data?.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <FileText className="h-5 w-5 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{a.fileName}</p>
                <p className="text-xs text-slate-500">
                  {formatBytes(a.size)} · {a.uploadedBy.fullName} · {formatDate(a.createdAt, locale)}
                </p>
              </div>
              <button
                className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                title={t("common.download")}
                onClick={() => api.download(`/attachments/${a.id}/download`, a.fileName).catch(toast.error)}
              >
                <Download className="h-4 w-4" />
              </button>
              {!readOnly && (
                <button className="rounded p-1.5 text-red-500 hover:bg-red-50" title={t("common.delete")} onClick={() => setToDelete(a)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        loading={remove.isPending}
        title={t("common.delete")}
        message={t("attachments.deleteConfirm", { name: toDelete?.fileName ?? "" })}
        confirmLabel={t("common.delete")}
      />
    </Card>
  );
}
