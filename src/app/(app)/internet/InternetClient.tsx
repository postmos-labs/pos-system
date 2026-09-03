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
import {
  Plus,
  Trash2,
  Search,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ClipboardList,
  CalendarClock,
  Wifi,
  CheckCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { saveRowOrder } from "@/lib/reorderRows";
import { formatPhone, formatDateText } from "@/lib/format";
import { useColumnWidths } from "@/hooks/useColumnWidths";
import { mergeRowsPreservingIdentity } from "@/lib/mergeRows";
import { deleteInternetRows } from "./actions";
import type { InternetManagement } from "@/types";
import { useToast } from "@/components/ui/Toast";
import BulkConfirmDialog from "@/components/ui/BulkConfirmDialog";
import FormModal from "@/components/ui/FormModal";
import HistoryButton from "@/components/ui/HistoryButton";
import MemoHistoryPanel from "@/components/ui/MemoHistoryPanel";
import KpiCard from "@/components/ui/KpiCard";
import { AppSelect } from "@/components/ui/AppSelect";
import { DatePickerField } from "@/components/ui/DatePickerField";

interface Props {
  rows: InternetManagement[];
}

const STATUSES = ["접수완료", "개통완료", "취소"];

const STATUS_NOTIFY_KIND: Partial<Record<string, "internet_apply_done" | "internet_done">> = {
  접수완료: "internet_apply_done",
  개통완료: "internet_done",
};
const CATEGORIES = ["백메가", "3S"];
const CARRIERS = ["LG", "KT", "SKT"];
const SPEEDS = ["100M", "500M"];
const CUSTOM_SPEED = "__custom__";

const SELECT_OPTIONS: Partial<Record<keyof InternetManagement, string[]>> = {
  status: STATUSES,
  category: CATEGORIES,
  carrier: CARRIERS,
};

const EMPTY_FORM = {
  business_name: "",
  apply_date: "",
  open_date: "",
  status: "",
  category: "",
  carrier: "",
  speed: "",
  addon: "",
  gift: "",
  owner_name: "",
  phone: "",
  region: "",
  monthly_fee: "",
  install_fee: "",
  memo: "",
};

const MAIN_COLUMNS: { key: keyof InternetManagement; label: string }[] = [
  { key: "business_name", label: "상호명" },
  { key: "category", label: "구분" },
  { key: "apply_date", label: "접수신청일" },
  { key: "open_date", label: "개통완료일" },
  { key: "status", label: "상태" },
  { key: "owner_name", label: "대표자" },
  { key: "phone", label: "연락처" },
];

const DETAIL_COLUMNS: { key: keyof InternetManagement; label: string }[] = [
  { key: "carrier", label: "통신사" },
  { key: "speed", label: "속도" },
  { key: "addon", label: "추가 가입상품" },
  { key: "gift", label: "사은품" },
  { key: "region", label: "지역" },
  { key: "monthly_fee", label: "월요금" },
  { key: "install_fee", label: "설치비" },
  { key: "memo", label: "비고" },
];

const COLUMNS = [...MAIN_COLUMNS, ...DETAIL_COLUMNS];

const DEFAULT_WIDTHS: Partial<Record<keyof InternetManagement, number>> = {
  business_name: 180,
  category: 90,
  apply_date: 110,
  open_date: 110,
  status: 100,
  owner_name: 100,
  phone: 130,
};

const COL_WIDTHS_STORAGE_KEY = "internet_management_col_widths";
const PAGE_SIZE = 50;

function formatLocalDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getTodayStr() {
  return formatLocalDate(new Date());
}

function getMonthRange() {
  const now = new Date();
  const from = formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  return { from, to };
}

const AUTO_FORMAT: Partial<Record<keyof InternetManagement, (raw: string) => string>> = {
  phone: formatPhone,
  apply_date: formatDateText,
  open_date: formatDateText,
};

interface EditableTextProps {
  row: InternetManagement;
  field: keyof InternetManagement;
  onSave: (row: InternetManagement, field: keyof InternetManagement, value: string) => void;
}
const EditableText = memo(function EditableText({ row, field, onSave }: EditableTextProps) {
  const [value, setValue] = useState((row[field] as string) ?? "");
  const autoFormat = AUTO_FORMAT[field];
  return (
    <input
      value={value}
      onChange={(e) => setValue(autoFormat ? autoFormat(e.target.value) : e.target.value)}
      onBlur={() => {
        if (value !== ((row[field] as string) ?? "")) onSave(row, field, value);
      }}
      onClick={(e) => e.stopPropagation()}
      className="w-full bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 -mx-1 text-sm"
    />
  );
});

interface SelectFieldProps {
  row: InternetManagement;
  field: keyof InternetManagement;
  options: string[];
  onSave: (row: InternetManagement, field: keyof InternetManagement, value: string) => void;
  pill?: boolean;
}
const SelectField = memo(function SelectField({
  row,
  field,
  options,
  onSave,
  pill,
}: SelectFieldProps) {
  const statusColor =
    field === "status"
      ? row.status === "개통완료"
        ? "bg-green-100 text-green-700 border border-green-200"
        : row.status === "취소"
          ? "bg-red-100 text-red-700 border border-red-200"
          : row.status === "접수완료"
            ? "bg-cyan-100 text-cyan-700 border border-cyan-200"
            : "bg-slate-100 text-slate-700 border border-slate-200"
      : "bg-slate-100 text-slate-700 border border-slate-200";
  return (
    <span onClick={(e) => e.stopPropagation()} className={pill ? "" : "block w-full"}>
      <AppSelect
        value={(row[field] as string) ?? ""}
        onValueChange={(value) => onSave(row, field, value)}
        aria-label={field}
        className={
          pill
            ? `h-auto rounded-full border-0 pl-2.5 pr-1.5 py-1 text-xs font-medium ${statusColor}`
            : "h-auto w-full border-0 bg-transparent px-1 -mx-1 text-sm"
        }
        options={[{ value: "", label: "-" }, ...options.map((o) => ({ value: o, label: o }))]}
      />
    </span>
  );
});

interface SpeedFieldProps {
  row: InternetManagement;
  onSave: (row: InternetManagement, field: keyof InternetManagement, value: string) => void;
}
const SpeedField = memo(function SpeedField({ row, onSave }: SpeedFieldProps) {
  const currentIsCustom = !!row.speed && !SPEEDS.includes(row.speed);
  const [customMode, setCustomMode] = useState(currentIsCustom);
  const [customValue, setCustomValue] = useState(currentIsCustom ? (row.speed ?? "") : "");

  function handleSelect(v: string) {
    if (v === CUSTOM_SPEED) {
      setCustomMode(true);
      setCustomValue(currentIsCustom ? (row.speed ?? "") : "");
    } else {
      setCustomMode(false);
      onSave(row, "speed", v);
    }
  }

  if (customMode) {
    return (
      <input
        value={customValue}
        onChange={(e) => setCustomValue(e.target.value)}
        onBlur={() => onSave(row, "speed", customValue)}
        onClick={(e) => e.stopPropagation()}
        placeholder="속도 직접입력"
        className="w-full bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 -mx-1 text-sm"
      />
    );
  }

  return (
    <span onClick={(e) => e.stopPropagation()} className="block w-full">
      <AppSelect
        value={SPEEDS.includes(row.speed ?? "") ? row.speed! : ""}
        onValueChange={handleSelect}
        aria-label="속도"
        className="h-auto w-full border-0 bg-transparent px-1 -mx-1 text-sm"
        options={[
          { value: "", label: "-" },
          ...SPEEDS.map((s) => ({ value: s, label: s })),
          { value: CUSTOM_SPEED, label: "직접입력" },
        ]}
      />
    </span>
  );
});

interface SpeedFormFieldProps {
  value: string;
  onChange: (value: string) => void;
}
const SpeedFormField = memo(function SpeedFormField({ value, onChange }: SpeedFormFieldProps) {
  const valueIsCustom = !!value && !SPEEDS.includes(value);
  const [customMode, setCustomMode] = useState(valueIsCustom);

  function handleSelect(v: string) {
    if (v === CUSTOM_SPEED) {
      setCustomMode(true);
      onChange("");
    } else {
      setCustomMode(false);
      onChange(v);
    }
  }

  if (customMode) {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="속도 직접입력"
        className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    );
  }

  return (
    <AppSelect
      value={SPEEDS.includes(value) ? value : ""}
      onValueChange={handleSelect}
      aria-label="속도"
      className="w-28"
      options={[
        { value: "", label: "선택 안함" },
        ...SPEEDS.map((s) => ({ value: s, label: s })),
        { value: CUSTOM_SPEED, label: "직접입력" },
      ]}
    />
  );
});

interface CreateFormProps {
  onSubmit: (form: typeof EMPTY_FORM) => Promise<void>;
  submitting: boolean;
  onClose: () => void;
}
const CreateForm = memo(function CreateForm({ onSubmit, submitting, onClose }: CreateFormProps) {
  const [form, setForm] = useState(EMPTY_FORM);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit(form);
    setForm(EMPTY_FORM);
  }

  return (
    <FormModal title="인터넷 정보 입력" onClose={onClose} maxWidthClassName="max-w-3xl">
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
        {COLUMNS.map((col) => {
          const options = SELECT_OPTIONS[col.key];
          return (
            <div key={col.key} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">{col.label}</label>
              {col.key === "speed" ? (
                <SpeedFormField
                  value={form.speed}
                  onChange={(v) => setForm({ ...form, speed: v })}
                />
              ) : options ? (
                <AppSelect
                  value={form[col.key as keyof typeof form]}
                  onValueChange={(value) => setForm({ ...form, [col.key]: value })}
                  aria-label={col.label}
                  className="w-28"
                  options={[
                    { value: "", label: "선택 안함" },
                    ...options.map((o) => ({ value: o, label: o })),
                  ]}
                />
              ) : (
                <input
                  value={form[col.key as keyof typeof form]}
                  onChange={(e) => {
                    const fmt = AUTO_FORMAT[col.key];
                    setForm({ ...form, [col.key]: fmt ? fmt(e.target.value) : e.target.value });
                  }}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
          );
        })}
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

export default function InternetClient({ rows }: Props) {
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
  const [categoryFilter, setCategoryFilter] = useState("");
  const [dateField, setDateField] = useState<"apply_date" | "open_date">("apply_date");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [rowDragId, setRowDragId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const { colWidths, startResize } = useColumnWidths(
    COL_WIDTHS_STORAGE_KEY,
    DEFAULT_WIDTHS as Record<string, number>,
  );

  useEffect(() => {
    setLocalRows((prev) => mergeRowsPreservingIdentity(prev, rows));
    setSelected(new Set());
  }, [rows]);

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("internet_management-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internet_management" },
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
    return localRows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (categoryFilter && row.category !== categoryFilter) return false;
      if (dateFrom || dateTo) {
        const value = row[dateField] as string | undefined;
        if (!value) return false;
        if (dateFrom && value < dateFrom) return false;
        if (dateTo && value > dateTo) return false;
      }
      if (term) {
        const haystack =
          `${row.business_name ?? ""} ${row.owner_name ?? ""} ${row.phone ?? ""} ${row.region ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [localRows, search, statusFilter, categoryFilter, dateField, dateFrom, dateTo]);

  const filterKey = `${search}|${statusFilter}|${categoryFilter}|${dateField}|${dateFrom}|${dateTo}`;
  const [pageResetKey, setPageResetKey] = useState(filterKey);
  if (filterKey !== pageResetKey) {
    setPageResetKey(filterKey);
    setPage(1);
  }

  const applyKpiFilter = useCallback(
    (filter: {
      status?: string;
      category?: string;
      dateField?: "apply_date" | "open_date";
      dateFrom?: string;
      dateTo?: string;
    }) => {
      setSearch("");
      setStatusFilter(filter.status ?? "");
      setCategoryFilter(filter.category ?? "");
      setDateField(filter.dateField ?? "apply_date");
      setDateFrom(filter.dateFrom ?? "");
      setDateTo(filter.dateTo ?? "");
    },
    [],
  );

  const kpis = useMemo(() => {
    const todayStr = getTodayStr();
    const monthStr = todayStr.slice(0, 7);
    return {
      today: localRows.filter((r) => r.apply_date === todayStr).length,
      waiting: localRows.filter((r) => r.status === "접수완료").length,
      openedToday: localRows.filter((r) => r.status === "개통완료" && r.open_date === todayStr)
        .length,
      openedToday3S: localRows.filter(
        (r) => r.status === "개통완료" && r.open_date === todayStr && r.category === "3S",
      ).length,
      openedTodayBaekMega: localRows.filter(
        (r) => r.status === "개통완료" && r.open_date === todayStr && r.category === "백메가",
      ).length,
      openedMonth: localRows.filter(
        (r) => r.status === "개통완료" && (r.open_date ?? "").startsWith(monthStr),
      ).length,
      openedMonth3S: localRows.filter(
        (r) =>
          r.status === "개통완료" &&
          (r.open_date ?? "").startsWith(monthStr) &&
          r.category === "3S",
      ).length,
      openedMonthBaekMega: localRows.filter(
        (r) =>
          r.status === "개통완료" &&
          (r.open_date ?? "").startsWith(monthStr) &&
          r.category === "백메가",
      ).length,
    };
  }, [localRows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const allChecked = pagedRows.length > 0 && pagedRows.every((r) => selected.has(r.id));

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (allChecked) {
        const next = new Set(prev);
        pagedRows.forEach((r) => next.delete(r.id));
        return next;
      }
      return new Set([...prev, ...pagedRows.map((r) => r.id)]);
    });
  }, [allChecked, pagedRows]);

  const selectAllFiltered = useCallback(() => {
    setSelected(new Set(filteredRows.map((r) => r.id)));
  }, [filteredRows]);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const canReorder = !search.trim() && !statusFilter && !categoryFilter;

  const reorderRows = useCallback(
    (dragId: string, dropId: string) => {
      if (dragId === dropId) return;
      const from = localRows.findIndex((r) => r.id === dragId);
      const to = localRows.findIndex((r) => r.id === dropId);
      if (from === -1 || to === -1) return;
      const next = [...localRows];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      const prevOrder = localRows;
      setLocalRows(next);
      void saveRowOrder(
        "internet_management",
        next.map((r) => r.id),
      ).then(({ error }) => {
        if (!error) return;
        // 저장되지 않은 순서가 화면에 남으면 새로고침 때 어긋난다 — 원래 순서로 되돌린다.
        setLocalRows(prevOrder);
        toast.error("순서 저장에 실패했습니다.");
      });
    },
    [localRows, toast],
  );

  const handleDelete = useCallback(() => {
    if (selected.size === 0) return;
    setDeleteConfirmOpen(true);
  }, [selected]);

  const confirmDelete = useCallback(async () => {
    setDeleting(true);
    const { error } = await deleteInternetRows([...selected]);
    setDeleting(false);
    setDeleteConfirmOpen(false);
    if (error) {
      toast.error("삭제 실패: " + error);
      return;
    }
    setLocalRows((prev) => prev.filter((r) => !selected.has(r.id)));
    setSelected(new Set());
  }, [selected]);

  const handleCreate = useCallback(async (form: typeof EMPTY_FORM) => {
    setSubmitting(true);
    const supabase = createClient();
    const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v || null]));
    const { data, error } = await supabase
      .from("internet_management")
      .insert({ ...payload, sort_order: Date.now() })
      .select()
      .single();
    setSubmitting(false);
    if (error) {
      toast.error("등록 실패: " + error.message);
      return;
    }
    setShowForm(false);
    setLocalRows((prev) => [data, ...prev]);
  }, []);

  const saveField = useCallback(
    async (row: InternetManagement, field: keyof InternetManagement, value: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("internet_management")
        .update({ [field]: value || null })
        .eq("id", row.id);
      if (error) {
        toast.error("수정 실패: " + error.message);
        return;
      }

      if (field === "status" && value !== row.status) {
        const notifyKind = STATUS_NOTIFY_KIND[value];
        if (notifyKind && row.phone) {
          if (
            confirm(`'${value}'(으)로 변경하면 고객에게 메시지가 발송됩니다. 계속하시겠습니까?`)
          ) {
            try {
              const res = await fetch("/api/franchise/notify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "status_update",
                  phone: row.phone,
                  ownerName: row.owner_name,
                  businessName: row.business_name,
                  status: notifyKind,
                }),
              });
              const data = await res.json();
              if (!data.ok) toast.error("메시지 발송 실패: " + data.error);
            } catch {
              toast.error("메시지 발송 실패");
            }
          } else {
            toast.warning("상태는 저장됐지만 알림은 보내지 않았습니다.");
          }
        }
      }

      setLocalRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, [field]: value || undefined, updated_at: new Date().toISOString() }
            : r,
        ),
      );
    },
    [],
  );

  return (
    <div className="flex flex-col h-full">
      <BulkConfirmDialog
        open={deleteConfirmOpen}
        title="선택 항목 삭제"
        items={[...selected].map((id) => {
          const row = localRows.find((r) => r.id === id);
          return {
            id,
            label: row?.business_name || row?.owner_name || id,
            detail: row?.phone ?? undefined,
          };
        })}
        confirmText="삭제"
        confirmColor="red"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6 mb-3">
        <KpiCard
          label="오늘 접수"
          value={kpis.today}
          icon={ClipboardList}
          tone="blue"
          onClick={() =>
            applyKpiFilter({
              dateField: "apply_date",
              dateFrom: getTodayStr(),
              dateTo: getTodayStr(),
            })
          }
        />
        <KpiCard
          label="개통 대기"
          value={kpis.waiting}
          icon={CalendarClock}
          tone="amber"
          onClick={() => applyKpiFilter({ status: "접수완료" })}
        />
        <KpiCard
          label="오늘 3S 개통"
          value={kpis.openedToday3S}
          icon={Wifi}
          tone="green"
          onClick={() =>
            applyKpiFilter({
              status: "개통완료",
              category: "3S",
              dateField: "open_date",
              dateFrom: getTodayStr(),
              dateTo: getTodayStr(),
            })
          }
        />
        <KpiCard
          label="오늘 백메가 개통"
          value={kpis.openedTodayBaekMega}
          icon={Wifi}
          tone="green"
          onClick={() =>
            applyKpiFilter({
              status: "개통완료",
              category: "백메가",
              dateField: "open_date",
              dateFrom: getTodayStr(),
              dateTo: getTodayStr(),
            })
          }
        />
        <KpiCard
          label="이번 달 3S 개통"
          value={kpis.openedMonth3S}
          icon={CheckCircle2}
          tone="green"
          onClick={() => {
            const { from, to } = getMonthRange();
            applyKpiFilter({
              status: "개통완료",
              category: "3S",
              dateField: "open_date",
              dateFrom: from,
              dateTo: to,
            });
          }}
        />
        <KpiCard
          label="이번 달 백메가 개통"
          value={kpis.openedMonthBaekMega}
          icon={CheckCircle2}
          tone="green"
          onClick={() => {
            const { from, to } = getMonthRange();
            applyKpiFilter({
              status: "개통완료",
              category: "백메가",
              dateField: "open_date",
              dateFrom: from,
              dateTo: to,
            });
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="상호명, 대표자, 연락처, 지역..."
            className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <AppSelect
          value={statusFilter}
          onValueChange={setStatusFilter}
          aria-label="상태 필터"
          options={[
            { value: "", label: "상태 전체" },
            ...STATUSES.map((s) => ({ value: s, label: s })),
          ]}
        />
        <AppSelect
          value={categoryFilter}
          onValueChange={setCategoryFilter}
          aria-label="구분 필터"
          options={[
            { value: "", label: "구분 전체" },
            ...CATEGORIES.map((c) => ({ value: c, label: c })),
          ]}
        />
        <AppSelect
          value={dateField}
          onValueChange={(value) => setDateField(value as "apply_date" | "open_date")}
          aria-label="날짜 기준"
          options={[
            { value: "apply_date", label: "접수일 기준" },
            { value: "open_date", label: "개통일 기준" },
          ]}
        />
        <DatePickerField value={dateFrom} onChange={setDateFrom} ariaLabel="시작일" />
        <span className="text-slate-400 text-sm">~</span>
        <DatePickerField value={dateTo} onChange={setDateTo} ariaLabel="종료일" />
        {(search || statusFilter || categoryFilter || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setCategoryFilter("");
              setDateField("apply_date");
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
            disabled={deleting}
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
        <CreateForm
          onSubmit={handleCreate}
          submitting={submitting}
          onClose={() => setShowForm(false)}
        />
      )}

      <div className="flex-1 overflow-auto border border-slate-200 rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm border-collapse" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 24 }} />
            <col style={{ width: 32 }} />
            <col style={{ width: 24 }} />
            {MAIN_COLUMNS.map((col) => (
              <col
                key={col.key}
                style={{ width: colWidths[col.key] ?? DEFAULT_WIDTHS[col.key] ?? 140 }}
              />
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
                  title="이 페이지 전체 선택 (필터링된 전체가 아님)"
                />
              </th>
              <th className="px-3 py-3 border-b border-slate-200" />
              {MAIN_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  title={col.label}
                  className="relative text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap overflow-hidden text-ellipsis select-none"
                >
                  {col.label}
                  <div
                    onMouseDown={(e) => startResize(e, col.key)}
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
                  onClick={() => toggleExpand(row.id)}
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
                        : "검색/필터 중에는 순서를 변경할 수 없습니다"
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
                  {MAIN_COLUMNS.map((col) => {
                    const options = SELECT_OPTIONS[col.key];
                    return (
                      <td
                        key={col.key}
                        className="px-3 py-3 whitespace-nowrap overflow-hidden text-ellipsis"
                      >
                        {options ? (
                          <SelectField
                            row={row}
                            field={col.key}
                            options={options}
                            onSave={saveField}
                            pill
                          />
                        ) : (
                          <EditableText row={row} field={col.key} onSave={saveField} />
                        )}
                      </td>
                    );
                  })}
                </tr>
                {expandedId === row.id && (
                  <tr className="bg-blue-50/50 border-b border-slate-100">
                    <td colSpan={MAIN_COLUMNS.length + 3} className="px-6 py-4">
                      <div className="grid grid-cols-4 gap-4">
                        {DETAIL_COLUMNS.map((col) => {
                          const options = SELECT_OPTIONS[col.key];
                          const wide = col.key === "memo";
                          return (
                            <div key={col.key} className={wide ? "col-span-4" : ""}>
                              <label className="text-xs font-semibold text-slate-400">
                                {col.label}
                              </label>
                              {col.key === "speed" ? (
                                <SpeedField row={row} onSave={saveField} />
                              ) : options ? (
                                <SelectField
                                  row={row}
                                  field={col.key}
                                  options={options}
                                  onSave={saveField}
                                />
                              ) : (
                                <EditableText row={row} field={col.key} onSave={saveField} />
                              )}
                            </div>
                          );
                        })}
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
                <td colSpan={MAIN_COLUMNS.length + 3} className="text-center text-slate-500 py-10">
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
              title={row.business_name || row.owner_name || ""}
              memo={row.memo}
              createdAt={row.created_at}
              onAddMemo={(value) =>
                saveField(
                  row,
                  "memo",
                  `${(row.memo ?? "").trim()}${(row.memo ?? "").trim() ? "\n" : ""}${value}`,
                )
              }
              onDeleteMemo={(newMemo) => saveField(row, "memo", newMemo)}
              onClose={() => setHistoryOpenId(null)}
            />
          );
        })()}
    </div>
  );
}
