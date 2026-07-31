"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import LogoMark from "./LogoMark";
import {
  ADMIN_NAV,
  BOTTOM_NAV,
  COMMON_NAV,
  MASTER_NAV,
  ROLE_FOLDERS,
  isNavItemActive,
  type NavItem,
} from "./navItems";
import type { Profile, Role } from "@/types";

interface Props {
  profile: Profile;
}

export default function Sidebar({ profile }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const storageKey = `sidebar_open_folders_${profile.id}`;

  const [openFolders, setOpenFolders] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return new Set(JSON.parse(saved) as string[]);
    } catch {}

    return new Set(
      ROLE_FOLDERS.filter(
        (folder) =>
          folder.key === profile.role || profile.role === "admin" || profile.role === "master",
      ).map((folder) => folder.key),
    );
  });

  const [activeFolderHint, setActiveFolderHint] = useState<Role | null>(null);

  function toggleFolder(key: string) {
    setOpenFolders((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }

  function foldersContaining(href: string) {
    return ROLE_FOLDERS.filter((folder) => folder.items.some((item) => item.href === href)).map(
      (folder) => folder.key,
    );
  }

  function isHighlighted(href: string, folderKey?: Role) {
    if (!isNavItemActive(pathname, href)) return false;
    if (!folderKey) return true;

    const owners = foldersContaining(href);
    if (owners.length <= 1) return true;
    const winner =
      activeFolderHint && owners.includes(activeFolderHint)
        ? activeFolderHint
        : owners.includes(profile.role)
          ? profile.role
          : owners[0];
    return winner === folderKey;
  }

  function NavLink({ item, folderKey }: { item: NavItem; folderKey?: Role }) {
    const active = isHighlighted(item.href, folderKey);

    return (
      <Link
        href={item.href}
        onClick={() => {
          if (folderKey) setActiveFolderHint(folderKey);
        }}
        title={collapsed ? item.label : undefined}
        className={[
          "relative flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors",
          collapsed ? "justify-center" : "",
          active
            ? "bg-blue-50 font-semibold text-blue-700"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
        ].join(" ")}
      >
        <item.icon className="size-[18px] shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  }

  return (
    <aside
      className={[
        "flex h-dvh shrink-0 flex-col border-r border-slate-200 bg-white shadow-[1px_0_3px_rgb(15_23_42/0.04)] transition-[width] duration-150",
        collapsed ? "w-[70px]" : "w-[244px]",
      ].join(" ")}
    >
      <div
        className={[
          "flex h-[58px] shrink-0 items-center gap-2 border-b border-slate-100 px-4",
          collapsed ? "justify-center" : "justify-between",
        ].join(" ")}
      >
        <Link href="/dashboard" aria-label="POSMOS 홈" className="flex min-w-0 items-center gap-2">
          <LogoMark className="size-7 shrink-0" />
          {!collapsed && (
            <span className="truncate text-base font-bold tracking-tight text-slate-900">
              POSMOS
            </span>
          )}
        </Link>
        {!collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="메뉴 접기"
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <ChevronLeft className="size-4" />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="메뉴 펼치기"
          className="flex h-9 shrink-0 items-center justify-center border-b border-slate-100 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <ChevronRight className="size-4" />
        </button>
      )}

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {COMMON_NAV.filter((item) => {
          if (profile.role === "developer" && item.href === "/kpi") return false;
          if (item.href === "/approval-logs") {
            return (
              profile.role === "admin" ||
              profile.role === "master" ||
              ["cs_responsible", "tech_responsible", "team_lead"].includes(
                profile.approval_role ?? "",
              )
            );
          }
          return true;
        }).map((item) => (
          <NavLink key={item.href} item={item} />
        ))}

        {ROLE_FOLDERS.map((folder, index) => {
          const open = collapsed || openFolders.has(folder.key);
          return (
            <div
              key={folder.key}
              className={["mb-1", index === 0 ? "mt-1 border-t border-slate-200 pt-1" : ""].join(
                " ",
              )}
            >
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggleFolder(folder.key)}
                  className="flex w-full items-center gap-2 px-2.5 pb-1.5 pt-1.5 text-[11px] font-semibold tracking-wide text-slate-400 hover:text-slate-700"
                >
                  <span>{folder.label}</span>
                  <ChevronDown
                    className={[
                      "ml-auto size-3.5 transition-transform",
                      open ? "rotate-180" : "",
                    ].join(" ")}
                  />
                </button>
              )}
              {open && (
                <div className="flex flex-col gap-1">
                  {folder.items.map((item) => (
                    <NavLink key={item.href} item={item} folderKey={folder.key} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="mt-1 border-t border-slate-200 pt-1">
          {BOTTOM_NAV.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
          {(profile.role === "admin" || profile.role === "master") &&
            ADMIN_NAV.map((item) => <NavLink key={item.href} item={item} />)}
          {profile.role === "master" &&
            MASTER_NAV.map((item) => <NavLink key={item.href} item={item} />)}
        </div>
      </nav>
    </aside>
  );
}
