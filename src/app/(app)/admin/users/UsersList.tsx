"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ROLE_LABEL_KR } from "./constants";
import DeletePermissionToggle from "./DeletePermissionToggle";
import DeleteUserButton from "./DeleteUserButton";
import RoleSelect from "./RoleSelect";
import NameEdit from "./NameEdit";
import ApprovalRoleSelect from "./ApprovalRoleSelect";
import TeamSelect from "./TeamSelect";
import PositionSelect from "./PositionSelect";

const ROLE_COLOR: Record<string, string> = {
  master: "bg-red-100 text-red-700",
  admin: "bg-purple-100 text-purple-700",
  sales: "bg-blue-100 text-blue-700",
  cs: "bg-emerald-100 text-emerald-700",
  tech: "bg-orange-100 text-orange-700",
  developer: "bg-cyan-100 text-cyan-700",
  기타: "bg-slate-100 text-slate-600",
};

const ROLE_ORDER = ["master", "admin", "sales", "cs", "tech", "developer", "기타"];

interface UserRow {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  team?: string | null;
  position?: string | null;
  approval_role?: string | null;
  can_delete?: boolean | null;
  email: string | null;
  [key: string]: unknown;
}

interface Props {
  users: UserRow[];
  currentUserId: string;
  currentUserRole: string;
  positionReady?: boolean;
}

export default function UsersList({
  users,
  currentUserId,
  currentUserRole,
  positionReady = true,
}: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || (u.phone ?? "").toLowerCase().includes(q),
    );
  }, [query, users]);

  const grouped: Record<string, UserRow[]> = {};
  filtered.forEach((u) => {
    const key = ROLE_LABEL_KR[u.role] ? u.role : "기타";
    if (!grouped[key]) grouped[key] = [];
    grouped[key]!.push(u);
  });

  return (
    <>
      <div className="mb-4 relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름 또는 연락처로 검색"
          className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="space-y-6">
        {ROLE_ORDER.map((role) => {
          const members = grouped[role];
          if (!members?.length) return null;
          const roleName = role === "기타" ? "기타" : ROLE_LABEL_KR[role];
          return (
            <div
              key={role}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            >
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-bold text-slate-900">{roleName}</h2>
                <span className="text-sm text-slate-400">{members.length}명</span>
              </div>
              <div className="divide-y divide-slate-50">
                {members.map((u) => (
                  <div key={u.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 flex-shrink-0">
                      {u.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap">
                        {currentUserRole === "master" ? (
                          <NameEdit userId={u.id} initialName={u.name} />
                        ) : (
                          <span className="font-semibold text-slate-900 text-sm">{u.name}</span>
                        )}
                        {u.email && (
                          <span
                            className="font-normal text-slate-400 text-sm ml-1.5 truncate"
                            title={u.email}
                          >
                            {u.email}
                          </span>
                        )}
                      </div>
                      {u.phone && <p className="text-xs text-slate-400 mt-0.5">{u.phone}</p>}
                    </div>
                    {u.id !== currentUserId ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <RoleSelect userId={u.id} initialRole={u.role} />
                        <TeamSelect userId={u.id} initialTeam={u.team ?? defaultTeam(u.role)} />
                        {positionReady && (
                          <PositionSelect userId={u.id} position={u.position ?? ""} />
                        )}
                        <ApprovalRoleSelect userId={u.id} initialRole={u.approval_role ?? null} />
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span
                          className={`text-xs px-2.5 py-1 rounded-full font-semibold ${ROLE_COLOR[u.role] ?? ROLE_COLOR["기타"]}`}
                        >
                          {roleName}
                        </span>
                        <TeamSelect userId={u.id} initialTeam={u.team ?? defaultTeam(u.role)} />
                        {positionReady && (
                          <PositionSelect userId={u.id} position={u.position ?? ""} />
                        )}
                        <ApprovalRoleSelect userId={u.id} initialRole={u.approval_role ?? null} />
                      </div>
                    )}
                    {u.role !== "admin" && u.role !== "master" && (
                      <DeletePermissionToggle userId={u.id} initialCanDelete={!!u.can_delete} />
                    )}
                    {u.id !== currentUserId && <DeleteUserButton userId={u.id} userName={u.name} />}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-8">검색 결과가 없습니다.</p>
        )}
      </div>
    </>
  );
}

function defaultTeam(role: string) {
  if (role === "cs" || role === "tech" || role === "sales") return role;
  return "dev";
}
