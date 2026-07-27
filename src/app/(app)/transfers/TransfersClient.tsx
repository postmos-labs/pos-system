"use client";

import {
  useState,
  useTransition,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  memo,
  Fragment,
} from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, ChevronDown, ChevronUp, Calendar, GripVertical } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPhone, formatDateText } from "@/lib/format";
import { useColumnWidths } from "@/hooks/useColumnWidths";
import { mergeRowsPreservingIdentity } from "@/lib/mergeRows";
import { deleteFranchiseRows } from "../franchise/actions";
import type {
  FranchiseApplication,
  FranchiseApplicationLog,
  FranchiseStatus,
  Profile,
} from "@/types";
import { FRANCHISE_STATUS_LABEL, FRANCHISE_STATUS_COLOR } from "@/types";
import { useToast } from "@/components/ui/Toast";
import BulkDeleteActions from "@/components/ui/BulkDeleteActions";
import FormModal from "@/components/ui/FormModal";
import HistoryButton from "@/components/ui/HistoryButton";
import MemoHistoryPanel from "@/components/ui/MemoHistoryPanel";
import {
  docCaseOf,
  buildFranchiseStatusPatch,
  applyFranchiseStatusSideEffects,
  franchiseStatusChangeConfirm,
} from "@/lib/franchiseStatusEffects";

interface Props {
  rows: FranchiseApplication[];
  techProfiles: Pick<Profile, "id" | "name" | "role">[];
  currentUserId: string;
  linkedInstalls?: Record<string, { id: string; status: string }>;
}

const PROGRAMS = ["유니온", "아임유", "토스", "플릭"];

const EMPTY_FORM = {
  owner_name: "",
  business_name: "",
  phone: "",
  program: "",
  status: "doc_waiting" as FranchiseStatus,
  tech_id: "",
  equipment: "",
  memo: "",
  open_date: "",
  install_date: "",
};

const MAIN_FIELDS = [
  "owner_name",
  "business_name",
  "phone",
  "program",
  "status",
  "tech_id",
] as const;
const MAIN_LABELS: Record<(typeof MAIN_FIELDS)[number], string> = {
  owner_name: "고객명",
  business_name: "상호",
  phone: "전화번호",
  program: "프로그램",
  status: "상태",
  tech_id: "담당자",
};
const DEFAULT_WIDTHS: Partial<Record<(typeof MAIN_FIELDS)[number], number>> = {
  owner_name: 100,
  business_name: 140,
  phone: 130,
  program: 100,
  status: 110,
  tech_id: 100,
};
const COL_WIDTHS_STORAGE_KEY = "transfers_col_widths";
const PAGE_SIZE = 50;

interface EditableTextProps {
  row: FranchiseApplication;
  field: keyof FranchiseApplication;
  onSave: (row: FranchiseApplication, field: keyof FranchiseApplication, value: string) => void;
  type?: string;
}
const EditableText = memo(function EditableText({
  row,
  field,
  onSave,
  type = "text",
}: EditableTextProps) {
  const [value, setValue] = useState((row[field] as string) ?? "");
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== ((row[field] as string) ?? "")) onSave(row, field, value);
      }}
      onClick={(e) => e.stopPropagation()}
      className="w-full bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 -mx-1 text-sm"
    />
  );
});

interface DateFieldProps {
  row: FranchiseApplication;
  field: keyof FranchiseApplication;
  onSave: (row: FranchiseApplication, field: keyof FranchiseApplication, value: string) => void;
}
const DateField = memo(function DateField({ row, field, onSave }: DateFieldProps) {
  const [value, setValue] = useState((row[field] as string) ?? "");
  const dateInputRef = useRef<HTMLInputElement>(null);
  const isoValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";

  function openPicker(e: React.MouseEvent) {
    e.stopPropagation();
    const el = dateInputRef.current;
    if (!el) return;
    const withPicker = el as HTMLInputElement & { showPicker?: () => void };
    if (typeof withPicker.showPicker === "function") withPicker.showPicker();
    else el.focus();
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setValue(next);
    onSave(row, field, next);
  }

  return (
    <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
      <input
        value={value}
        onChange={(e) => setValue(formatDateText(e.target.value))}
        onBlur={() => {
          if (value !== ((row[field] as string) ?? "")) onSave(row, field, value);
        }}
        placeholder="-"
        className="w-full bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 -mx-1 text-sm"
      />
      <button
        type="button"
        onClick={openPicker}
        tabIndex={-1}
        className="shrink-0 text-slate-400 hover:text-blue-500"
      >
        <Calendar size={14} />
      </button>
      <input
        ref={dateInputRef}
        type="date"
        value={isoValue}
        onChange={handlePick}
        tabIndex={-1}
        className="w-0 h-0 opacity-0 absolute pointer-events-none"
      />
    </div>
  );
});

interface DateFormFieldProps {
  value: string;
  onChange: (value: string) => void;
}
const DateFormField = memo(function DateFormField({ value, onChange }: DateFormFieldProps) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const isoValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";

  function openPicker() {
    const el = dateInputRef.current;
    if (!el) return;
    const withPicker = el as HTMLInputElement & { showPicker?: () => void };
    if (typeof withPicker.showPicker === "function") withPicker.showPicker();
    else el.focus();
  }

  return (
    <div className="flex items-center gap-1">
      <input
        value={value}
        onChange={(e) => onChange(formatDateText(e.target.value))}
        className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="button"
        onClick={openPicker}
        className="shrink-0 text-slate-400 hover:text-blue-500"
      >
        <Calendar size={14} />
      </button>
      <input
        ref={dateInputRef}
        type="date"
        value={isoValue}
        onChange={(e) => onChange(e.target.value)}
        className="w-0 h-0 opacity-0 absolute pointer-events-none"
      />
    </div>
  );
});

interface CreateFormProps {
  techProfiles: Pick<Profile, "id" | "name" | "role">[];
  onSubmit: (form: typeof EMPTY_FORM) => Promise<void>;
  submitting: boolean;
  onClose: () => void;
}
const CreateForm = memo(function CreateForm({
  techProfiles,
  onSubmit,
  submitting,
  onClose,
}: CreateFormProps) {
  const [form, setForm] = useState(EMPTY_FORM);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit(form);
    setForm(EMPTY_FORM);
  }

  return (
    <FormModal title="정보 입력" onClose={onClose} maxWidthClassName="max-w-3xl">
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">고객명</label>
          <input
            value={form.owner_name}
            onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">상호</label>
          <input
            value={form.business_name}
            onChange={(e) => setForm({ ...form, business_name: e.target.value })}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">전화번호</label>
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })}
            placeholder="010-0000-0000"
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">프로그램</label>
          <select
            value={form.program}
            onChange={(e) => setForm({ ...form, program: e.target.value })}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">선택 안함</option>
            {PROGRAMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">상태</label>
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as FranchiseStatus })}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {(Object.keys(FRANCHISE_STATUS_LABEL) as FranchiseStatus[]).map((s) => (
              <option key={s} value={s}>
                {FRANCHISE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">담당자</label>
          <select
            value={form.tech_id}
            onChange={(e) => setForm({ ...form, tech_id: e.target.value })}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">미배정</option>
            {techProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
          <label className="text-xs font-medium text-slate-500">장비목록</label>
          <input
            value={form.equipment}
            onChange={(e) => setForm({ ...form, equipment: e.target.value })}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">오픈일</label>
          <input
            type="date"
            value={form.open_date}
            onChange={(e) => setForm({ ...form, open_date: e.target.value })}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">설치 및 발송일</label>
          <input
            type="date"
            value={form.install_date}
            onChange={(e) => setForm({ ...form, install_date: e.target.value })}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
          <label className="text-xs font-medium text-slate-500">비고</label>
          <input
            value={form.memo}
            onChange={(e) => setForm({ ...form, memo: e.target.value })}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
        >
          {submitting ? "등록 중..." : "등록"}
        </button>
      </form>
    </FormModal>
  );
});

export default function TransfersClient({
  rows,
  techProfiles,
  currentUserId,
  linkedInstalls = {},
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [localRows, setLocalRows] = useState(rows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [logsByRow, setLogsByRow] = useState<Record<string, FranchiseApplicationLog[]>>({});
  const [manualSort, setManualSort] = useState(false);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [rowDragId, setRowDragId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const { colWidths, startResize } = useColumnWidths(
    COL_WIDTHS_STORAGE_KEY,
    DEFAULT_WIDTHS as Record<string, number>,
  );
  const [localLinkedInstalls, setLocalLinkedInstalls] =
    useState<Record<string, { id: string; status: string }>>(linkedInstalls);

  useEffect(() => {
    setLocalRows((prev) => mergeRowsPreservingIdentity(prev, rows));
    setSelected(new Set());
  }, [rows]);

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("transfers-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "franchise_applications" },
        () => {
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => startTransition(() => router.refresh()), 400);
        },
      )
      .subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [router]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = localRows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (term) {
        const haystack =
          `${row.business_name ?? ""} ${row.owner_name ?? ""} ${row.phone ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
    if (!manualSort) return filtered;
    return [...filtered].sort(
      (a, b) =>
        (b.sort_order ?? new Date(b.updated_at).getTime()) -
        (a.sort_order ?? new Date(a.updated_at).getTime()),
    );
  }, [localRows, search, statusFilter, manualSort]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const canReorder = manualSort && !search.trim() && !statusFilter;

  const reorderRows = useCallback(
    (dragId: string, dropId: string) => {
      if (dragId === dropId) return;
      const from = localRows.findIndex((r) => r.id === dragId);
      const to = localRows.findIndex((r) => r.id === dropId);
      if (from === -1 || to === -1) return;
      const next = [...localRows];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setLocalRows(next);
      const n = next.length;
      const supabase = createClient();
      Promise.all(
        next.map((r, i) =>
          supabase
            .from("franchise_applications")
            .update({ sort_order: (n - i) * 1000 })
            .eq("id", r.id),
        ),
      ).catch(() => toast.error("순서 저장에 실패했습니다."));
    },
    [localRows, toast],
  );

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

  const toggleExpand = useCallback(
    async (row: FranchiseApplication) => {
      const next = expandedId === row.id ? null : row.id;
      setExpandedId(next);
      if (next && !logsByRow[row.id]) {
        const supabase = createClient();
        const { data } = await supabase
          .from("franchise_application_logs")
          .select("*, user:profiles(name)")
          .eq("franchise_application_id", row.id)
          .order("created_at", { ascending: false });
        setLogsByRow((prev) => ({ ...prev, [row.id]: data ?? [] }));
      }
    },
    [expandedId, logsByRow],
  );

  const handleDelete = useCallback(async () => {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}건을 삭제하시겠습니까?`)) return;
    setDeleting(true);
    const { error } = await deleteFranchiseRows([...selected]);
    setDeleting(false);
    if (error) {
      toast.error("삭제 실패: " + error);
      return;
    }
    setLocalRows((prev) => prev.filter((r) => !selected.has(r.id)));
    setSelected(new Set());
  }, [selected]);

  const handleCreate = useCallback(
    async (form: typeof EMPTY_FORM) => {
      setSubmitting(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("franchise_applications")
        .insert({
          owner_name: form.owner_name || null,
          business_name: form.business_name || null,
          phone: form.phone ? formatPhone(form.phone) : null,
          program: form.program || null,
          status: form.status,
          tech_id: form.tech_id || null,
          equipment: form.equipment || null,
          memo: form.memo || null,
          open_date: form.open_date ? formatDateText(form.open_date) : null,
          install_date: form.install_date ? formatDateText(form.install_date) : null,
          reception_channel_legacy: "전환",
          created_by: currentUserId,
        })
        .select()
        .single();
      setSubmitting(false);
      if (error) {
        toast.error("등록 실패: " + error.message);
        return;
      }
      setShowForm(false);
      setLocalRows((prev) => [data, ...prev]);
    },
    [currentUserId, toast],
  );

  const saveField = useCallback(
    async (
      row: FranchiseApplication,
      field: keyof FranchiseApplication,
      value: string,
      raw?: boolean,
    ) => {
      const supabase = createClient();
      let saveValue: string | null = value || null;
      if (field === "memo" && value && !raw) {
        const currentUserName = techProfiles.find((p) => p.id === currentUserId)?.name ?? "사용자";
        const stamp = `[${currentUserName} ${new Date().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}]`;
        const prev = (row.memo ?? "").trim();
        saveValue = prev ? `${prev}\n${stamp} ${value}` : `${stamp} ${value}`;
      }
      const { error } = await supabase
        .from("franchise_applications")
        .update({ [field]: saveValue })
        .eq("id", row.id);
      if (error) {
        toast.error("수정 실패: " + error.message);
        return;
      }
      setLocalRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, [field]: saveValue ?? undefined, updated_at: new Date().toISOString() }
            : r,
        ),
      );
    },
    [toast, techProfiles, currentUserId],
  );

  const changeStatus = useCallback(
    async (row: FranchiseApplication, status: FranchiseStatus) => {
      if (status === row.status) return;
      const { msg, canNotify } = franchiseStatusChangeConfirm(row, status);
      if (!confirm(msg + (status === "completed" ? "" : "\n계속하시겠습니까?"))) return;

      const supabase = createClient();
      const patch = buildFranchiseStatusPatch(row, status);
      const { error } = await supabase
        .from("franchise_applications")
        .update(patch)
        .eq("id", row.id);
      if (error) {
        toast.error("상태 변경 실패: " + error.message);
        return;
      }
      await supabase.from("franchise_application_logs").insert({
        franchise_application_id: row.id,
        user_id: currentUserId,
        from_status: row.status,
        to_status: status,
      });
      setLogsByRow((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });

      const docCase =
        status === "doc_waiting" ? docCaseOf(row.owner_name, row.business_name) : undefined;
      const { linkedInstall } = await applyFranchiseStatusSideEffects({
        row,
        status,
        sendNotify: canNotify,
        docCase,
        currentUserId,
        toast,
      });
      if (linkedInstall) setLocalLinkedInstalls((prev) => ({ ...prev, [row.id]: linkedInstall }));

      setLocalRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                status,
                doc_template: (patch.doc_template as string | undefined) ?? r.doc_template,
                updated_at: new Date().toISOString(),
              }
            : r,
        ),
      );
    },
    [currentUserId, toast, localLinkedInstalls],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="상호명, 고객명, 전화번호..."
            className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">상태 전체</option>
          {(Object.keys(FRANCHISE_STATUS_LABEL) as FranchiseStatus[]).map((s) => (
            <option key={s} value={s}>
              {FRANCHISE_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {(search || statusFilter) && (
          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("");
            }}
            className="text-sm text-slate-400 hover:text-red-500 px-2 py-2 transition-colors"
          >
            초기화
          </button>
        )}
        <button
          onClick={() => setManualSort((v) => !v)}
          className={`text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${manualSort ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}
        >
          직접 정렬{manualSort ? " (드래그로 순서 변경)" : ""}
        </button>

        <div className="ml-auto flex items-center gap-3">
          <div className="text-sm text-slate-500">
            전체 {filteredRows.length.toLocaleString()}건
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={14} />
            정보 입력
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
          techProfiles={techProfiles}
          onSubmit={handleCreate}
          submitting={submitting}
          onClose={() => setShowForm(false)}
        />
      )}

      <div className="flex-1 overflow-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm border-collapse" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 24 }} />
            <col style={{ width: 32 }} />
            <col style={{ width: 24 }} />
            {MAIN_FIELDS.map((f) => (
              <col key={f} style={{ width: colWidths[f] ?? DEFAULT_WIDTHS[f] ?? 140 }} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr>
              <th className="px-1 py-3 border-b border-slate-200" />
              <th className="px-3 py-3 border-b border-slate-200">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                />
              </th>
              <th className="px-3 py-3 border-b border-slate-200" />
              {MAIN_FIELDS.map((f) => (
                <th
                  key={f}
                  title={MAIN_LABELS[f]}
                  className="relative text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap overflow-hidden text-ellipsis select-none"
                >
                  {MAIN_LABELS[f]}
                  <div
                    onMouseDown={(e) => startResize(e, f)}
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-500/60"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row) => (
              <Fragment key={row.id}>
                <tr
                  className={`border-b border-slate-100 hover:bg-blue-50 transition-colors cursor-pointer ${rowDragId === row.id ? "opacity-40" : ""}`}
                  onClick={() => toggleExpand(row)}
                  onDragOver={(e) => {
                    if (canReorder && rowDragId) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (rowDragId) reorderRows(rowDragId, row.id);
                  }}
                >
                  <td
                    className={`px-1 py-3 text-slate-700 ${canReorder ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed opacity-30"}`}
                    onClick={(e) => e.stopPropagation()}
                    draggable={canReorder}
                    onDragStart={(e) => {
                      if (!canReorder) {
                        e.preventDefault();
                        return;
                      }
                      setRowDragId(row.id);
                    }}
                    onDragEnd={() => setRowDragId(null)}
                    title={
                      canReorder
                        ? "드래그해서 순서 변경"
                        : '"직접 정렬" 켜고 검색/필터 해제 시에만 순서를 바꿀 수 있습니다'
                    }
                  >
                    <GripVertical size={14} />
                  </td>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                      className="w-4 h-4 accent-blue-600 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-3 text-slate-500">
                    {expandedId === row.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </td>
                  <td
                    className="px-3 py-3 text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis"
                    title={row.owner_name || undefined}
                  >
                    {row.owner_name || "-"}
                  </td>
                  <td
                    className="px-3 py-3 whitespace-nowrap overflow-hidden text-ellipsis font-medium text-slate-900"
                    title={row.business_name || undefined}
                  >
                    {row.business_name || "-"}
                  </td>
                  <td
                    className="px-3 py-3 text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {row.phone ? (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(row.phone!);
                          toast.success(`복사됨: ${row.phone}`);
                        }}
                        className="hover:text-blue-600 hover:underline transition-colors cursor-pointer"
                        title="클릭하여 복사"
                      >
                        {row.phone}
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={row.program ?? ""}
                      onChange={(e) => saveField(row, "program", e.target.value)}
                      className="text-xs font-medium rounded-full pl-2.5 pr-1.5 py-1 border border-slate-200 bg-slate-100 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer"
                    >
                      <option value="">-</option>
                      {PROGRAMS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={row.status}
                      onChange={(e) => changeStatus(row, e.target.value as FranchiseStatus)}
                      className={`text-xs font-medium rounded-full pl-2.5 pr-1.5 py-1 border focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer ${FRANCHISE_STATUS_COLOR[row.status]}`}
                    >
                      {(Object.keys(FRANCHISE_STATUS_LABEL) as FranchiseStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {FRANCHISE_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={row.tech_id ?? ""}
                      onChange={(e) => saveField(row, "tech_id", e.target.value)}
                      className="text-sm font-medium text-slate-700 border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-400 rounded cursor-pointer"
                    >
                      <option value="">미배정</option>
                      {techProfiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
                {expandedId === row.id && (
                  <tr className="bg-blue-50/50 border-b border-slate-100">
                    <td colSpan={MAIN_FIELDS.length + 3} className="px-6 py-4">
                      <div className="grid grid-cols-4 gap-4 mb-4">
                        <div className="col-span-2">
                          <label className="text-xs font-semibold text-slate-400">장비목록</label>
                          <EditableText row={row} field="equipment" onSave={saveField} />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-400">오픈일</label>
                          <EditableText
                            row={row}
                            field="open_date"
                            type="date"
                            onSave={saveField}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-400">
                            설치 및 발송일
                          </label>
                          <EditableText
                            row={row}
                            field="install_date"
                            type="date"
                            onSave={saveField}
                          />
                        </div>
                        <div className="col-span-4">
                          <label className="text-xs font-semibold text-slate-400">비고</label>
                          <EditableText row={row} field="memo" onSave={saveField} />
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-400 mb-1.5">
                          상태 변경 이력
                        </p>
                        {!logsByRow[row.id] ? (
                          <p className="text-xs text-slate-400">불러오는 중...</p>
                        ) : logsByRow[row.id].length === 0 ? (
                          <p className="text-xs text-slate-400">변경 이력이 없습니다.</p>
                        ) : (
                          <ul className="space-y-1">
                            {logsByRow[row.id].map((log) => (
                              <li key={log.id} className="text-xs text-slate-500">
                                {new Date(log.created_at).toLocaleString("ko-KR")} ·{" "}
                                {log.user?.name ?? "알수없음"} ·{" "}
                                {log.from_status
                                  ? (FRANCHISE_STATUS_LABEL[log.from_status as FranchiseStatus] ??
                                    log.from_status)
                                  : "-"}{" "}
                                →{" "}
                                {log.to_status
                                  ? (FRANCHISE_STATUS_LABEL[log.to_status as FranchiseStatus] ??
                                    log.to_status)
                                  : "-"}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="flex justify-end mt-3">
                        <HistoryButton onClick={() => setHistoryOpenId(row.id)} />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={MAIN_FIELDS.length + 3} className="text-center text-slate-400 py-10">
                  조건에 맞는 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 disabled:opacity-40 hover:bg-slate-50"
          >
            이전
          </button>
          <span className="text-xs text-slate-500">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 disabled:opacity-40 hover:bg-slate-50"
          >
            다음
          </button>
        </div>
      )}
      {historyOpenId &&
        (() => {
          const row = localRows.find((r) => r.id === historyOpenId);
          if (!row) return null;
          return (
            <MemoHistoryPanel
              title={row.business_name || row.owner_name || "-"}
              memo={row.memo}
              createdAt={row.created_at}
              onAddMemo={(value) => saveField(row, "memo", value)}
              onDeleteMemo={(newMemo) => saveField(row, "memo", newMemo, true)}
              onClose={() => setHistoryOpenId(null)}
            />
          );
        })()}
    </div>
  );
}
