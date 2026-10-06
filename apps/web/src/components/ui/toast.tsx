"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";

interface ToastItem {
  id: number;
  kind: "success" | "error";
  message: string;
}
interface ToastApi {
  success: (message: string) => void;
  error: (err: unknown) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastItem["kind"], message: string) => {
    const id = ++seq;
    setItems((cur) => [...cur, { id, kind, message }]);
    setTimeout(() => setItems((cur) => cur.filter((i) => i.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push("success", m),
      error: (err) => {
        let msg = t("common.error");
        if (err instanceof ApiError) msg = err.code === "NETWORK_ERROR" ? t("common.networkError") : err.message;
        else if (err instanceof Error) msg = err.message;
        else if (typeof err === "string") msg = err;
        push("error", msg);
      },
    }),
    [push, t],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
        {items.map((i) => (
          <div
            key={i.id}
            className={cn(
              "animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg border bg-white px-3 py-2.5 text-sm shadow-lg",
              i.kind === "success" ? "border-emerald-200" : "border-red-200",
            )}
          >
            {i.kind === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            )}
            <span className="flex-1 text-slate-700">{i.message}</span>
            <button onClick={() => setItems((cur) => cur.filter((x) => x.id !== i.id))} className="text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
