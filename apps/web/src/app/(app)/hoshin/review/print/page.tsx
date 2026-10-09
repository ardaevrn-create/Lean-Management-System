"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/utils";
import { Button, LoadingBlock } from "@/components/ui";
import { ReviewSummary, ReviewTable, useReview } from "@/components/strategy/review";

/** Sayfa düzeni yazdırmada gizlenir; kullanıcı "PDF olarak kaydet" ile raporu alır. */
const PRINT_CSS = `
@media print {
  aside, header { display: none !important; }
  [class*="lg:pl-"] { padding-left: 0 !important; }
  main { max-width: none !important; padding: 0 !important; }
  body { background: #fff !important; }
  .print-hide { display: none !important; }
  .print-sheet { box-shadow: none !important; border: none !important; padding: 0 !important; max-width: none !important; }
  @page { size: A4 landscape; margin: 10mm; }
}
`;

export default function ReviewPrintPage() {
  const { t, locale } = useI18n();
  const [params, setParams] = useState<{ planId: string | null; year: number | null } | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setParams({ planId: sp.get("planId"), year: sp.get("year") ? Number(sp.get("year")) : null });
  }, []);
  const { data } = useReview(params?.planId, params?.year ?? null);
  if (!data) return <LoadingBlock />;
  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="print-hide mb-4 flex items-center justify-between">
        <Link href="/hoshin?tab=review" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
          {t("strategyModule.title")}
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          {t("strategyModule.xmatrix.print")}
        </Button>
      </div>
      <div className="print-sheet mx-auto max-w-6xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">{t("strategyModule.review.title", { year: data.year })}</h1>
        <p className="mb-4 text-sm text-slate-500">
          {data.plan.name} · v{data.plan.version} · {formatDateTime(data.generatedAt, locale)}
        </p>
        <ReviewSummary data={data} />
        <div className="mt-4">
          <ReviewTable data={data} print />
        </div>
      </div>
    </>
  );
}
