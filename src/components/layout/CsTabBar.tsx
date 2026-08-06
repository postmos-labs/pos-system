"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const CS_TABS = [
  { href: "/dashboard", label: "CS 대시보드" },
  { href: "/franchise", label: "가맹 접수" },
  { href: "/woo", label: "우국상 관리" },
  { href: "/changes", label: "변경 관리" },
  { href: "/internet", label: "인터넷 관리" },
  { href: "/paper-orders", label: "용지 요청" },
] as const;

function isTabActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function CsTabBar() {
  const pathname = usePathname();

  if (!CS_TABS.some((tab) => isTabActive(pathname, tab.href))) return null;

  return (
    <div className="overflow-x-auto border-b border-slate-200 bg-white">
      <nav aria-label="CS 업무" className="flex min-w-max px-4 md:px-6">
        {CS_TABS.map((tab) => {
          const active = isTabActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${active ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:border-slate-300 hover:text-slate-700"}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
