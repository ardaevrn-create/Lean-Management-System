"use client";

import { Hammer } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";

export function ComingSoon({ titleKey }: { titleKey: string }) {
  const t = useT();
  return (
    <>
      <PageHeader title={t(titleKey)} />
      <Card>
        <EmptyState icon={<Hammer className="h-6 w-6" />} title={t("common.comingSoon")} description={t("common.comingSoonDesc")} />
      </Card>
    </>
  );
}
