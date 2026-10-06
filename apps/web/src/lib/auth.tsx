"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthUser, LoginResponse } from "@lean/shared";
import { api, onSessionExpired, tokens } from "./api";

const TENANT_KEY = "lean.tenantCode";

interface AuthValue {
  user: AuthUser | null;
  loading: boolean;
  login: (tenantCode: string, username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasPermission: (code: string) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function getLastTenantCode(): string {
  try {
    return window.localStorage.getItem(TENANT_KEY) ?? "";
  } catch {
    return "";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();

  const reset = useCallback(() => {
    tokens.clear();
    setUser(null);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    onSessionExpired(() => {
      reset();
      router.replace("/login");
    });
    return () => onSessionExpired(null);
  }, [reset, router]);

  // İlk yüklemede oturumu geri getir
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (tokens.access || tokens.refresh) {
        try {
          const me = await api.get<AuthUser>("/auth/me");
          if (!cancelled) setUser(me);
        } catch {
          if (!cancelled) setUser(null);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Şifre değişikliği zorunluysa yönlendir
  useEffect(() => {
    if (user?.mustChangePassword && pathname !== "/change-password") router.replace("/change-password");
  }, [user, pathname, router]);

  const login = useCallback(async (tenantCode: string, username: string, password: string) => {
    const res = await api.login<LoginResponse>("/auth/login", { tenantCode, username, password });
    tokens.set(res);
    try {
      window.localStorage.setItem(TENANT_KEY, tenantCode);
    } catch {
      /* yok say */
    }
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = tokens.refresh;
    try {
      if (refreshToken) await api.post("/auth/logout", { refreshToken });
    } catch {
      /* yok say */
    }
    reset();
    router.replace("/login");
  }, [reset, router]);

  const refreshUser = useCallback(async () => {
    setUser(await api.get<AuthUser>("/auth/me"));
  }, []);

  const hasPermission = useCallback((code: string) => !!user?.permissions.includes(code), [user]);

  const value = useMemo(
    () => ({ user, loading, login, logout, refreshUser, hasPermission }),
    [user, loading, login, logout, refreshUser, hasPermission],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
