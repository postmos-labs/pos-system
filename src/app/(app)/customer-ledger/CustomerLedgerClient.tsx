"use client";

import { useState, useMemo, useCallback, Fragment, memo } from "react";
import { Plus, Search, ChevronDown, ChevronUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPhone } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import FormModal from "@/components/ui/FormModal";
import type { CustomerLedger, Profile } from "@/types";
import { DatePickerField } from "@/components/ui/DatePickerField";

function today() {
  return new Date().toLocaleDateString("sv-SE");
}

const EMPTY_FORM = { record_date: today(), business_name: "", phone: "", issue: "", solution: "" };

interface CreateFormProps {
  onSubmit: (form: typeof EMPTY_FORM) => Promise<void>;
  submitting: boolean;
  onClose: () => void;
}
function CreateForm({ onSubmit, submitting, onClose }: CreateFormProps) {
  const [form, setForm] = useState(EMPTY_FORM);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.business_name.trim()) return;
    await onSubmit(form);
    setForm(EMPTY_FORM);
  }

  return (
    <FormModal title="고객 관리 대장 등록" onClose={onClose} maxWidthClassName="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">날짜</label>
          <DatePickerField
            value={form.record_date}
            onChange={(value) => setForm({ ...form, record_date: value })}
            ariaLabel="날짜"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">상호명</label>
          <input
            value={form.business_name}
            onChange={(e) => setForm({ ...form, business_name: e.target.value })}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">연락처</label>
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">문제상황</label>
          <textarea
            value={form.issue}
            onChange={(e) => setForm({ ...form, issue: e.target.value })}
            rows={3}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">해결방안</label>
          <textarea
            value={form.solution}
            onChange={(e) => setForm({ ...form, solution: e.target.value })}
            rows={3}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !form.business_name.trim()}
          className="self-end text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
        >
          {submitting ? "등록 중..." : "등록"}
        </button>
      </form>
    </FormModal>
  );
}

interface EditableFieldProps {
  row: CustomerLedger;
  field: keyof CustomerLedger;
  onSave: (row: CustomerLedger, field: keyof CustomerLedger, value: string) => void;
  type?: "text" | "date" | "textarea";
  format?: (raw: string) => string;
  required?: boolean;
}
const EditableField = memo(function EditableField({
  row,
  field,
  onSave,
  type = "text",
  format,
  required,
}: EditableFieldProps) {
  const initial = (row[field] as string) ?? "";
  const [value, setValue] = useState(initial);

  function commit() {
    const trimmed = value.trim();
    if (required && !trimmed) {
      setValue(initial);
      return;
    }
    if (value !== initial) onSave(row, field, value);
  }

  if (type === "textarea") {
    return (
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        rows={3}
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white"
      />
    );
  }

  if (type === "date") {
    return (
      <DatePickerField
        value={value}
        onChange={(next) => {
          setValue(next);
          if (next !== initial) onSave(row, field, next);
        }}
        ariaLabel="날짜"
        className="w-full"
      />
    );
  }

  return (
    <input
      type={type}
      value={value}
      onChange={(e) => setValue(format ? format(e.target.value) : e.target.value)}
      onBlur={commit}
      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
    />
  );
});

interface Props {
  rows: CustomerLedger[];
  profile: Profile;
}

export default function CustomerLedgerClient({ rows, profile }: Props) {
  const toast = useToast();
  const [localRows, setLocalRows] = useState(rows);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return localRows;
    return localRows.filter((row) => {
      const haystack =
        `${row.business_name} ${row.phone ?? ""} ${row.manager_name ?? ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [localRows, search]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleCreate = useCallback(
    async (form: typeof EMPTY_FORM) => {
      setSubmitting(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("customer_ledger")
        .insert({
          record_date: form.record_date,
          business_name: form.business_name,
          phone: form.phone || null,
          issue: form.issue || null,
          solution: form.solution || null,
          manager_id: profile.id,
          manager_name: profile.name,
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

  const saveField = useCallback(
    async (row: CustomerLedger, field: keyof CustomerLedger, value: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("customer_ledger")
        .update({ [field]: value || null })
        .eq("id", row.id);
      if (error) {
        toast.error("수정 실패: " + error.message);
        return;
      }
      setLocalRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, [field]: value || null } : r)),
      );
    },
    [toast],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="상호명, 연락처, 담당자..."
            className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {search && (
          <button
            onClick={() => setSearch("")}
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
              <th className="px-3 py-3 border-b border-slate-200 w-8" />
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                날짜
              </th>
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                상호명
              </th>
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                연락처
              </th>
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                담당자
              </th>
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200">
                문제상황
              </th>
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200">
                해결방안
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <Fragment key={row.id}>
                <tr
                  className="border-b border-slate-100 hover:bg-blue-50 transition-colors cursor-pointer"
                  onClick={() => toggleExpand(row.id)}
                >
                  <td className="px-3 py-3 text-slate-500">
                    {expandedId === row.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </td>
                  <td className="px-3 py-3 text-slate-700 whitespace-nowrap">{row.record_date}</td>
                  <td className="px-3 py-3 font-medium text-slate-900 whitespace-nowrap min-w-[140px]">
                    {row.business_name}
                  </td>
                  <td className="px-3 py-3 text-slate-700 whitespace-nowrap">{row.phone ?? "-"}</td>
                  <td className="px-3 py-3 text-slate-700 whitespace-nowrap">
                    {row.manager_name ?? "-"}
                  </td>
                  <td className="px-3 py-3 text-slate-700 max-w-[220px] truncate">
                    {row.issue ?? "-"}
                  </td>
                  <td className="px-3 py-3 text-slate-700 max-w-[220px] truncate">
                    {row.solution ?? "-"}
                  </td>
                </tr>
                {expandedId === row.id && (
                  <tr
                    className="bg-blue-50/50 border-b border-slate-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <td colSpan={7} className="px-6 py-4">
                      <div className="grid grid-cols-4 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-slate-400">날짜</label>
                          <EditableField
                            row={row}
                            field="record_date"
                            type="date"
                            required
                            onSave={saveField}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-400">상호명</label>
                          <EditableField
                            row={row}
                            field="business_name"
                            required
                            onSave={saveField}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-400">연락처</label>
                          <EditableField
                            row={row}
                            field="phone"
                            format={formatPhone}
                            onSave={saveField}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-400">담당자</label>
                          <EditableField row={row} field="manager_name" onSave={saveField} />
                        </div>
                        <div className="col-span-4">
                          <label className="text-xs font-semibold text-slate-400">문제상황</label>
                          <EditableField
                            row={row}
                            field="issue"
                            type="textarea"
                            onSave={saveField}
                          />
                        </div>
                        <div className="col-span-4">
                          <label className="text-xs font-semibold text-slate-400">해결방안</label>
                          <EditableField
                            row={row}
                            field="solution"
                            type="textarea"
                            onSave={saveField}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-slate-400 py-10">
                  데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
