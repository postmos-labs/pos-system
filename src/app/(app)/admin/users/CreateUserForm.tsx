"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserPlus } from "lucide-react";
import { createUserAccount } from "./actions";
import { ROLE_LABEL_KR, TEAM_LABEL_KR, TEAMS } from "./constants";
import { useToast } from "@/components/ui/Toast";
import { AppSelect } from "@/components/ui/AppSelect";

const ROLES = ["sales", "cs", "tech", "developer", "admin", "master"];

const EMPTY_FORM = { name: "", phone: "", password: "", role: "sales", team: "sales" };

export default function CreateUserForm() {
  const router = useRouter();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await createUserAccount(form);
    setSubmitting(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`"${form.name}" 계정이 생성되었습니다.`);
    setForm(EMPTY_FORM);
    setShowForm(false);
    router.refresh();
  }

  return (
    <div className="mb-6">
      <button
        onClick={() => setShowForm((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
      >
        <Plus size={14} />
        계정 생성
      </button>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-3 bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-3 items-end"
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">이름</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              placeholder="홍길동"
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">연락처</label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="010-0000-0000"
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">비밀번호</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              placeholder="4자 이상"
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">권한</label>
            <AppSelect
              value={form.role}
              onValueChange={(value) => setForm({ ...form, role: value })}
              aria-label="권한"
              className="w-28"
              options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL_KR[r] }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">소속 팀</label>
            <AppSelect
              value={form.team}
              onValueChange={(value) => setForm({ ...form, team: value })}
              aria-label="소속 팀"
              className="w-32"
              options={TEAMS.map((team) => ({ value: team, label: TEAM_LABEL_KR[team] }))}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
          >
            <UserPlus size={14} />
            {submitting ? "생성 중..." : "생성"}
          </button>
        </form>
      )}
    </div>
  );
}
