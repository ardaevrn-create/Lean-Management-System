"use client";

import { useParams } from "next/navigation";
import { FieldAudit } from "@/components/audits/field-audit";

/** Saha denetim ekranı: telefon / tablet öncelikli. */
export default function AuditPage() {
  const { id } = (useParams<{ id: string }>() as { id: string });
  return <FieldAudit id={id} />;
}
