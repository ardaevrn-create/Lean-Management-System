"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Button, Field, Input } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

export default function ChangePasswordPage() {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const { user, loading, refreshUser, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError(t("auth.passwordTooShort"));
    if (next !== confirm) return setError(t("auth.passwordMismatch"));
    setBusy(true);
    try {
      await api.post("/auth/change-password", { currentPassword: current, newPassword: next });
      await refreshUser();
      toast.success(t("auth.passwordChanged"));
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{t("auth.changePassword")}</h1>
        {user?.mustChangePassword && <p className="mt-1 text-sm text-amber-700">{t("auth.mustChangeInfo")}</p>}
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <Field label={t("auth.currentPassword")} required>
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      </Field>
      <Field label={t("auth.newPassword")} required hint={t("auth.passwordHint")}>
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
      </Field>
      <Field label={t("auth.confirmPassword")} required>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
      </Field>
      <div className="flex gap-2">
        {!user?.mustChangePassword && (
          <Button type="button" variant="outline" className="flex-1" onClick={() => router.back()}>
            {t("common.cancel")}
          </Button>
        )}
        {user?.mustChangePassword && (
          <Button type="button" variant="outline" className="flex-1" onClick={() => logout()}>
            {t("auth.logout")}
          </Button>
        )}
        <Button type="submit" className="flex-1" loading={busy}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
