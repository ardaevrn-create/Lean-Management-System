"use client";

import type { ActionStatus, Priority } from "@lean/shared";
import { useT } from "@/lib/i18n";
import { Badge, type BadgeTone } from "./badge";

const statusTone: Record<ActionStatus, BadgeTone> = {
  OPEN: "gray",
  IN_PROGRESS: "blue",
  DONE: "amber",
  VERIFIED: "green",
  CANCELLED: "muted",
};

export function StatusBadge({ status, overdue }: { status: ActionStatus; overdue?: boolean }) {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1">
      <Badge tone={statusTone[status]}>{t(`actionStatus.${status}`)}</Badge>
      {overdue && <Badge tone="red">{t("actions.overdue")}</Badge>}
    </span>
  );
}

const priorityTone: Record<Priority, BadgeTone> = { LOW: "gray", MEDIUM: "blue", HIGH: "amber", CRITICAL: "red" };

export function PriorityBadge({ priority }: { priority: Priority }) {
  const t = useT();
  return <Badge tone={priorityTone[priority]}>{t(`priority.${priority}`)}</Badge>;
}
