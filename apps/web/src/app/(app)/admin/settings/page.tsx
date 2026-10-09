"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TenantInfo } from "@lean/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Button, Card, CardBody, Field, Input, LoadingBlock, PageHeader, Select } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

const TIMEZONES = ["Europe/Istanbul", "Europe/London", "Europe/Berlin", "UTC", "America/New_York", "Asia/Dubai"];

export default function SettingsPage() {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { refreshUser } = useAuth();
  const { data } = useQuery({ queryKey: ["tenant"], queryFn: () => api.get<TenantInfo>("/tenant") });
  const [name, setName] = useState("");
  const [locale, setLocale] = useState("tr");
  const [timezone, setTimezone] = useState("Europe/Istanbul");
  const [color, setColor] = useState("#4f46e5");

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setLocale(data.locale);
    setTimezone(data.timezone);
    setColor(data.primaryColor ?? "#4f46e5");
  }, [data]);

  const save = useMutation({
    mutationFn: () => api.patch<TenantInfo>("/tenant", { name: name.trim(), locale, timezone, primaryColor: color }),
    onSuccess: (r) => {
      qc.setQueryData(["tenant"], r);
      refreshUser();
      toast.success(t("common.saved"));
    },
    onError: toast.error,
  });

  if (!data) return <LoadingBlock />;
  const tzs = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES];

  return (
    <>
      <PageHeader title={t("nav.settings")} />
      <Card className="max-w-2xl">
        <CardBody className="space-y-4">
          <Field label={t("settings.companyCode")}>
            <Input value={data.code} disabled />
          </Field>
          <Field label={t("settings.companyName")} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("settings.defaultLocale")}>
              <Select value={locale} onChange={(e) => setLocale(e.target.value)}>
                <option value="tr">Türkçe</option>
                <option value="en">English</option>
              </Select>
            </Field>
            <Field label={t("settings.timezone")}>
              <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {tzs.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={t("settings.primaryColor")}>
            <div className="flex items-center gap-3">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 cursor-pointer rounded border border-slate-300 bg-white p-1" />
              <Input value={color} onChange={(e) => setColor(e.target.value)} className="w-32 font-mono" />
            </div>
          </Field>
          <div className="flex justify-end">
            <Button disabled={!name.trim()} loading={save.isPending} onClick={() => save.mutate()}>
              {t("common.save")}
            </Button>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
