import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1 overflow-x-auto border-b border-slate-200", className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={tab.value === value}
          onClick={() => onChange(tab.value)}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors",
            tab.value === value
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
