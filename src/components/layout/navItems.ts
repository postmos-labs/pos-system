import {
  CalendarDays,
  Building2,
  ClipboardList,
  Code2,
  Database,
  Gauge,
  HardHat,
  Images,
  LayoutDashboard,
  ChartNoAxesCombined,
  Network,
  Package,
  PenLine,
  RefreshCw,
  ShieldCheck,
  Store,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  key: Role;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

export const COMMON_NAV: NavItem[] = [
  { href: "/approvals", label: "승인함", icon: ShieldCheck },
  { href: "/overview", label: "공통 대시보드", icon: LayoutDashboard },
  { href: "/kpi", label: "KPI", icon: ChartNoAxesCombined },
  { href: "/calendar", label: "캘린더", icon: CalendarDays },
  { href: "/merchants", label: "가맹점", icon: Store },
  { href: "/contracts", label: "계약서 / 서명", icon: PenLine },
  { href: "/dev-requests", label: "개발요청", icon: Code2 },
];

export const ROLE_FOLDERS: NavGroup[] = [
  {
    key: "cs",
    label: "CS 업무",
    icon: LayoutDashboard,
    items: [{ href: "/dashboard", label: "CS 업무", icon: LayoutDashboard }],
  },
  {
    key: "tech",
    label: "기술지원",
    icon: HardHat,
    items: [
      { href: "/tech-dashboard", label: "기술지원 대시보드", icon: Gauge },
      { href: "/installs", label: "설치 관리", icon: Package },
      { href: "/installs/delivery", label: "택배 발송", icon: Truck },
      { href: "/installs/mine", label: "기사 페이지", icon: HardHat },
      { href: "/installs/photos", label: "완료사진", icon: Images },
      { href: "/external-techs", label: "외부 기사 관리", icon: Users },
      { href: "/inventory", label: "재고 실사", icon: ClipboardList },
      { href: "/transfers", label: "전환건", icon: RefreshCw },
      { href: "/blueprints", label: "설계도", icon: Network },
      { href: "/chatbot-data", label: "챗봇 데이터 수집", icon: Database },
    ],
  },
];

export const BOTTOM_NAV: NavItem[] = [
  { href: "/large-franchises", label: "대형 가맹점", icon: Building2 },
];

export const ADMIN_NAV: NavItem[] = [{ href: "/admin/users", label: "직원 관리", icon: Users }];

export const MASTER_NAV: NavItem[] = [
  { href: "/admin/logs", label: "직원 활동 로그", icon: ClipboardList },
];

export const ALL_NAV_HREFS = [
  ...COMMON_NAV,
  ...ROLE_FOLDERS.flatMap((folder) => folder.items),
  ...BOTTOM_NAV,
  ...ADMIN_NAV,
  ...MASTER_NAV,
].map((item) => item.href);

export function isNavItemActive(pathname: string, href: string) {
  if (href.includes("?")) return false;
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;

  return !ALL_NAV_HREFS.some(
    (other) =>
      other !== href &&
      other.startsWith(`${href}/`) &&
      (pathname === other || pathname.startsWith(`${other}/`)),
  );
}

export function breadcrumbForPath(pathname: string) {
  const common = COMMON_NAV.find((item) => isNavItemActive(pathname, item.href));
  if (common) return [common.label];

  for (const group of ROLE_FOLDERS) {
    const child = group.items.find((item) => isNavItemActive(pathname, item.href));
    if (child) return group.items.length === 1 ? [child.label] : [group.label, child.label];
  }

  const managed = [...BOTTOM_NAV, ...ADMIN_NAV, ...MASTER_NAV].find((item) =>
    isNavItemActive(pathname, item.href),
  );
  if (managed) return ["관리", managed.label];

  return ["대시보드"];
}
