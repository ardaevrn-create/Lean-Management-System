"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Download, FileSpreadsheet, UploadCloud } from "lucide-react";
import type { ImportCommitResult, ImportPreview, ImportRowError, ImportTypeInfo, ImportValidationResult } from "@lean/shared";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, CardBody, Field, LoadingBlock, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

type Step = 1 | 2 | 3 | 4;
const ACCEPT = ".xlsx,.csv";

function Stepper({ step }: { step: Step }) {
  const t = useT();
  const steps = ["upload", "mapping", "validate", "result"] as const;
  return (
    <ol className="mb-6 flex items-center gap-2 overflow-x-auto">
      {steps.map((s, i) => {
        const n = (i + 1) as Step;
        const done = n < step;
        const current = n === step;
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                done ? "bg-emerald-500 text-white" : current ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500",
              )}
            >
              {done ? <Check className="h-4 w-4" /> : n}
            </span>
            <span className={cn("whitespace-nowrap text-sm", current ? "font-medium text-slate-900" : "text-slate-500")}>{t(`imports.step.${s}`)}</span>
            {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-slate-300 sm:w-10" />}
          </li>
        );
      })}
    </ol>
  );
}

function ErrorTable({ errors }: { errors: ImportRowError[] }) {
  const t = useT();
  if (!errors.length) return null;
  return (
    <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
      <Table>
        <THead>
          <tr>
            <TH className="w-20">{t("imports.row")}</TH>
            <TH>{t("imports.column")}</TH>
            <TH>{t("imports.message")}</TH>
          </tr>
        </THead>
        <TBody>
          {errors.map((e, i) => (
            <TR key={i}>
              <TD className="tabular-nums">{e.row}</TD>
              <TD>{e.column ?? "-"}</TD>
              <TD className="text-red-700">{e.message}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "gray" | "green" | "red" }) {
  const colors = { gray: "bg-slate-50 text-slate-900", green: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700" };
  return (
    <div className={cn("rounded-xl p-4", colors[tone])}>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-sm opacity-80">{label}</p>
    </div>
  );
}

/** Genel Excel/CSV içe aktarma sihirbazı. `type` verilirse tür seçimi gizlenir (modüllere gömülebilir). */
export function ImportWizard({ type: fixedType, onFinished }: { type?: string; onFinished?: (r: ImportCommitResult) => void }) {
  const t = useT();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [type, setType] = useState<string>(fixedType ?? "");
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [validation, setValidation] = useState<ImportValidationResult | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);

  const types = useQuery({ queryKey: ["imports", "types"], queryFn: () => api.get<ImportTypeInfo[]>("/imports/types"), staleTime: 5 * 60_000 });
  useEffect(() => {
    if (!type && types.data?.length) setType(fixedType ?? types.data[0].type);
  }, [types.data, type, fixedType]);
  const info = types.data?.find((x) => x.type === (preview?.type ?? type));

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", type);
      return api.upload<ImportPreview>("/imports/upload", fd);
    },
    onSuccess: (p) => {
      setPreview(p);
      setMapping(p.suggestedMapping ?? {});
      setValidation(null);
      setStep(2);
    },
    onError: toast.error,
  });
  const validate = useMutation({
    mutationFn: () => api.post<ImportValidationResult>(`/imports/${preview!.jobId}/validate`, { mapping }),
    onSuccess: (r) => (setValidation(r), setStep(3)),
    onError: toast.error,
  });
  const commit = useMutation({
    mutationFn: () => api.post<ImportCommitResult>(`/imports/${preview!.jobId}/commit`, { mapping }),
    onSuccess: (r) => (setResult(r), setStep(4), onFinished?.(r)),
    onError: toast.error,
  });

  const missingRequired = useMemo(() => info?.columns.filter((c) => c.required && !mapping[c.key]) ?? [], [info, mapping]);

  const reset = () => {
    setStep(1);
    setPreview(null);
    setMapping({});
    setValidation(null);
    setResult(null);
  };

  const pickFile = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!/\.(xlsx|csv)$/i.test(f.name)) return toast.error(t("imports.badFileType"));
    upload.mutate(f);
  };

  return (
    <div>
      <Stepper step={step} />

      {step === 1 && (
        <Card>
          <CardBody className="space-y-5">
            {types.isLoading && <LoadingBlock />}
            {!fixedType && types.data && (
              <Field label={t("imports.type")}>
                <Select value={type} onChange={(e) => setType(e.target.value)}>
                  {types.data.map((x) => (
                    <option key={x.type} value={x.type}>
                      {x.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {info && (
              <div className="rounded-lg bg-slate-50 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">{t("imports.columns")}</p>
                  <Button variant="outline" size="sm" onClick={() => api.download(`/imports/types/${info.type}/template`, `${info.type}-template.xlsx`).catch(toast.error)}>
                    <Download className="h-4 w-4" />
                    {t("imports.downloadTemplate")}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {info.columns.map((c) => (
                    <Badge key={c.key} tone={c.required ? "indigo" : "gray"} title={c.description}>
                      {c.label}
                      {c.required && " *"}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div
              onDragOver={(e) => (e.preventDefault(), setDragging(true))}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => (e.preventDefault(), setDragging(false), pickFile(e.dataTransfer.files))}
              onClick={() => type && inputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors",
                dragging ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-white hover:border-brand-400 hover:bg-slate-50",
                !type && "pointer-events-none opacity-50",
              )}
            >
              {upload.isPending ? <LoadingBlock className="py-0" /> : <UploadCloud className="h-12 w-12 text-brand-500" />}
              <p className="mt-3 text-base font-medium text-slate-800">{t("imports.dropTitle")}</p>
              <p className="mt-1 text-sm text-slate-500">{t("imports.dropHint")}</p>
              <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={(e) => (pickFile(e.target.files), (e.target.value = ""))} />
            </div>
          </CardBody>
        </Card>
      )}

      {step === 2 && preview && info && (
        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                <span className="font-medium">{preview.fileName}</span>
                <span className="text-slate-500">· {t("imports.totalRows", { count: preview.totalRows })}</span>
              </div>
              <p className="text-sm text-slate-500">{t("imports.mappingHint")}</p>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <Table>
                  <THead>
                    <tr>
                      <TH>{t("imports.importColumn")}</TH>
                      <TH>{t("imports.excelColumn")}</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {info.columns.map((c) => (
                      <TR key={c.key}>
                        <TD>
                          <span className="font-medium text-slate-900">{c.label}</span>
                          {c.required && <span className="ml-1 text-red-500">*</span>}
                          {c.description && <p className="text-xs text-slate-500">{c.description}</p>}
                        </TD>
                        <TD className="w-1/2">
                          <Select
                            value={mapping[c.key] ?? ""}
                            className={cn(c.required && !mapping[c.key] && "border-red-300")}
                            onChange={(e) => setMapping({ ...mapping, [c.key]: e.target.value || null })}
                          >
                            <option value="">{t("imports.notMapped")}</option>
                            {preview.headers.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </Select>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
              {missingRequired.length > 0 && (
                <p className="flex items-center gap-1.5 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4" />
                  {t("imports.requiredMissing", { columns: missingRequired.map((c) => c.label).join(", ") })}
                </p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="mb-2 text-sm font-medium text-slate-800">{t("imports.samplePreview")}</p>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <Table>
                  <THead>
                    <tr>
                      {preview.headers.map((h) => (
                        <TH key={h}>{h}</TH>
                      ))}
                    </tr>
                  </THead>
                  <TBody>
                    {preview.sampleRows.map((r, i) => (
                      <TR key={i}>
                        {preview.headers.map((h) => (
                          <TD key={h} className="whitespace-nowrap">
                            {r[h] == null ? "" : String(r[h])}
                          </TD>
                        ))}
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </CardBody>
          </Card>
          <div className="flex justify-between">
            <Button variant="outline" onClick={reset}>
              <ArrowLeft className="h-4 w-4" />
              {t("common.back")}
            </Button>
            <Button disabled={missingRequired.length > 0} loading={validate.isPending} onClick={() => validate.mutate()}>
              {t("imports.validate")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 3 && validation && (
        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label={t("imports.totalRowsLabel")} value={validation.totalRows} tone="gray" />
                <Stat label={t("imports.validRows")} value={validation.validRows} tone="green" />
                <Stat label={t("imports.errorRows")} value={validation.errorRows} tone={validation.errorRows ? "red" : "gray"} />
              </div>
              {validation.errorRows > 0 && <p className="text-sm text-amber-700">{t("imports.errorsSkipped")}</p>}
              <ErrorTable errors={validation.errors} />
            </CardBody>
          </Card>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft className="h-4 w-4" />
              {t("imports.backToMapping")}
            </Button>
            <Button disabled={validation.validRows === 0} loading={commit.isPending} onClick={() => commit.mutate()}>
              <Check className="h-4 w-4" />
              {t("imports.commit", { count: validation.validRows })}
            </Button>
          </div>
        </div>
      )}

      {step === 4 && result && (
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              <h3 className="text-lg font-semibold text-slate-900">{t("imports.done")}</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label={t("imports.totalRowsLabel")} value={result.totalRows} tone="gray" />
              <Stat label={t("imports.successRows")} value={result.successRows} tone="green" />
              <Stat label={t("imports.errorRows")} value={result.errorRows} tone={result.errorRows ? "red" : "gray"} />
            </div>
            <ErrorTable errors={result.errors} />
            <Button onClick={reset}>{t("imports.importAnother")}</Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
