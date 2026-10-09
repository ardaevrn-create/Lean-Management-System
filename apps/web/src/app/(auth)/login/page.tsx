"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getLastTenantCode, useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const { t, locale, setLocale } = useI18n();
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [tenantCode, setTenantCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setTenantCode(getLastTenantCode()), []);
  useEffect(() => {
    if (!loading && user && !user.mustChangePassword) router.replace("/");
  }, [loading, user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const u = await login(tenantCode.trim(), username.trim(), password);
      router.replace(u.mustChangePassword ? "/change-password" : "/");
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      setError(status === 401 ? t("auth.invalidCredentials") : err instanceof Error ? err.message : t("common.error"));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{t("auth.loginTitle")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("auth.loginSubtitle")}</p>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <Field label={t("auth.tenantCode")} required>
        <Input value={tenantCode} onChange={(e) => setTenantCode(e.target.value)} autoComplete="organization" required placeholder="DEMO" />
      </Field>
      <Field label={t("auth.username")} required hint={t("auth.usernameHint")}>
        <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
      </Field>
      <Field label={t("auth.password")} required>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        {t("auth.login")}
      </Button>
      <div className="text-center">
        <button type="button" onClick={() => setLocale(locale === "tr" ? "en" : "tr")} className="text-xs text-slate-500 hover:text-slate-700">
          {locale === "tr" ? "English" : "Türkçe"}
        </button>
      </div>
    </form>
  );
}
