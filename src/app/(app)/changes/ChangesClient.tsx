"use client";

import { useState, useTransition, useEffect, useRef, useMemo, memo, Fragment } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Search,
  Download,
  X,
  ClipboardList,
  CalendarClock,
  FileWarning,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { mergeRowsPreservingIdentity } from "@/lib/mergeRows";
import { formatPhone, formatBusinessNumber, formatDateText } from "@/lib/format";
import { deleteChangeRequests } from "./actions";
import type {
  ChangeRequest,
  ChangeRequestStatus,
  ChangeType,
  ChangeApplicantType,
  Profile,
} from "@/types";
import {
  CHANGE_TYPE_LABEL,
  CHANGE_STATUS_LABEL,
  CHANGE_STATUS_COLOR,
  CHANGE_APPLICANT_TYPE_LABEL,
} from "@/types";
import { useToast } from "@/components/ui/Toast";
import BulkConfirmDialog from "@/components/ui/BulkConfirmDialog";
import FormModal from "@/components/ui/FormModal";
import HistoryButton from "@/components/ui/HistoryButton";
import MemoHistoryPanel from "@/components/ui/MemoHistoryPanel";
import KpiCard from "@/components/ui/KpiCard";
import { AppSelect } from "@/components/ui/AppSelect";
import { DatePickerField } from "@/components/ui/DatePickerField";

const PAGE_SIZE = 50;

const STATUS_OPTIONS = Object.keys(CHANGE_STATUS_LABEL) as ChangeRequestStatus[];
const TYPE_OPTIONS = Object.keys(CHANGE_TYPE_LABEL) as ChangeType[];
const APPLICANT_TYPE_OPTIONS = Object.keys(CHANGE_APPLICANT_TYPE_LABEL) as ChangeApplicantType[];

const AUTO_FORMAT: Partial<Record<keyof ChangeRequest, (raw: string) => string>> = {
  phone: formatPhone,
  business_number: formatBusinessNumber,
};

function defaultCreateForm() {
  return {
    business_name: "",
    owner_name: "",
    phone: "",
    business_number: "",
    applicant_type: "individual" as ChangeApplicantType,
    change_type: "bank" as ChangeType,
    reception_date: new Date().toISOString().slice(0, 10),
    payment_received: false,
    cs_id: "",
    memo: "",
  };
}

interface Props {
  rows: ChangeRequest[];
  csProfiles: Pick<Profile, "id" | "name" | "role">[];
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
  initialHighlightId?: string;
}

interface EditableTextProps {
  row: ChangeRequest;
  field: keyof ChangeRequest;
  placeholder: string;
  onSave: (row: ChangeRequest, field: keyof ChangeRequest, value: string) => void;
}
const EditableText = memo(function EditableText({
  row,
  field,
  placeholder,
  onSave,
}: EditableTextProps) {
  const [value, setValue] = useState((row[field] as string) ?? "");
  const autoFormat = AUTO_FORMAT[field];
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(autoFormat ? autoFormat(e.target.value) : e.target.value)}
      onBlur={() => {
        if (value !== ((row[field] as string) ?? "")) onSave(row, field, value);
      }}
      onClick={(e) => e.stopPropagation()}
      className="w-full bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-2 py-1.5 text-sm"
    />
  );
});

interface DateFieldProps {
  row: ChangeRequest;
  field: keyof ChangeRequest;
  onSave: (row: ChangeRequest, field: keyof ChangeRequest, value: string) => void;
}
const DateField = memo(function DateField({ row, field, onSave }: DateFieldProps) {
  const [value, setValue] = useState((row[field] as string) ?? "");
  return (
    <input
      value={value}
      placeholder="YYYY-MM-DD"
      onChange={(e) => setValue(formatDateText(e.target.value))}
      onBlur={() => {
        if (value !== ((row[field] as string) ?? "")) onSave(row, field, value);
      }}
      onClick={(e) => e.stopPropagation()}
      className="w-full bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-2 py-1.5 text-sm"
    />
  );
});

interface EditableMemoProps {
  row: ChangeRequest;
  onSave: (row: ChangeRequest, field: keyof ChangeRequest, value: string) => void;
}
const EditableMemo = memo(function EditableMemo({ row, onSave }: EditableMemoProps) {
  const [value, setValue] = useState("");
  return (
    <div className="flex flex-col gap-1">
      {row.memo && (
        <pre className="whitespace-pre-wrap break-words text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 max-h-40 overflow-y-auto">
          {row.memo}
        </pre>
      )}
      <textarea
        value={value}
        placeholder="새 메모 입력..."
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value.trim()) {
            onSave(row, "memo", value);
            setValue("");
          }
        }}
        onClick={(e) => e.stopPropagation()}
        rows={2}
        className="w-full bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-2 py-1.5 text-sm resize-y"
      />
    </div>
  );
});

export default function ChangesClient({
  rows,
  csProfiles,
  currentUserId,
  currentUserName,
  currentUserRole,
  initialHighlightId,
}: Props) {
  const router = useRouter();
  const [localRows, setLocalRows] = useState(rows);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ChangeRequestStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<ChangeType | "">("");
  const [applicantTypeFilter, setApplicantTypeFilter] = useState<ChangeApplicantType | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<"created_at" | "reception_date" | "status">("created_at");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(initialHighlightId ?? null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultCreateForm());
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();
  const supabase = createClient();

  const canDelete =
    currentUserRole === "admin" || currentUserRole === "master" || currentUserRole === "cs";

  useEffect(() => {
    setLocalRows((prev) => mergeRowsPreservingIdentity(prev, rows));
  }, [rows]);

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("change_requests-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "change_requests" }, () => {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => startTransition(() => router.refresh()), 400);
      })
      .subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [router]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = localRows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (typeFilter && r.change_type !== typeFilter) return false;
      if (applicantTypeFilter && r.applicant_type !== applicantTypeFilter) return false;
      if (dateFrom && (r.reception_date ?? "") < dateFrom) return false;
      if (dateTo && (r.reception_date ?? "") > dateTo) return false;
      if (q) {
        const hay = `${r.business_name} ${r.owner_name ?? ""} ${r.phone ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    result.sort((a, b) => {
      if (sortBy === "status") return a.status.localeCompare(b.status);
      const av = (sortBy === "reception_date" ? a.reception_date : a.created_at) ?? "";
      const bv = (sortBy === "reception_date" ? b.reception_date : b.created_at) ?? "";
      return bv.localeCompare(av);
    });
    return result;
  }, [localRows, search, statusFilter, typeFilter, applicantTypeFilter, dateFrom, dateTo, sortBy]);

  const filterKey = `${search}|${statusFilter}|${typeFilter}|${applicantTypeFilter}|${dateFrom}|${dateTo}|${sortBy}`;
  const [pageResetKey, setPageResetKey] = useState(filterKey);
  if (filterKey !== pageResetKey) {
    setPageResetKey(filterKey);
    setPage(1);
  }
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const kpis = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return {
      today: localRows.filter((r) => r.reception_date === todayStr).length,
      waitingDocs: localRows.filter((r) => r.status === "waiting_docs").length,
      docsIncomplete: localRows.filter((r) => r.status === "docs_incomplete").length,
      done: localRows.filter((r) => r.status === "done").length,
    };
  }, [localRows]);

  function toggleExpand(row: ChangeRequest) {
    setExpandedId((prev) => (prev === row.id ? null : row.id));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const allChecked = pagedRows.length > 0 && pagedRows.every((r) => selected.has(r.id));
  function toggleAll() {
    setSelected((prev) => {
      if (allChecked) {
        const next = new Set(prev);
        pagedRows.forEach((r) => next.delete(r.id));
        return next;
      }
      return new Set([...prev, ...pagedRows.map((r) => r.id)]);
    });
  }
  function selectAllFiltered() {
    setSelected(new Set(filteredRows.map((r) => r.id)));
  }

  async function saveField(
    row: ChangeRequest,
    field: keyof ChangeRequest,
    value: string,
    raw?: boolean,
  ) {
    let saveValue: string | null = value || null;
    if (field === "memo" && value && !raw) {
      const stamp = `[${currentUserName} ${new Date().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}]`;
      const prev = (row.memo ?? "").trim();
      saveValue = prev ? `${prev}\n${stamp} ${value}` : `${stamp} ${value}`;
    }
    const { error } = await supabase
      .from("change_requests")
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
  }

  async function updateStatus(row: ChangeRequest, status: ChangeRequestStatus) {
    const { error } = await supabase.from("change_requests").update({ status }).eq("id", row.id);
    if (error) {
      toast.error("상태 변경 실패: " + error.message);
      return;
    }
    setLocalRows((prev) =>
      prev.map((r) =>
        r.id === row.id ? { ...r, status, updated_at: new Date().toISOString() } : r,
      ),
    );
  }

  async function updateApplicantType(row: ChangeRequest, applicantType: ChangeApplicantType) {
    const { error } = await supabase
      .from("change_requests")
      .update({ applicant_type: applicantType })
      .eq("id", row.id);
    if (error) {
      toast.error("사업자유형 변경 실패: " + error.message);
      return;
    }
    setLocalRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? { ...r, applicant_type: applicantType, updated_at: new Date().toISOString() }
          : r,
      ),
    );
  }

  async function updateChangeType(row: ChangeRequest, changeType: ChangeType) {
    const { error } = await supabase
      .from("change_requests")
      .update({ change_type: changeType })
      .eq("id", row.id);
    if (error) {
      toast.error("변경유형 변경 실패: " + error.message);
      return;
    }
    setLocalRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? { ...r, change_type: changeType, updated_at: new Date().toISOString() }
          : r,
      ),
    );
  }

  async function updateCs(row: ChangeRequest, csId: string) {
    const { error } = await supabase
      .from("change_requests")
      .update({ cs_id: csId || null })
      .eq("id", row.id);
    if (error) {
      toast.error("담당자 변경 실패: " + error.message);
      return;
    }
    const cs = csId ? (csProfiles.find((p) => p.id === csId) ?? null) : null;
    setLocalRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...r,
              cs_id: csId || undefined,
              cs: cs as ChangeRequest["cs"],
              updated_at: new Date().toISOString(),
            }
          : r,
      ),
    );
  }

  async function updatePaymentReceived(row: ChangeRequest, received: boolean) {
    const { error } = await supabase
      .from("change_requests")
      .update({ payment_received: received })
      .eq("id", row.id);
    if (error) {
      toast.error("입금여부 변경 실패: " + error.message);
      return;
    }
    setLocalRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? { ...r, payment_received: received, updated_at: new Date().toISOString() }
          : r,
      ),
    );
  }

  async function handleCreate() {
    if (!form.business_name.trim()) {
      toast.error("상호명을 입력해주세요.");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase
      .from("change_requests")
      .insert({
        business_name: form.business_name.trim(),
        owner_name: form.owner_name.trim() || null,
        phone: form.phone.trim() || null,
        business_number: form.business_number.trim() || null,
        applicant_type: form.applicant_type,
        change_type: form.change_type,
        reception_date: form.reception_date || null,
        payment_received: form.payment_received,
        cs_id: form.cs_id || null,
        memo: form.memo.trim() || null,
        created_by: currentUserId,
      })
      .select(
        "*, cs:profiles!change_requests_cs_id_fkey(id,name,role), creator:profiles!change_requests_created_by_fkey(id,name,role)",
      )
      .single();
    setSubmitting(false);
    if (error) {
      toast.error(`등록 실패: ${error.message}`);
      return;
    }
    setLocalRows((prev) => [data as ChangeRequest, ...prev]);
    toast.success("변경 요청이 등록되었습니다.");
    setForm(defaultCreateForm());
    setShowForm(false);
  }

  function handleDelete() {
    if (selected.size === 0) return;
    setDeleteConfirmOpen(true);
  }

  async function confirmDelete() {
    setDeleting(true);
    const { error } = await deleteChangeRequests([...selected]);
    setDeleting(false);
    setDeleteConfirmOpen(false);
    if (error) {
      toast.error(`삭제 실패: ${error}`);
      return;
    }
    startTransition(() => {
      setLocalRows((prev) => prev.filter((r) => !selected.has(r.id)));
      setSelected(new Set());
    });
  }

  function handleExcel() {
    import("xlsx").then((XLSX) => {
      const data = filteredRows.map((r) => ({
        접수일: r.reception_date ?? "",
        변경유형: CHANGE_TYPE_LABEL[r.change_type],
        사업자유형: CHANGE_APPLICANT_TYPE_LABEL[r.applicant_type],
        상호명: r.business_name ?? "",
        대표자: r.owner_name ?? "",
        연락처: r.phone ?? "",
        사업자번호: r.business_number ?? "",
        입금여부: r.payment_received ? "Y" : "N",
        등록자: r.creator?.name ?? "",
        담당자: r.cs?.name ?? "",
        상태: CHANGE_STATUS_LABEL[r.status],
        메모: r.memo ?? "",
        등록일: format(new Date(r.created_at), "yyyy-MM-dd", { locale: ko }),
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "변경관리");
      XLSX.writeFile(wb, `변경관리_${format(new Date(), "yyyyMMdd")}.xlsx`);
    });
  }

  return (
    <div className="flex flex-col gap-3 flex-1 overflow-hidden">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="오늘 접수" value={kpis.today} icon={ClipboardList} tone="blue" />
        <KpiCard label="서류 대기" value={kpis.waitingDocs} icon={CalendarClock} tone="amber" />
        <KpiCard label="서류 미비" value={kpis.docsIncomplete} icon={FileWarning} tone="red" />
        <KpiCard label="접수 완료" value={kpis.done} icon={CheckCircle2} tone="green" />
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="상호명, 대표자, 연락처..."
            className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <AppSelect
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as ChangeRequestStatus | "")}
          aria-label="상태 필터"
          options={[
            { value: "", label: "상태 전체" },
            ...STATUS_OPTIONS.map((s) => ({ value: s, label: CHANGE_STATUS_LABEL[s] })),
          ]}
        />
        <AppSelect
          value={typeFilter}
          onValueChange={(value) => setTypeFilter(value as ChangeType | "")}
          aria-label="변경유형 필터"
          options={[
            { value: "", label: "변경유형 전체" },
            ...TYPE_OPTIONS.map((t) => ({ value: t, label: CHANGE_TYPE_LABEL[t] })),
          ]}
        />
        <AppSelect
          value={applicantTypeFilter}
          onValueChange={(value) => setApplicantTypeFilter(value as ChangeApplicantType | "")}
          aria-label="사업자유형 필터"
          options={[
            { value: "", label: "사업자유형 전체" },
            ...APPLICANT_TYPE_OPTIONS.map((t) => ({
              value: t,
              label: CHANGE_APPLICANT_TYPE_LABEL[t],
            })),
          ]}
        />
        <DatePickerField value={dateFrom} onChange={setDateFrom} ariaLabel="접수일 시작" />
        <span className="text-slate-400 text-xs">~</span>
        <DatePickerField value={dateTo} onChange={setDateTo} ariaLabel="접수일 종료" />
        <AppSelect
          value={sortBy}
          onValueChange={(value) => setSortBy(value as typeof sortBy)}
          aria-label="정렬"
          options={[
            { value: "created_at", label: "등록일순" },
            { value: "reception_date", label: "접수일순" },
            { value: "status", label: "상태순" },
          ]}
        />
        {(search || statusFilter || typeFilter || applicantTypeFilter || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setTypeFilter("");
              setApplicantTypeFilter("");
              setDateFrom("");
              setDateTo("");
            }}
            className="text-sm text-slate-400 hover:text-red-500 px-2 py-2 transition-colors"
          >
            초기화
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <div className="text-sm text-slate-500">
            {search || statusFilter || typeFilter || applicantTypeFilter || dateFrom || dateTo ? (
              <>
                <span className="font-semibold text-slate-800">
                  {filteredRows.length.toLocaleString()}건
                </span>{" "}
                / 전체 {localRows.length.toLocaleString()}건
              </>
            ) : (
              `전체 ${localRows.length.toLocaleString()}건`
            )}
          </div>
          <button
            onClick={handleExcel}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Download size={14} />
            엑셀
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={14} />
            정보 입력
          </button>
        </div>
      </div>

      {canDelete && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white border border-slate-200 shadow-lg rounded-xl px-5 py-3">
          <span className="text-sm font-semibold text-blue-700">{selected.size}건 선택됨</span>
          {filteredRows.length > pagedRows.length && selected.size < filteredRows.length && (
            <button
              onClick={selectAllFiltered}
              title="체크박스는 이 페이지만 선택합니다. 필터링된 전체를 선택하려면 이 버튼을 누르세요."
              className="text-xs font-medium text-blue-600 hover:text-blue-800 underline underline-offset-2"
            >
              필터링된 전체 {filteredRows.length.toLocaleString()}건 선택
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting || isPending}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Trash2 size={14} />
            {deleting ? "삭제 중..." : "선택 삭제"}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            취소
          </button>
        </div>
      )}

      {showForm && (
        <FormModal title="변경 요청 등록" onClose={() => setShowForm(false)}>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <AppSelect
                value={form.change_type}
                onValueChange={(value) => setForm({ ...form, change_type: value as ChangeType })}
                aria-label="변경유형"
                options={TYPE_OPTIONS.map((t) => ({ value: t, label: CHANGE_TYPE_LABEL[t] }))}
              />
              <AppSelect
                value={form.applicant_type}
                onValueChange={(value) =>
                  setForm({ ...form, applicant_type: value as ChangeApplicantType })
                }
                aria-label="사업자유형"
                options={APPLICANT_TYPE_OPTIONS.map((t) => ({
                  value: t,
                  label: CHANGE_APPLICANT_TYPE_LABEL[t],
                }))}
              />
            </div>
            <input
              placeholder="상호명"
              value={form.business_name}
              onChange={(e) => setForm({ ...form, business_name: e.target.value })}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder="대표자명"
              value={form.owner_name}
              onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder="연락처"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder="사업자번호"
              value={form.business_number}
              onChange={(e) =>
                setForm({ ...form, business_number: formatBusinessNumber(e.target.value) })
              }
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-3 items-center">
              <DatePickerField
                value={form.reception_date}
                onChange={(value) => setForm({ ...form, reception_date: value })}
                ariaLabel="접수일"
              />
              <AppSelect
                value={form.payment_received ? "Y" : "N"}
                onValueChange={(value) => setForm({ ...form, payment_received: value === "Y" })}
                aria-label="입금여부"
                options={[
                  { value: "N", label: "입금여부: N" },
                  { value: "Y", label: "입금여부: Y" },
                ]}
              />
            </div>
            <AppSelect
              value={form.cs_id}
              onValueChange={(value) => setForm({ ...form, cs_id: value })}
              aria-label="담당자"
              options={[
                { value: "", label: "담당자 선택" },
                ...csProfiles.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            <textarea
              placeholder="메모"
              value={form.memo}
              onChange={(e) => setForm({ ...form, memo: e.target.value })}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              rows={2}
            />
            <button
              onClick={handleCreate}
              disabled={submitting}
              className="bg-blue-600 text-white text-sm px-4 py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 font-semibold mt-1"
            >
              {submitting ? "등록 중..." : "등록"}
            </button>
          </div>
        </FormModal>
      )}

      <div className="flex-1 overflow-auto border border-slate-200 rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr className="text-left text-slate-500 text-xs">
              <th className="px-3 py-2.5 border-b border-slate-200 w-10">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                  title="이 페이지 전체 선택 (필터링된 전체가 아님)"
                />
              </th>
              <th className="px-3 py-2.5 border-b border-slate-200 w-6"></th>
              <th className="px-3 py-2.5 border-b border-slate-200">접수날짜</th>
              <th className="px-3 py-2.5 border-b border-slate-200">변경유형</th>
              <th className="px-3 py-2.5 border-b border-slate-200">사업자유형</th>
              <th className="px-3 py-2.5 border-b border-slate-200">상호명</th>
              <th className="px-3 py-2.5 border-b border-slate-200">대표자</th>
              <th className="px-3 py-2.5 border-b border-slate-200">연락처</th>
              <th className="px-3 py-2.5 border-b border-slate-200">등록자</th>
              <th className="px-3 py-2.5 border-b border-slate-200">담당자</th>
              <th className="px-3 py-2.5 border-b border-slate-200">입금</th>
              <th className="px-3 py-2.5 border-b border-slate-200">상태</th>
              <th className="px-3 py-2.5 border-b border-slate-200">메모</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={13} className="text-center text-slate-400 p-8">
                  등록된 변경 요청이 없습니다.
                </td>
              </tr>
            ) : (
              pagedRows.map((row) => (
                <Fragment key={row.id}>
                  <tr
                    id={`change-row-${row.id}`}
                    className="border-t border-slate-100 hover:bg-blue-50 transition-colors cursor-pointer"
                    onClick={() => toggleExpand(row)}
                  >
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
                    <td className="px-3 py-3 whitespace-nowrap text-slate-600">
                      {row.reception_date || "-"}
                    </td>
                    <td
                      className="px-3 py-3 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <AppSelect
                        value={row.change_type}
                        onValueChange={(value) => updateChangeType(row, value as ChangeType)}
                        aria-label="변경유형"
                        className="h-auto rounded-full border-slate-200 bg-slate-100 pl-2.5 pr-1.5 py-1 text-xs font-semibold"
                        options={TYPE_OPTIONS.map((t) => ({
                          value: t,
                          label: CHANGE_TYPE_LABEL[t],
                        }))}
                      />
                    </td>
                    <td
                      className="px-3 py-3 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <AppSelect
                        value={row.applicant_type}
                        onValueChange={(value) =>
                          updateApplicantType(row, value as ChangeApplicantType)
                        }
                        aria-label="사업자유형"
                        className="h-auto rounded-full border-slate-200 bg-slate-100 pl-2.5 pr-1.5 py-1 text-xs font-semibold"
                        options={APPLICANT_TYPE_OPTIONS.map((t) => ({
                          value: t,
                          label: CHANGE_APPLICANT_TYPE_LABEL[t],
                        }))}
                      />
                    </td>
                    <td
                      className="px-3 py-3 font-semibold text-slate-900 whitespace-nowrap max-w-[160px] overflow-hidden text-ellipsis"
                      title={row.business_name || undefined}
                    >
                      {row.business_name || "-"}
                    </td>
                    <td className="px-3 py-3 text-slate-800 whitespace-nowrap">
                      {row.owner_name || "-"}
                    </td>
                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                      {row.phone ? formatPhone(row.phone) : "-"}
                    </td>
                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {row.creator?.name ?? "-"}
                    </td>
                    <td
                      className="px-3 py-3 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <AppSelect
                        value={row.cs_id ?? ""}
                        onValueChange={(value) => updateCs(row, value)}
                        aria-label="담당자"
                        className="h-auto rounded border-0 bg-transparent text-sm font-medium"
                        options={[
                          { value: "", label: "미배정" },
                          ...csProfiles.map((p) => ({ value: p.id, label: p.name })),
                        ]}
                      />
                    </td>
                    <td
                      className="px-3 py-3 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <AppSelect
                        value={row.payment_received ? "Y" : "N"}
                        onValueChange={(value) => updatePaymentReceived(row, value === "Y")}
                        aria-label="입금여부"
                        className={`h-auto rounded-md border-0 px-2 py-1 text-xs font-semibold ${row.payment_received ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                        options={[
                          { value: "N", label: "N" },
                          { value: "Y", label: "Y" },
                        ]}
                      />
                    </td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <AppSelect
                        value={row.status}
                        onValueChange={(value) => updateStatus(row, value as ChangeRequestStatus)}
                        aria-label="상태"
                        className={`h-auto rounded-md border-0 px-2 py-1 text-xs font-medium ${CHANGE_STATUS_COLOR[row.status]}`}
                        options={STATUS_OPTIONS.map((s) => ({
                          value: s,
                          label: CHANGE_STATUS_LABEL[s],
                        }))}
                      />
                    </td>
                    <td
                      className="px-3 py-3 text-slate-600 max-w-[200px] truncate"
                      title={row.memo || undefined}
                    >
                      {row.memo || "-"}
                    </td>
                  </tr>
                  {expandedId === row.id && (
                    <tr className="bg-blue-50/50 border-b border-slate-100">
                      <td colSpan={13} className="px-6 py-4">
                        <div className="grid grid-cols-4 gap-4 mb-4">
                          <div>
                            <label className="text-xs font-semibold text-slate-400">상호명</label>
                            <EditableText
                              row={row}
                              field="business_name"
                              placeholder="-"
                              onSave={saveField}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-400">대표자명</label>
                            <EditableText
                              row={row}
                              field="owner_name"
                              placeholder="-"
                              onSave={saveField}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-400">연락처</label>
                            <EditableText
                              row={row}
                              field="phone"
                              placeholder="010-0000-0000"
                              onSave={saveField}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-400">
                              사업자번호
                            </label>
                            <EditableText
                              row={row}
                              field="business_number"
                              placeholder="000-00-00000"
                              onSave={saveField}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-400">변경유형</label>
                            <AppSelect
                              value={row.change_type}
                              onValueChange={(value) => updateChangeType(row, value as ChangeType)}
                              aria-label="변경유형"
                              className="w-full"
                              options={TYPE_OPTIONS.map((t) => ({
                                value: t,
                                label: CHANGE_TYPE_LABEL[t],
                              }))}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-400">접수일</label>
                            <DateField row={row} field="reception_date" onSave={saveField} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-400">입금여부</label>
                            <AppSelect
                              value={row.payment_received ? "Y" : "N"}
                              onValueChange={(value) => updatePaymentReceived(row, value === "Y")}
                              aria-label="입금여부"
                              className="w-full"
                              options={[
                                { value: "N", label: "N" },
                                { value: "Y", label: "Y" },
                              ]}
                            />
                          </div>
                          <div className="col-span-4">
                            <label className="text-xs font-semibold text-slate-400">메모</label>
                            <EditableMemo row={row} onSave={saveField} />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <HistoryButton onClick={() => setHistoryOpenId(row.id)} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
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

      <BulkConfirmDialog
        open={deleteConfirmOpen}
        title="선택 항목 삭제"
        busy={deleting}
        confirmText="삭제"
        confirmColor="red"
        items={localRows
          .filter((r) => selected.has(r.id))
          .map((r) => ({ id: r.id, label: r.business_name }))}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={confirmDelete}
      />

      {historyOpenId &&
        (() => {
          const row = localRows.find((r) => r.id === historyOpenId);
          if (!row) return null;
          return (
            <MemoHistoryPanel
              title={row.business_name || "-"}
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
