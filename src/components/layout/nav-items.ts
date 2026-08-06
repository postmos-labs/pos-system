import {
  LayoutDashboard,
  Building2,
  Store,
  Package,
  PenLine,
  CalendarDays,
  ClipboardList,
  Headset,
  HardHat,
  BookUser,
  Wifi,
  RefreshCw,
  Network,
  FileEdit,
  Images,
  Code2,
  NotebookText,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const COMMON_NAV: NavItem[] = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/calendar", label: "캘린더", icon: CalendarDays },
  { href: "/merchants", label: "가맹점", icon: Store },
  { href: "/contracts", label: "계약서 / 서명", icon: PenLine },
  { href: "/dev-requests", label: "개발요청", icon: Code2 },
];

export const ROLE_FOLDERS: {
  key: Role;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}[] = [
  {
    key: "cs",
    label: "CS",
    icon: Headset,
    items: [
      { href: "/franchise", label: "가맹 접수", icon: ClipboardList },
      { href: "/changes", label: "변경 관리", icon: FileEdit },
      { href: "/woo", label: "우국상 관리", icon: BookUser },
      { href: "/internet", label: "인터넷 관리", icon: Wifi },
    ],
  },
  {
    key: "tech",
    label: "기술지원",
    icon: HardHat,
    items: [
      { href: "/installs", label: "설치 관리", icon: Package },
      { href: "/installs/mine", label: "기사 페이지", icon: HardHat },
      { href: "/installs/photos", label: "완료사진", icon: Images },
      { href: "/external-techs", label: "외부 기사 관리", icon: Users },
      { href: "/inventory", label: "재고 실사", icon: ClipboardList },
      { href: "/transfers", label: "전환건", icon: RefreshCw },
      { href: "/blueprints", label: "설계도", icon: Network },
      { href: "/customer-ledger", label: "고객 관리 대장", icon: NotebookText },
    ],
  },
];

export const ADMIN_NAV: NavItem[] = [{ href: "/admin/users", label: "직원 관리", icon: Users }];

export const MASTER_NAV: NavItem[] = [
  { href: "/admin/logs", label: "직원 활동 로그", icon: ClipboardList },
];

export const BOTTOM_NAV: NavItem[] = [
  { href: "/large-franchises", label: "대형 가맹점", icon: Building2 },
];

/** breadcrumb 등에서 쓰는 평탄화된 목록. 폴더 소속 항목은 folderLabel을 함께 갖는다. */
export const ALL_NAV_ENTRIES: { href: string; label: string; folderLabel?: string }[] = [
  ...COMMON_NAV.map((item) => ({ href: item.href, label: item.label })),
  ...ROLE_FOLDERS.flatMap((folder) =>
    folder.items.map((item) => ({
      href: item.href,
      label: item.label,
      folderLabel: folder.label,
    })),
  ),
  ...ADMIN_NAV.map((item) => ({ href: item.href, label: item.label })),
  ...MASTER_NAV.map((item) => ({ href: item.href, label: item.label })),
  ...BOTTOM_NAV.map((item) => ({ href: item.href, label: item.label })),
];
