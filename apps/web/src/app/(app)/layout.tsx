"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import type { TenantInfo } from "@lean/shared";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { LoadingBlock } from "@/components/ui/feedback";

const COLLAPSE_KEY = "lean.sidebarCollapsed";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* yok say */
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const tenant = useQuery({ queryKey: ["tenant"], queryFn: () => api.get<TenantInfo>("/tenant"), enabled: !!user, staleTime: 5 * 60_000 });
  const brand = tenant.data?.primaryColor;

  if (loading || !user) return <LoadingBlock className="min-h-screen" />;

  return (
    <div style={brand ? ({ "--brand": brand } as React.CSSProperties) : undefined}>
      <Sidebar
        collapsed={collapsed}
        onToggle={() => {
          setCollapsed((c) => {
            try {
              window.localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
            } catch {
              /* yok say */
            }
            return !c;
          });
        }}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className={cn("flex min-h-screen flex-col transition-[padding] duration-200", collapsed ? "lg:pl-16" : "lg:pl-64")}>
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
