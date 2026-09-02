"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import FormModal from "@/components/ui/FormModal";
import { useToast } from "@/components/ui/Toast";
import type { Profile } from "@/types";
import ChatbotDataDetailDrawer from "./ChatbotDataDetailDrawer";
import ChatbotExportImport from "./ChatbotExportImport";

export interface ChatbotDataRow {
  id: string;
  problem_situation: string;
  solution: string;
  registered_by: string;
  registrant_name: string;
  company_name: string | null;
  phone: string | null;
  // 인입내역에서 정제해 들어온 건이면 출처 티켓 id (138번 마이그레이션 이후)
  source_ticket_ids?: string[] | null;
  created_at: string;
  updated_at: string;
}

interface ChatbotDataFormValue {
  problemSituation: string;
  solution: string;
  companyName: string;
  phone: string;
}

const EMPTY_FORM: ChatbotDataFormValue = {
  problemSituation: "",
  solution: "",
  companyName: "",
  phone: "",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString("ko-KR")} ${date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

interface CreateFormProps {
  registrantName: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (value: ChatbotDataFormValue) => Promise<void>;
}

function CreateForm({ registrantName, submitting, onClose, onSubmit }: CreateFormProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const canSubmit = form.problemSituation.trim() && form.solution.trim();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    await onSubmit(form);
  }

  return (
    <FormModal title="챗봇 데이터 등록" onClose={onClose} maxWidthClassName="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="rounded-lg bg-slate-50 px-3 py-2.5">
          <div className="text-xs text-slate-500">등록자</div>
          <div className="mt-0.5 text-sm font-semibold text-slate-800">{registrantName}</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-500">
            상호명
            <input
              value={form.companyName}
              onChange={(event) => setForm({ ...form, companyName: event.target.value })}
              placeholder="선택 입력"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-500">
            연락처
            <input
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              placeholder="선택 입력"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-500">
          문제상황
          <textarea
            autoFocus
            required
            rows={6}
            value={form.problemSituation}
            onChange={(event) => setForm({ ...form, problemSituation: event.target.value })}
            placeholder="고객이 겪은 문제와 발생 상황을 구체적으로 입력해 주세요."
            className="resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-500">
          해결방법
          <textarea
            required
            rows={8}
            value={form.solution}
            onChange={(event) => setForm({ ...form, solution: event.target.value })}
            placeholder="확인 순서와 해결 방법을 입력해 주세요."
            className="resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={submitting || !canSubmit}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "등록 중..." : "등록"}
          </button>
        </div>
      </form>
    </FormModal>
  );
}

interface Props {
  rows: ChatbotDataRow[];
  profile: Profile;
}

export default function ChatbotDataClient({ rows, profile }: Props) {
  const toast = useToast();
  const [localRows, setLocalRows] = useState(rows);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return localRows;
    return localRows.filter((row) =>
      `${row.problem_situation} ${row.solution} ${row.registrant_name} ${row.company_name ?? ""} ${row.phone ?? ""}`
        .toLowerCase()
        .includes(term),
    );
  }, [localRows, search]);

  const selectedRow = localRows.find((row) => row.id === selectedId) ?? null;

  async function handleCreate(value: ChatbotDataFormValue) {
    setSubmitting(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("chatbot_training_data")
      .insert({
        problem_situation: value.problemSituation.trim(),
        solution: value.solution.trim(),
        company_name: value.companyName.trim() || null,
        phone: value.phone.trim() || null,
      })
      .select()
      .single();
    setSubmitting(false);

    if (error) {
      toast.error(`등록 실패: ${error.message}`);
      return;
    }

    setLocalRows((previous) => [data as ChatbotDataRow, ...previous]);
    setShowForm(false);
    toast.success("챗봇 데이터가 등록되었습니다.");
  }

  async function handleUpdate(
    row: ChatbotDataRow,
    value: Pick<ChatbotDataRow, "problem_situation" | "solution" | "company_name" | "phone">,
  ) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("chatbot_training_data")
      .update(value)
      .eq("id", row.id)
      .select()
      .single();

    if (error) {
      toast.error(`수정 실패: ${error.message}`);
      return false;
    }

    setLocalRows((previous) =>
      previous.map((item) => (item.id === row.id ? (data as ChatbotDataRow) : item)),
    );
    toast.success("챗봇 데이터가 수정되었습니다.");
    return true;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="문제상황, 해결방법, 등록자..."
            className="w-72 rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="mr-1 text-sm text-slate-500">
            전체 {filteredRows.length.toLocaleString()}건
          </div>
          <ChatbotExportImport
            onImported={(imported) => setLocalRows((previous) => [...imported, ...previous])}
          />
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <Plus size={14} />
            등록
          </button>
        </div>
      </div>

      {showForm && (
        <CreateForm
          registrantName={profile.name}
          submitting={submitting}
          onClose={() => setShowForm(false)}
          onSubmit={handleCreate}
        />
      )}

      <div className="flex-1 overflow-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="w-[26%] border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                문제상황
              </th>
              <th className="w-[30%] border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                해결방법
              </th>
              <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700 whitespace-nowrap">
                상호명
              </th>
              <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700 whitespace-nowrap">
                연락처
              </th>
              <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700 whitespace-nowrap">
                등록자
              </th>
              <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700 whitespace-nowrap">
                등록일
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-slate-100 transition-colors hover:bg-blue-50"
              >
                <td className="max-w-0 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className="block w-full truncate text-left font-medium text-slate-900 hover:text-blue-700"
                  >
                    {row.problem_situation}
                  </button>
                </td>
                <td className="max-w-0 px-4 py-3 text-slate-600">
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className="block w-full truncate text-left hover:text-blue-700"
                  >
                    {row.solution}
                  </button>
                </td>
                <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                  {row.company_name ?? "-"}
                </td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{row.phone ?? "-"}</td>
                <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                  {row.registrant_name}
                </td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {formatDateTime(row.created_at)}
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  등록된 챗봇 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedRow && (
        <ChatbotDataDetailDrawer
          key={selectedRow.id}
          row={selectedRow}
          onClose={() => setSelectedId(null)}
          onSave={(value) => handleUpdate(selectedRow, value)}
        />
      )}
    </div>
  );
}
