"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, X, Workflow } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const t = useT();
  const pathname = usePathname();
  const { hasPermission } = useAuth();

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || hasPermission(i.permission)) })).filter(
    (g) => g.items.length > 0,
  );

  const content = (compact: boolean) => (
    <div className="flex h-full flex-col bg-slate-900 text-slate-300">
      <div className={cn("flex h-14 shrink-0 items-center gap-2 border-b border-slate-800 px-4", compact && "justify-center px-0")}>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Workflow className="h-5 w-5" />
        </span>
        {!compact && <span className="truncate text-sm font-semibold text-white">{t("app.name")}</span>}
        <button className="ml-auto rounded p-1 text-slate-400 hover:text-white lg:hidden" onClick={onMobileClose} aria-label={t("common.close")}>
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.titleKey && !compact && (
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t(g.titleKey)}</p>
            )}
            {g.titleKey && compact && <div className="mx-3 mb-2 border-t border-slate-800" />}
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={compact ? t(item.labelKey) : undefined}
                      onClick={onMobileClose}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        compact && "justify-center px-0",
                        active ? "bg-brand-600 text-white" : "hover:bg-slate-800 hover:text-white",
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      {!compact && <span className="truncate">{t(item.labelKey)}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <button
        onClick={onToggle}
        className="hidden h-11 shrink-0 items-center justify-center border-t border-slate-800 text-slate-400 hover:text-white lg:flex"
        aria-label={t("nav.toggle")}
      >
        {compact ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
      </button>
    </div>
  );

  return (
    <>
      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 lg:block", collapsed ? "w-16" : "w-64")}>
        {content(collapsed)}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={onMobileClose} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">{content(false)}</aside>
        </div>
      )}
    </>
  );
}
