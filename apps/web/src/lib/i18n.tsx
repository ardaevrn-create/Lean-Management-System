"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import tr from "@/messages/tr.json";
import en from "@/messages/en.json";
// Modül çevirileri ayrı dosyalarda tutulur (paralel geliştirmede çakışmayı önler); modül adı anahtarı altında birleşir.
import kpiTr from "@/messages/modules/kpi.tr.json";
import kpiEn from "@/messages/modules/kpi.en.json";
import meetingsTr from "@/messages/modules/meetings.tr.json";
import meetingsEn from "@/messages/modules/meetings.en.json";
import problemsTr from "@/messages/modules/problems.tr.json";
import problemsEn from "@/messages/modules/problems.en.json";

export type Locale = "tr" | "en";
const LOCALE_KEY = "lean.locale";

type Messages = Record<string, unknown>;
const catalogs: Record<Locale, Messages> = {
  tr: { ...tr, kpiModule: kpiTr, meetingsModule: meetingsTr, problemsModule: problemsTr },
  en: { ...en, kpiModule: kpiEn, meetingsModule: meetingsEn, problemsModule: problemsEn },
};

function lookup(messages: Messages, key: string): string | undefined {
  let cur: unknown = messages;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Messages)) cur = (cur as Messages)[part];
    else return undefined;
  }
  return typeof cur === "string" ? cur : undefined;
}

export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: TFunction;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("tr");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LOCALE_KEY);
      if (saved === "tr" || saved === "en") setLocaleState(saved);
    } catch {
      /* yok say */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(LOCALE_KEY, l);
    } catch {
      /* yok say */
    }
  }, []);

  const t = useCallback<TFunction>(
    (key, vars) => {
      const raw = lookup(catalogs[locale], key) ?? lookup(catalogs.tr, key) ?? key;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useT(): TFunction {
  return useI18n().t;
}
