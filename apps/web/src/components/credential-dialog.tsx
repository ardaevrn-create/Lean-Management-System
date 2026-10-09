"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { CreatedCredential } from "@lean/shared";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* yok say */
        }
      }}
    >
      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      {copied ? t("common.copied") : (label ?? t("common.copy"))}
    </Button>
  );
}

/** Oluşturulan kullanıcı adı + geçici şifreyi gösterir (şifre yalnızca bir kez görünür). */
export function CredentialDialog({ credential, onClose }: { credential: CreatedCredential | null; onClose: () => void }) {
  const t = useT();
  return (
    <Dialog open={!!credential} onClose={onClose} title={t("credential.title")} size="sm" footer={<Button onClick={onClose}>{t("common.close")}</Button>}>
      {credential && (
        <div className="space-y-4">
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t("credential.warning")}</p>
          <div>
            <p className="text-xs text-slate-500">{t("auth.username")}</p>
            <p className="font-mono text-sm font-medium">{credential.username}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{t("credential.tempPassword")}</p>
            <p className="font-mono text-base font-semibold tracking-wide">{credential.temporaryPassword}</p>
          </div>
          <CopyButton text={`${credential.username} / ${credential.temporaryPassword}`} label={t("credential.copyAll")} />
        </div>
      )}
    </Dialog>
  );
}
