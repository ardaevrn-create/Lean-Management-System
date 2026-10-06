import {
  Building2,
  CalendarDays,
  ClipboardCheck,
  FileSpreadsheet,
  Gauge,
  History,
  KeyRound,
  Home,
  Lightbulb,
  ListChecks,
  Network,
  Puzzle,
  Settings,
  ShieldCheck,
  Target,
  UserCog,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  permission?: string;
}
export interface NavGroup {
  titleKey?: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    items: [
      { href: "/", labelKey: "nav.home", icon: Home },
      { href: "/actions", labelKey: "nav.actions", icon: ListChecks },
      // KPI: veri giriş sorumluları kpi.view olmadan da kendi KPI'larını görür; veri kapsamı API'da uygulanır
      { href: "/kpi", labelKey: "nav.kpi", icon: Gauge },
      { href: "/meetings", labelKey: "nav.meetings", icon: CalendarDays, permission: "meeting.view" },
      // Hoshin: hedef sahipleri hoshin.view olmadan da kendi hedeflerini görür; veri kapsamı API'da uygulanır
      { href: "/hoshin", labelKey: "nav.hoshin", icon: Target },
      { href: "/problems", labelKey: "nav.problems", icon: Puzzle, permission: "problem.create" },
      { href: "/audits", labelKey: "nav.audits", icon: ClipboardCheck },
      { href: "/suggestions", labelKey: "nav.suggestions", icon: Lightbulb, permission: "suggestion.create" },
    ],
  },
  {
    titleKey: "nav.groupOrg",
    items: [
      { href: "/org/units", labelKey: "nav.orgUnits", icon: Network, permission: "org.view" },
      { href: "/org/employees", labelKey: "nav.employees", icon: Users, permission: "employee.manage" },
      { href: "/org/teams", labelKey: "nav.teams", icon: UsersRound, permission: "org.view" },
    ],
  },
  {
    titleKey: "nav.groupAdmin",
    items: [
      { href: "/admin/users", labelKey: "nav.users", icon: UserCog, permission: "user.manage" },
      { href: "/admin/roles", labelKey: "nav.roles", icon: ShieldCheck, permission: "role.manage" },
      { href: "/admin/imports", labelKey: "nav.imports", icon: FileSpreadsheet, permission: "import.run" },
      { href: "/admin/api-keys", labelKey: "nav.apiKeys", icon: KeyRound, permission: "apikey.manage" },
      { href: "/admin/audit-logs", labelKey: "nav.auditLogs", icon: History, permission: "auditlog.view" },
      { href: "/admin/settings", labelKey: "nav.settings", icon: Settings, permission: "tenant.settings" },
    ],
  },
];

export const BRAND_ICON = Building2;
