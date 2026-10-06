"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, ImageOff, Trash2 } from "lucide-react";
import {
  SUGGESTION_FLOW, type AttachmentItem, type KaizenStatus, type SuggestionCategory, type SuggestionSettingsDto, type SuggestionStatus,
} from "@lean/shared";
import { API_URL, api, tokens } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge, Card, CardBody, ConfirmDialog, Spinner, type BadgeTone } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

export const sKey = (...parts: unknown[]) => ["suggestions", ...parts];

const statusTone: Record<SuggestionStatus, BadgeTone> = {
  SUBMITTED: "gray", PRE_EVALUATION: "blue", COMMITTEE: "indigo", ACCEPTED: "green", REJECTED: "red", ON_HOLD: "amber",
  IN_IMPLEMENTATION: "blue", IMPLEMENTED: "green", CLOSED: "gray", WITHDRAWN: "muted",
};

export function SuggestionStatusBadge({ status }: { status: SuggestionStatus }) {
  const t = useT();
  return <Badge tone={statusTone[status]}>{t(`suggestionsModule.status.${status}`)}</Badge>;
}

const kaizenTone: Record<KaizenStatus, BadgeTone> = { DRAFT: "gray", SUBMITTED: "amber", APPROVED: "blue", PUBLISHED: "green", REJECTED: "red" };

export function KaizenStatusBadge({ status }: { status: KaizenStatus }) {
  const t = useT();
  return <Badge tone={kaizenTone[status]}>{t(`suggestionsModule.kaizenStatus.${status}`)}</Badge>;
}

export function CategoryBadge({ category }: { category: SuggestionCategory }) {
  const t = useT();
  return <Badge tone="gray">{t(`suggestionsModule.category.${category}`)}</Badge>;
}

export function useSuggestionSettings() {
  return useQuery({ queryKey: sKey("settings"), queryFn: () => api.get<SuggestionSettingsDto>("/suggestions/settings"), staleTime: 60_000 });
}

export function money(v: number | null | undefined, locale = "tr") {
  if (v === null || v === undefined) return "—";
  return `${Math.round(v).toLocaleString(locale === "en" ? "en-GB" : "tr-TR")} ₺`;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: string }) {
  return (
    <Card>
      <CardBody>
        <p className={cn("text-2xl font-semibold tabular-nums text-slate-900", tone)}>{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      </CardBody>
    </Card>
  );
}

/** Ana akış adımları + terminal durumlar (red/bekleme/geri çekme). */
export function StatusStepper({ status }: { status: SuggestionStatus }) {
  const t = useT();
  const terminal = status === "REJECTED" || status === "WITHDRAWN" || status === "ON_HOLD";
  const idx = SUGGESTION_FLOW.indexOf(status);
  const reached = terminal ? (status === "ON_HOLD" ? SUGGESTION_FLOW.indexOf("COMMITTEE") : -1) : idx;
  return (
    <div>
      <ol className="flex items-start overflow-x-auto pb-1">
        {SUGGESTION_FLOW.map((s, i) => {
          const done = i < reached || (i === reached && ["CLOSED"].includes(s));
          const current = i === reached && !done;
          return (
            <li key={s} className="flex min-w-[4.5rem] flex-1 flex-col items-center text-center">
              <div className="flex w-full items-center">
                <span className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : i <= reached ? "bg-brand-500" : "bg-slate-200")} />
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-semibold",
                    done ? "border-brand-600 bg-brand-600 text-white" : current ? "border-brand-600 bg-white text-brand-700" : "border-slate-300 bg-white text-slate-400",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={cn("h-0.5 flex-1", i === SUGGESTION_FLOW.length - 1 ? "bg-transparent" : i < reached ? "bg-brand-500" : "bg-slate-200")} />
              </div>
              <span className={cn("mt-1 px-0.5 text-[11px] leading-tight", current ? "font-semibold text-brand-700" : "text-slate-500")}>{t(`suggestionsModule.status.${s}`)}</span>
            </li>
          );
        })}
      </ol>
      {terminal && (
        <div className="mt-2">
          <SuggestionStatusBadge status={status} />
        </div>
      )}
    </div>
  );
}

/** Token gerektiren indirmeyi blob URL'e çevirir (<img src> için). */
export function useBlobUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!path) return;
    let revoked = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const res = await fetch(`${API_URL}${path}`, { headers: tokens.access ? { Authorization: `Bearer ${tokens.access}` } : {} });
        if (!res.ok) throw new Error(String(res.status));
        objectUrl = URL.createObjectURL(await res.blob());
        if (revoked) URL.revokeObjectURL(objectUrl);
        else setUrl(objectUrl);
      } catch {
        if (!revoked) setFailed(true);
      }
    })();
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return { url, failed };
}

export function AuthImage({ attachmentId, alt, className }: { attachmentId: string; alt: string; className?: string }) {
  const { url, failed } = useBlobUrl(`/attachments/${attachmentId}/download`);
  if (failed) {
    return (
      <div className={cn("flex items-center justify-center bg-slate-100 text-slate-300", className)}>
        <ImageOff className="h-6 w-6" />
      </div>
    );
  }
  if (!url) {
    return (
      <div className={cn("flex items-center justify-center bg-slate-100", className)}>
        <Spinner />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={cn("object-cover", className)} />;
}

export function useAttachments(entityType: string, entityId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["attachments", entityType, entityId],
    enabled: enabled && !!entityId,
    queryFn: () => api.get<AttachmentItem[]>("/attachments", { entityType, entityId: entityId! }),
  });
}

/** İlk görseli döndürür (kart önizlemesi). */
export function FirstImage({ entityType, entityId, alt, className }: { entityType: string; entityId: string; alt: string; className?: string }) {
  const { data } = useAttachments(entityType, entityId);
  const first = data?.find((a) => a.mimeType.startsWith("image/"));
  if (!first) {
    return (
      <div className={cn("flex items-center justify-center bg-slate-100 text-slate-300", className)}>
        <ImageOff className="h-6 w-6" />
      </div>
    );
  }
  return <AuthImage attachmentId={first.id} alt={alt} className={className} />;
}

/** Fotoğraf paneli: kamera/galeriden yükleme + küçük resim ızgarası. */
export function PhotoPanel({
  entityType, entityId, title, readOnly, compact,
}: {
  entityType: string;
  entityId: string;
  title?: ReactNode;
  readOnly?: boolean;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [toDelete, setToDelete] = useState<AttachmentItem | null>(null);
  const { data, isLoading } = useAttachments(entityType, entityId);
  const key = ["attachments", entityType, entityId];

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

  const images = useMemo(() => (data ?? []).filter((a) => a.mimeType.startsWith("image/")), [data]);
  return (
    <div className="space-y-2">
      {title && <h4 className="text-sm font-semibold text-slate-700">{title}</h4>}
      <div className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
        {images.map((a) => (
          <div key={a.id} className="group relative overflow-hidden rounded-lg border border-slate-200">
            <AuthImage attachmentId={a.id} alt={a.fileName} className="aspect-[4/3] w-full" />
            {!readOnly && (
              <button
                className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-red-500 shadow hover:bg-white"
                onClick={() => setToDelete(a)}
                aria-label={t("common.delete")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-slate-500 hover:border-brand-400 hover:text-brand-600"
          >
            {upload.isPending ? <Spinner /> : <Camera className="h-6 w-6" />}
            <span className="text-xs">{t("suggestionsModule.addPhoto")}</span>
          </button>
        )}
      </div>
      {isLoading && <Spinner />}
      {readOnly && !isLoading && images.length === 0 && <p className="text-sm text-slate-400">{t("suggestionsModule.noPhotos")}</p>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) upload.mutate(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        loading={remove.isPending}
        title={t("common.delete")}
        message={t("attachments.deleteConfirm", { name: toDelete?.fileName ?? "" })}
        confirmLabel={t("common.delete")}
      />
    </div>
  );
}
