"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProblemCauseCategory, ProblemDetail, ProblemPhase, ProblemSeverity } from "@lean/shared";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Badge, type BadgeTone } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

export const detailKey = (id: string) => ["problems", "detail", id];
export const useProblem = (id: string) =>
  useQuery({ queryKey: detailKey(id), queryFn: () => api.get<ProblemDetail>(`/problems/${id}`), retry: false });

const phaseTone: Record<ProblemPhase, BadgeTone> = {
  DEFINITION: "gray", CONTAINMENT: "amber", ROOT_CAUSE: "indigo", ACTIONS: "blue", VERIFICATION: "amber", CLOSED: "green", CANCELLED: "muted",
};
const severityTone: Record<ProblemSeverity, BadgeTone> = { LOW: "gray", MEDIUM: "blue", HIGH: "amber", CRITICAL: "red" };

export function PhaseBadge({ phase }: { phase: ProblemPhase }) {
  const t = useT();
  return <Badge tone={phaseTone[phase]}>{t(`problemsModule.phase.${phase}`)}</Badge>;
}

export function SeverityBadge({ severity }: { severity: ProblemSeverity }) {
  const t = useT();
  return <Badge tone={severityTone[severity]}>{t(`problemsModule.severity.${severity}`)}</Badge>;
}

/** 6M kategori renkleri (SVG ve kartlarda ortak) */
export const CATEGORY_COLORS: Record<ProblemCauseCategory, { fill: string; stroke: string; text: string }> = {
  MAN: { fill: "#dbeafe", stroke: "#2563eb", text: "#1e3a8a" },
  MACHINE: { fill: "#fee2e2", stroke: "#dc2626", text: "#7f1d1d" },
  METHOD: { fill: "#dcfce7", stroke: "#16a34a", text: "#14532d" },
  MATERIAL: { fill: "#fef3c7", stroke: "#d97706", text: "#78350f" },
  MEASUREMENT: { fill: "#ede9fe", stroke: "#7c3aed", text: "#4c1d95" },
  ENVIRONMENT: { fill: "#cffafe", stroke: "#0891b2", text: "#164e63" },
};

export const FLOW_PHASES: ProblemPhase[] = ["DEFINITION", "CONTAINMENT", "ROOT_CAUSE", "ACTIONS", "VERIFICATION", "CLOSED"];

/** ProblemDetail döndüren bir komutu çalıştırır, önbelleği günceller, hatayı toast ile gösterir. */
export function useDetailMutation<V>(id: string, fn: (v: V) => Promise<ProblemDetail>, success?: string, onDone?: (d: ProblemDetail) => void) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (d) => {
      qc.setQueryData(detailKey(id), d);
      qc.invalidateQueries({ queryKey: ["problems", "list"] });
      qc.invalidateQueries({ queryKey: ["problems", "stats"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["actions"] });
      if (success) toast.success(success);
      onDone?.(d);
    },
    onError: toast.error,
  });
}
