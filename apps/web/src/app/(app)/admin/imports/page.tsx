"use client";

import { useT } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
import { ImportWizard } from "@/components/import-wizard";

export default function ImportsPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t("nav.imports")} description={t("imports.subtitle")} />
      <ImportWizard />
    </>
  );
}
