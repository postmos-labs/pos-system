"use client";

import { useState, useMemo, useCallback } from "react";
import { Plus, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import BulkDeleteActions from "@/components/ui/BulkDeleteActions";
import FormModal from "@/components/ui/FormModal";
import DevRequestDetailDrawer from "./DevRequestDetailDrawer";
import { AppSelect } from "@/components/ui/AppSelect";
import type { Profile } from "@/types";

export type DevRequestStatus = "확인중" | "미승인" | "승인" | "처리완료";

export interface DevRequest {
  id: string;
  title: string;
  content: string | null;
  requester_id: string | null;
  requester_name: string | null;
  status: DevRequestStatus;
  approver_id: string | null;
  approver_name: string | null;
  approved_at: string | null;
  created_at: string;
}

const STATUS_STYLE: Record<DevRequestStatus, string> = {
  확인중: "bg-amber-100 text-amber-700",
  미승인: "bg-red-100 text-red-700",
  승인: "bg-emerald-100 text-emerald-700",
  처리완료: "bg-blue-100 text-blue-700",
};

const STATUS_OPTIONS: DevRequestStatus[] = ["확인중", "미승인", "승인", "처리완료"];

function formatDateTime(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString("ko-KR")} ${date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
}

const EMPTY_FORM = { title: "", content: "" };

interface CreateFormProps {
  onSubmit: (form: typeof EMPTY_FORM) => Promise<void>;
  submitting: boolean;
  onClose: () => void;
}
function CreateForm({ onSubmit, submitting, onClose }: CreateFormProps) {
  const [form, setForm] = useState(EMPTY_FORM);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    await onSubmit(form);
    setForm(EMPTY_FORM);
  }

  return (
    <FormModal title="개발요청 등록" onClose={onClose} maxWidthClassName="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">제목</label>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">내용</label>
          <textarea
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            rows={4}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !form.title.trim()}
          className="self-end text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
        >
          {submitting ? "등록 중..." : "등록"}
        </button>
      </form>
    </FormModal>
  );
}

interface Props {
  rows: DevRequest[];
  profile: Profile;
}

export default function DevRequestsClient({ rows, profile }: Props) {
  const toast = useToast();
  const [localRows, setLocalRows] = useState(rows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DevRequestStatus>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return localRows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (term) {
        const haystack =
          `${row.title} ${row.content ?? ""} ${row.requester_name ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [localRows, search, statusFilter]);

  const allChecked = filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.id));

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (allChecked) {
        const next = new Set(prev);
        filteredRows.forEach((r) => next.delete(r.id));
        return next;
      }
      return new Set([...prev, ...filteredRows.map((r) => r.id)]);
    });
  }, [allChecked, filteredRows]);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleDelete = useCallback(async () => {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}건을 삭제하시겠습니까?`)) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("dev_requests")
      .delete()
      .in("id", [...selected]);
    setDeleting(false);
    if (error) {
      toast.error("삭제 실패: " + error.message);
      return;
    }
    setLocalRows((prev) => prev.filter((r) => !selected.has(r.id)));
    setSelected(new Set());
  }, [selected, toast]);

  const handleCreate = useCallback(
    async (form: typeof EMPTY_FORM) => {
      setSubmitting(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("dev_requests")
        .insert({
          title: form.title,
          content: form.content || null,
          requester_id: profile.id,
          requester_name: profile.name,
          status: "확인중",
        })
        .select()
        .single();
      setSubmitting(false);
      if (error) {
        toast.error("등록 실패: " + error.message);
        return;
      }
      setLocalRows((prev) => [data, ...prev]);
      setShowForm(false);
    },
    [profile, toast],
  );

  const changeStatus = useCallback(
    async (row: DevRequest, status: DevRequestStatus) => {
      const supabase = createClient();
      const patch: Partial<DevRequest> =
        status === "승인" || status === "처리완료"
          ? {
              status,
              approver_id: profile.id,
              approver_name: profile.name,
              approved_at: new Date().toISOString(),
            }
          : { status, approver_id: null, approver_name: null, approved_at: null };
      const { error } = await supabase.from("dev_requests").update(patch).eq("id", row.id);
      if (error) {
        toast.error("수정 실패: " + error.message);
        return;
      }
      setLocalRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...patch } : r)));
    },
    [profile, toast],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="제목, 내용, 요청자..."
            className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <AppSelect
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as "all" | DevRequestStatus)}
          aria-label="상태 필터"
          options={[
            { value: "all", label: "전체" },
            ...STATUS_OPTIONS.map((status) => ({ value: status, label: status })),
          ]}
        />
        {(search || statusFilter !== "all") && (
          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
            }}
            className="text-sm text-slate-400 hover:text-red-500 px-2 py-2 transition-colors"
          >
            초기화
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <div className="text-sm text-slate-500">
            전체 {filteredRows.length.toLocaleString()}건
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={14} />
            등록
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <BulkDeleteActions
          count={selected.size}
          deleting={deleting}
          onDelete={handleDelete}
          onCancel={() => setSelected(new Set())}
        />
      )}

      {showForm && (
        <CreateForm
          onSubmit={handleCreate}
          submitting={submitting}
          onClose={() => setShowForm(false)}
        />
      )}

      <div className="flex-1 overflow-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-3 border-b border-slate-200 w-8">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                />
              </th>
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                제목
              </th>
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200">
                내용
              </th>
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                요청자
              </th>
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                상태
              </th>
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                승인자
              </th>
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                요청일시
              </th>
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                상세
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-slate-100 hover:bg-blue-50 transition-colors"
              >
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggleOne(row.id)}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                </td>
                <td className="px-3 py-3 font-medium text-slate-900 whitespace-nowrap min-w-[140px]">
                  {row.title}
                </td>
                <td className="px-3 py-3 text-slate-700 min-w-[280px] whitespace-pre-wrap">
                  {row.content}
                </td>
                <td className="px-3 py-3 text-slate-700 whitespace-nowrap">{row.requester_name}</td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <AppSelect
                    value={row.status}
                    onValueChange={(value) => changeStatus(row, value as DevRequestStatus)}
                    aria-label="개발요청 상태"
                    className={`h-auto rounded-full border-0 px-2 py-1 ${STATUS_STYLE[row.status]}`}
                    options={STATUS_OPTIONS.map((status) => ({ value: status, label: status }))}
                  />
                </td>
                <td className="px-3 py-3 text-slate-700 whitespace-nowrap">
                  {row.approver_name ?? "-"}
                </td>
                <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                  {formatDateTime(row.created_at)}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <button
                    onClick={() => setExpandedId(row.id)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    상세보기
                  </button>
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-slate-400 py-10">
                  데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {expandedId &&
        (() => {
          const row = localRows.find((r) => r.id === expandedId);
          if (!row) return null;
          return (
            <DevRequestDetailDrawer
              key={row.id}
              row={row}
              onClose={() => setExpandedId(null)}
              onStatusChange={(status) => changeStatus(row, status)}
            />
          );
        })()}
    </div>
  );
}
