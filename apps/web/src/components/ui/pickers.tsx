"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { Employee, OrgUnitNode, Paginated } from "@lean/shared";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { Select } from "./input";

export interface PickerOption {
  id: string;
  label: string;
  sub?: string | null;
}

/** Aramalı açılır liste (tekli). Seçili etiket `valueLabel` ile gösterilir. */
function SearchSelect({
  value,
  valueLabel,
  onChange,
  useOptions,
  placeholder,
  clearable = true,
  disabled,
}: {
  value: string | null | undefined;
  valueLabel?: string | null;
  onChange: (id: string | null, option: PickerOption | null) => void;
  useOptions: (q: string, enabled: boolean) => { data: PickerOption[] | undefined; isFetching: boolean };
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<PickerOption | null>(null);
  const dq = useDebounce(q);
  const ref = useRef<HTMLDivElement>(null);
  const { data, isFetching } = useOptions(dq, open);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const label = value ? (picked?.id === value ? picked.label : (valueLabel ?? picked?.label ?? value)) : "";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 text-left text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100",
          !label && "text-slate-400",
        )}
      >
        <span className="truncate">{label || placeholder || t("common.select")}</span>
        <span className="flex items-center gap-1">
          {clearable && value && !disabled && (
            <span
              role="button"
              className="rounded p-0.5 text-slate-400 hover:text-slate-600"
              onClick={(e) => {
                e.stopPropagation();
                setPicked(null);
                onChange(null, null);
              }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[14rem] rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("common.search")}
              className="h-9 w-full bg-transparent text-sm focus:outline-none"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {isFetching && !data && <li className="px-3 py-2 text-sm text-slate-400">{t("common.loading")}</li>}
            {data?.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">{t("common.noResults")}</li>}
            {data?.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(o);
                    onChange(o.id, o);
                    setOpen(false);
                    setQ("");
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-slate-800">{o.label}</span>
                    {o.sub && <span className="block truncate text-xs text-slate-500">{o.sub}</span>}
                  </span>
                  {o.id === value && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function useUserOptions(q: string, enabled: boolean) {
  return useQuery({
    queryKey: ["users", "lookup", q],
    enabled,
    queryFn: async () => {
      const res = await api.get<{ id: string; fullName: string; username: string; orgUnitName: string | null }[]>("/users/lookup", { q });
      return res.map<PickerOption>((u) => ({ id: u.id, label: u.fullName, sub: u.orgUnitName ?? u.username }));
    },
  });
}

function useEmployeeOptions(q: string, enabled: boolean) {
  return useQuery({
    queryKey: ["employees", "picker", q],
    enabled,
    queryFn: async () => {
      const res = await api.get<Paginated<Employee>>("/employees", { q, pageSize: 20, isActive: true });
      return res.items.map<PickerOption>((e) => ({ id: e.id, label: e.fullName, sub: [e.employeeNo, e.orgUnit?.name].filter(Boolean).join(" · ") }));
    },
  });
}

export function UserPicker(props: {
  value: string | null | undefined;
  valueLabel?: string | null;
  onChange: (id: string | null, option: PickerOption | null) => void;
  placeholder?: string;
  clearable?: boolean;
}) {
  return <SearchSelect {...props} useOptions={useUserOptions} />;
}

export function EmployeePicker(props: {
  value: string | null | undefined;
  valueLabel?: string | null;
  onChange: (id: string | null, option: PickerOption | null) => void;
  placeholder?: string;
  clearable?: boolean;
}) {
  return <SearchSelect {...props} useOptions={useEmployeeOptions} />;
}

/** Çoklu seçim: seçilenler chip olarak gösterilir, altında tekli arama ile eklenir. */
export function MultiPicker({
  selected,
  onChange,
  kind,
  placeholder,
}: {
  selected: PickerOption[];
  onChange: (items: PickerOption[]) => void;
  kind: "user" | "employee";
  placeholder?: string;
}) {
  const Picker = kind === "user" ? UserPicker : EmployeePicker;
  const [key, setKey] = useState(0);
  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
              {s.label}
              <button type="button" onClick={() => onChange(selected.filter((x) => x.id !== s.id))} className="text-brand-400 hover:text-brand-700">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Picker
        key={key}
        value={null}
        placeholder={placeholder}
        clearable={false}
        onChange={(id, opt) => {
          if (id && opt && !selected.some((s) => s.id === id)) onChange([...selected, opt]);
          setKey((k) => k + 1);
        }}
      />
    </div>
  );
}

/** Ağaç düğümlerini girintili düz listeye çevirir. */
export function flattenOrgTree(nodes: OrgUnitNode[], depth = 0): { node: OrgUnitNode; depth: number }[] {
  return nodes.flatMap((n) => [{ node: n, depth }, ...flattenOrgTree(n.children ?? [], depth + 1)]);
}

export function useOrgTree() {
  return useQuery({ queryKey: ["org-units", "tree"], queryFn: () => api.get<OrgUnitNode[]>("/org-units/tree"), staleTime: 60_000 });
}

/** Girintili ağaç görünümlü birim seçici (native select). */
export function OrgUnitSelect({
  value,
  onChange,
  placeholder,
  excludeId,
  className,
}: {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  placeholder?: string;
  /** Bu birimi ve altını listeden çıkarır (kendi altına taşımayı engellemek için) */
  excludeId?: string;
  className?: string;
}) {
  const t = useT();
  const { data } = useOrgTree();
  const items = useMemo(() => {
    const skip = new Set<string>();
    const walk = (nodes: OrgUnitNode[], skipping: boolean) =>
      nodes.forEach((n) => {
        const s = skipping || n.id === excludeId;
        if (s) skip.add(n.id);
        walk(n.children ?? [], s);
      });
    if (excludeId && data) walk(data, false);
    return flattenOrgTree(data ?? []).filter((i) => !skip.has(i.node.id));
  }, [data, excludeId]);
  return (
    <Select className={className} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder ?? t("common.select")}</option>
      {items.map(({ node, depth }) => (
        <option key={node.id} value={node.id}>
          {"  ".repeat(depth)}
          {depth > 0 ? "└ " : ""}
          {node.name}
        </option>
      ))}
    </Select>
  );
}
