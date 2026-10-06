import type { ReactNode } from "react";
import { Workflow } from "lucide-react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-900 to-brand-900 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3 text-white">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 shadow-lg">
            <Workflow className="h-6 w-6" />
          </span>
          <span className="text-xl font-semibold tracking-tight">Lean Management</span>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-2xl sm:p-8">{children}</div>
      </div>
    </div>
  );
}
