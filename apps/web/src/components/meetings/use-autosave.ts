"use client";

import { useEffect, useRef, useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Metin alanı için debounce'lu otomatik kayıt. Sayfadan ayrılırken bekleyen değişiklik de kaydedilir.
 * `value` yerel durumdur; `serverValue` ilk kayıtlı değerdir.
 */
export function useAutosave(value: string, serverValue: string, save: (v: string) => Promise<unknown>, enabled = true, delay = 800): SaveState {
  const debounced = useDebounce(value, delay);
  const [state, setState] = useState<SaveState>("idle");
  const lastSaved = useRef(serverValue);
  const latest = useRef({ value, save, enabled });

  useEffect(() => {
    latest.current = { value, save, enabled };
  });

  useEffect(() => {
    if (!enabled || debounced === lastSaved.current) return;
    let cancelled = false;
    setState("saving");
    const toSave = debounced;
    latest.current
      .save(toSave)
      .then(() => {
        lastSaved.current = toSave;
        if (!cancelled) setState("saved");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, enabled]);

  // Ayrılırken bekleyen değişikliği yaz
  useEffect(
    () => () => {
      const l = latest.current;
      if (l.enabled && l.value !== lastSaved.current) {
        lastSaved.current = l.value;
        void l.save(l.value).catch(() => undefined);
      }
    },
    [],
  );

  return state;
}
