"use client";

import { useState, useEffect, useRef, useMemo, useCallback, memo, Fragment } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  CalendarCheck,
  FileWarning,
  CheckCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPhone, formatBusinessNumber, formatDateText } from "@/lib/format";
import { useColumnWidths } from "@/hooks/useColumnWidths";
import { mergeRowsPreservingIdentity } from "@/lib/mergeRows";
import { deleteWooRows } from "./actions";
import type { WooCustomer } from "@/types";
import { useToast } from "@/components/ui/Toast";
import BulkDeleteActions from "@/components/ui/BulkDeleteActions";
import BulkConfirmDialog from "@/components/ui/BulkConfirmDialog";
import FormModal from "@/components/ui/FormModal";
import HistoryButton from "@/components/ui/HistoryButton";
import MemoHistoryPanel from "@/components/ui/MemoHistoryPanel";
import KpiCard from "@/components/ui/KpiCard";
import { AppSelect } from "@/components/ui/AppSelect";
import { CalendarPopoverButton } from "@/components/ui/DatePickerField";
import { kstDate } from "@/lib/date";

interface Props {
  rows: WooCustomer[];
  currentUserId: string;
  linkedInstalls?: Record<string, { id: string; status: string }>;
  initialHighlightId?: string;
}

const CATEGORIES = ["명의변경", "승계", "신규"];

const SELECT_OPTIONS: Partial<Record<keyof WooCustomer, string[]>> = {
  category: CATEGORIES,
  internet_type: ["3S", "백메가"],
  card_apply_status: ["가맹완료", "가맹미확인"],
  setting: ["PC세팅", "포스세팅"],
};

function cardApplyStatusColor(value: string) {
  if (value === "가맹완료") return "bg-green-50 text-green-600 border-green-200";
  if (value === "가맹미확인") return "bg-red-50 text-red-600 border-red-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

const DATE_FIELDS: (keyof WooCustomer)[] = [
  "received_date",
  "open_date",
  "internet_open_date",
  "card_apply_date",
  "pos_install_date",
];

const AUTO_FORMAT: Partial<Record<keyof WooCustomer, (raw: string) => string>> = {
  phone: formatPhone,
  business_number: formatBusinessNumber,
};

const EMPTY_FORM = {
  received_date: "",
  manager: "",
  category: "",
  business_name: "",
  owner_name: "",
  business_number: "",
  phone: "",
  internet_type: "",
  internet_note: "",
  internet_open_date: "",
  card_apply_date: "",
  card_apply_status: "",
  easy_payment: "",
  pos_install_date: "",
  install_schedule_note: "",
  setting: "",
  open_date: "",
  van_company: "",
  pos_program: "",
  product: "",
  address: "",
  memo: "",
};

const MAIN_COLUMNS: { key: keyof WooCustomer; label: string }[] = [
  { key: "category", label: "분류" },
  { key: "received_date", label: "접수날짜" },
  { key: "open_date", label: "오픈일" },
  { key: "business_name", label: "상호명" },
  { key: "owner_name", label: "대표자명" },
  { key: "phone", label: "연락처" },
  { key: "card_apply_status", label: "가맹여부" },
  { key: "setting", label: "세팅" },
  { key: "easy_payment", label: "간편결제" },
  { key: "internet_note", label: "인터넷 비고" },
];

const DETAIL_COLUMNS: { key: keyof WooCustomer; label: string }[] = [
  { key: "category", label: "분류" },
  { key: "received_date", label: "접수날짜" },
  { key: "manager", label: "담당자" },
  { key: "open_date", label: "오픈일" },
  { key: "business_name", label: "상호명" },
  { key: "owner_name", label: "대표자명" },
  { key: "business_number", label: "사업자번호" },
  { key: "phone", label: "연락처" },
  { key: "internet_type", label: "인터넷" },
  { key: "internet_note", label: "인터넷 비고" },
  { key: "internet_open_date", label: "인터넷 개통일자" },
  { key: "card_apply_date", label: "카드가맹 접수일자" },
  { key: "card_apply_status", label: "가맹여부" },
  { key: "easy_payment", label: "간편결제" },
  { key: "pos_install_date", label: "포스설치일" },
  { key: "install_schedule_note", label: "설치일정" },
  { key: "setting", label: "세팅" },
  { key: "van_company", label: "VAN" },
  { key: "pos_program", label: "포스프로그램" },
  { key: "product", label: "상품" },
  { key: "address", label: "주소" },
  { key: "memo", label: "비고" },
];

const COLUMNS = DETAIL_COLUMNS;

const DEFAULT_WIDTHS: Partial<Record<keyof WooCustomer, number>> = {
  category: 90,
  received_date: 100,
  open_date: 100,
  business_name: 160,
  owner_name: 100,
  phone: 130,
  card_apply_status: 100,
  setting: 90,
  easy_payment: 140,
  internet_note: 160,
};
const COL_WIDTHS_STORAGE_KEY = "woo_customers_col_widths";
const PAGE_SIZE = 50;
type SortKey = "created_at" | "open_date" | "received_date";

const EMPTY_STRING_FIELDS = new Set<keyof WooCustomer>([
  "business_name",
  "owner_name",
  "phone",
  "internet_note",
]);

function toStoredValue(field: keyof WooCustomer, value: string) {
  return EMPTY_STRING_FIELDS.has(field) ? value : value || null;
}

function compareCreatedAt(a: WooCustomer, b: WooCustomer) {
  return b.created_at.localeCompare(a.created_at);
}

function compareDateText(a: WooCustomer, b: WooCustomer, field: "open_date" | "received_date") {
  const aValue = (a[field] ?? "").trim();
  const bValue = (b[field] ?? "").trim();
  const rank = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? 0 : value ? 1 : 2);
  const aRank = rank(aValue);
  const bRank = rank(bValue);
  if (aRank !== bRank) return aRank - bRank;
  if (aRank === 0 && aValue !== bValue) return bValue.localeCompare(aValue);
  return compareCreatedAt(a, b);
}

interface EditableTextProps {
  row: WooCustomer;
  field: keyof WooCustomer;
  onSave: (row: WooCustomer, field: keyof WooCustomer, value: string) => void;
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

interface DateFieldProps {
  row: WooCustomer;
  field: keyof WooCustomer;
  onSave: (row: WooCustomer, field: keyof WooCustomer, value: string) => void;
}
const DateField = memo(function DateField({ row, field, onSave }: DateFieldProps) {
  const [value, setValue] = useState((row[field] as string) ?? "");

  function handlePick(next: string) {
    setValue(next);
    onSave(row, field, next);
  }

  return (
    <div className="flex items-center gap-1 w-full">
      <input
        value={value}
        onChange={(e) => setValue(formatDateText(e.target.value))}
        onBlur={() => {
          if (value !== ((row[field] as string) ?? "")) onSave(row, field, value);
        }}
        onClick={(e) => e.stopPropagation()}
        placeholder="날짜 또는 텍스트"
        className="w-full bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 -mx-1 text-sm"
      />
      <CalendarPopoverButton value={value} onSelect={handlePick} ariaLabel="날짜 선택" />
    </div>
  );
});

interface SelectFieldProps {
  row: WooCustomer;
  field: keyof WooCustomer;
  options: string[];
  onSave: (row: WooCustomer, field: keyof WooCustomer, value: string) => void;
  pill?: boolean;
}
const SelectField = memo(function SelectField({
  row,
  field,
  options,
  onSave,
  pill,
}: SelectFieldProps) {
  const pillColor =
    field === "card_apply_status"
      ? cardApplyStatusColor((row[field] as string) ?? "")
      : "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span onClick={(e) => e.stopPropagation()} className={pill ? "" : "block w-full"}>
      <AppSelect
        value={(row[field] as string) ?? ""}
        onValueChange={(value) => onSave(row, field, value)}
        aria-label={field}
        className={
          pill
            ? `h-auto rounded-full border pl-2.5 pr-1.5 py-1 text-xs font-medium ${pillColor}`
            : "h-auto w-full border-0 bg-transparent px-1 -mx-1 text-sm"
        }
        options={[{ value: "", label: "-" }, ...options.map((o) => ({ value: o, label: o }))]}
      />
    </span>
  );
});

interface DateFormFieldProps {
  value: string;
  onChange: (value: string) => void;
}
const DateFormField = memo(function DateFormField({ value, onChange }: DateFormFieldProps) {
  return (
    <div className="flex items-center gap-1">
      <input
        value={value}
        onChange={(e) => onChange(formatDateText(e.target.value))}
        placeholder="날짜 또는 텍스트"
        className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <CalendarPopoverButton value={value} onSelect={onChange} ariaLabel="날짜 선택" />
    </div>
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
    <FormModal title="정보 입력" onClose={onClose} maxWidthClassName="max-w-3xl">
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
        {COLUMNS.map((col) => {
          const options = SELECT_OPTIONS[col.key];
          return (
            <div key={col.key} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">{col.label}</label>
              {options ? (
                <AppSelect
                  value={form[col.key as keyof typeof form]}
                  onValueChange={(value) => setForm({ ...form, [col.key]: value })}
                  aria-label={col.label}
                  className="w-32"
                  options={[
                    { value: "", label: "선택 안함" },
                    ...options.map((o) => ({ value: o, label: o })),
                  ]}
                />
              ) : DATE_FIELDS.includes(col.key) ? (
                <DateFormField
                  value={form[col.key as keyof typeof form]}
                  onChange={(v) => setForm({ ...form, [col.key]: v })}
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

export default function WooClient({
  rows,
  currentUserId,
  linkedInstalls = {},
  initialHighlightId,
}: Props) {
  const toast = useToast();
  const router = useRouter();
  const [localRows, setLocalRows] = useState(rows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [localLinkedInstalls, setLocalLinkedInstalls] =
    useState<Record<string, { id: string; status: string }>>(linkedInstalls);
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [bulkTransferring, setBulkTransferring] = useState(false);
  const [bulkTransferConfirmOpen, setBulkTransferConfirmOpen] = useState(false);
  const { colWidths, startResize } = useColumnWidths(
    COL_WIDTHS_STORAGE_KEY,
    DEFAULT_WIDTHS as Record<string, number>,
  );

  useEffect(() => {
    setLocalRows((prev) => mergeRowsPreservingIdentity(prev, rows));
    setSelected(new Set());
  }, [rows]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("woo_customers-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "woo_customers" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newRow = payload.new as WooCustomer;
            setLocalRows((prev) =>
              prev.some((r) => r.id === newRow.id) ? prev : [newRow, ...prev],
            );
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as WooCustomer;
            setLocalRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as WooCustomer).id;
            setLocalRows((prev) => prev.filter((r) => r.id !== oldId));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = localRows.filter((row) => {
      if (categoryFilter && row.category !== categoryFilter) return false;
      if (term) {
        const haystack =
          `${row.business_name ?? ""} ${row.owner_name ?? ""} ${row.phone ?? ""} ${row.address ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
    return filtered.sort((a, b) =>
      sortKey === "created_at" ? compareCreatedAt(a, b) : compareDateText(a, b, sortKey),
    );
  }, [localRows, search, categoryFilter, sortKey]);

  const filterKey = `${search}|${categoryFilter}|${sortKey}`;
  const [pageResetKey, setPageResetKey] = useState(filterKey);
  if (filterKey !== pageResetKey) {
    setPageResetKey(filterKey);
    setPage(1);
  }

  const kpis = useMemo(() => {
    const now = new Date();
    const todayStr = kstDate(now);
    const in7 = new Date(now);
    in7.setDate(in7.getDate() + 7);
    const in7Str = kstDate(in7);
    return {
      today: localRows.filter((r) => r.received_date === todayStr).length,
      openSoon: localRows.filter(
        (r) => !!r.open_date && r.open_date >= todayStr && r.open_date <= in7Str,
      ).length,
      unconfirmed: localRows.filter((r) => r.card_apply_status === "가맹미확인").length,
      done: localRows.filter((r) => r.card_apply_status === "가맹완료").length,
    };
  }, [localRows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  if (page > totalPages) {
    setPage(totalPages);
  }
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const highlightAppliedRef = useRef(false);
  useEffect(() => {
    if (!initialHighlightId || highlightAppliedRef.current) return;
    const target = localRows.find((r) => r.id === initialHighlightId);
    if (!target) return;
    highlightAppliedRef.current = true;
    setSearch("");
    setCategoryFilter("");
    setExpandedId(target.id);
  }, [initialHighlightId, localRows]);

  useEffect(() => {
    if (!initialHighlightId) return;
    const idx = filteredRows.findIndex((r) => r.id === initialHighlightId);
    if (idx === -1) return;
    setPage(Math.floor(idx / PAGE_SIZE) + 1);
    setTimeout(() => {
      document.getElementById(`woo-row-${initialHighlightId}`)?.scrollIntoView({ block: "center" });
    }, 50);
  }, [initialHighlightId, filteredRows]);

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

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleDelete = useCallback(async () => {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}건을 삭제하시겠습니까?`)) return;
    setDeleting(true);
    const { error } = await deleteWooRows([...selected]);
    setDeleting(false);
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
    const payload = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, toStoredValue(k as keyof WooCustomer, v)]),
    );
    const { error } = await supabase.from("woo_customers").insert(payload);
    setSubmitting(false);
    if (error) {
      toast.error("등록 실패: " + error.message);
      return;
    }
    setShowForm(false);
  }, []);

  function classifyTransfer(row: WooCustomer): "insert" | "skip" {
    return localLinkedInstalls[row.id] ? "skip" : "insert";
  }

  function hasIdentity(row: WooCustomer): boolean {
    return !!(row.business_name || row.owner_name || row.phone);
  }

  function summarizeRows(targetRows: WooCustomer[]): string {
    const first = targetRows[0]?.business_name || targetRows[0]?.owner_name || "미입력";
    return targetRows.length > 1 ? `${first} 외 ${targetRows.length - 1}건` : first;
  }

  function buildInstallPayload(row: WooCustomer) {
    const noteParts = [
      row.memo?.trim(),
      row.setting ? `세팅: ${row.setting}` : null,
      row.pos_program ? `포스프로그램: ${row.pos_program}` : null,
    ].filter((v): v is string => !!v);
    return {
      customer_name: row.business_name || row.owner_name || "미입력",
      customer_phone: row.phone || null,
      items: [{ name: "프론트", quantity: 1 }],
      status: "received",
      notes: noteParts.length ? noteParts.join(" / ") : null,
      woo_customer_id: row.id,
      address: row.address || null,
      scheduled_date: null,
      created_by: currentUserId,
      sort_order: Date.now(),
    };
  }

  async function notifyTech(
    rowsToNotify: WooCustomer[],
    title: (row: WooCustomer) => string,
    body: string,
  ) {
    const supabase = createClient();
    const { data: techProfiles } = await supabase.from("profiles").select("id").eq("role", "tech");
    if (!techProfiles?.length) return;
    const notifyRows = rowsToNotify.flatMap((row) =>
      techProfiles.map((t) => ({
        user_id: t.id,
        type: "install_transfer",
        title: title(row),
        body,
      })),
    );
    const { error } = await supabase.from("notifications").insert(notifyRows);
    if (error) console.error("설치지원 알림 발송 실패:", error.message);
  }

  async function transferToInstall(row: WooCustomer) {
    if (classifyTransfer(row) === "skip") {
      toast.warning("이미 설치지원으로 이관된 건입니다.");
      return;
    }
    if (!hasIdentity(row)) {
      toast.warning("상호명·대표자명·연락처가 모두 없어 이관할 수 없습니다.");
      return;
    }
    const name = row.business_name || row.owner_name || "미입력";
    if (
      !confirm(
        `'${name}' 건을 설치지원으로 이관하시겠습니까?\n설치관리 탭에 새 설치건이 생성됩니다.`,
      )
    )
      return;
    setTransferringId(row.id);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("installations")
      .insert(buildInstallPayload(row))
      .select("id")
      .single();
    setTransferringId(null);
    if (error) {
      toast.error("이관 실패: " + error.message);
      return;
    }
    await notifyTech(
      [row],
      (r) => `[${r.business_name || r.owner_name || "미입력"}] 설치지원 이관`,
      "우국상에서 설치건을 이관했습니다. 설치관리를 확인해주세요.",
    );
    setLocalLinkedInstalls((prev) => ({ ...prev, [row.id]: { id: data.id, status: "received" } }));
    toast.success("설치지원으로 이관되었습니다.");
  }

  async function autoTransferOnCardDone(row: WooCustomer) {
    if (classifyTransfer(row) === "skip") return;
    if (!hasIdentity(row)) {
      toast.warning("상호명·대표자명·연락처가 모두 없어 설치지원 자동 이관을 건너뛰었습니다.");
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("installations")
      .insert(buildInstallPayload(row))
      .select("id")
      .single();
    if (error) {
      toast.error("설치지원 자동 이관 실패: " + error.message);
      return;
    }
    await notifyTech(
      [row],
      (r) => `[${r.business_name || r.owner_name || "미입력"}] 설치지원 자동 이관`,
      "가맹완료로 설치건이 자동 생성되었습니다. 설치관리를 확인해주세요.",
    );
    setLocalLinkedInstalls((prev) => ({ ...prev, [row.id]: { id: data.id, status: "received" } }));
    toast.success("가맹완료 처리되어 설치지원으로 자동 이관되었습니다.");
  }

  async function handleBulkTransfer() {
    const candidates = localRows.filter(
      (r) => selected.has(r.id) && classifyTransfer(r) === "insert",
    );
    const toInsert = candidates.filter(hasIdentity);
    const skippedNoIdentity = candidates.length - toInsert.length;
    if (toInsert.length === 0) {
      toast.warning("이관 가능한 건이 없습니다.");
      return;
    }
    setBulkTransferring(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("installations")
      .insert(toInsert.map((row) => buildInstallPayload(row)))
      .select("id, woo_customer_id");
    setBulkTransferring(false);
    if (error) {
      toast.error("일괄 이관 실패: " + error.message);
      return;
    }
    await notifyTech(
      toInsert,
      (r) => `[${r.business_name || r.owner_name || "미입력"}] 설치지원 이관`,
      "우국상에서 설치건을 일괄 이관했습니다. 설치관리를 확인해주세요.",
    );
    setLocalLinkedInstalls((prev) => {
      const next = { ...prev };
      for (const d of data ?? []) {
        if (d.woo_customer_id) next[d.woo_customer_id] = { id: d.id, status: "received" };
      }
      return next;
    });
    setSelected(new Set());
    toast.success(
      `${toInsert.length}건 이관 완료${skippedNoIdentity > 0 ? ` (식별정보 없어 ${skippedNoIdentity}건 제외)` : ""}`,
    );
  }

  const saveField = useCallback(
    async (row: WooCustomer, field: keyof WooCustomer, value: string) => {
      const previousValue = row[field];
      setLocalRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [field]: value } : r)));
      const supabase = createClient();
      const { error } = await supabase
        .from("woo_customers")
        .update({ [field]: toStoredValue(field, value) })
        .eq("id", row.id);
      if (error) {
        setLocalRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, [field]: previousValue } : r)),
        );
        toast.error("수정 실패: " + error.message);
        return;
      }
      if (field === "card_apply_status" && value === "가맹완료" && !localLinkedInstalls[row.id]) {
        await autoTransferOnCardDone(row);
      }
    },
    [toast, localLinkedInstalls, autoTransferOnCardDone],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-3">
        <KpiCard label="오늘 접수" value={kpis.today} icon={ClipboardList} tone="blue" />
        <KpiCard label="7일 내 오픈" value={kpis.openSoon} icon={CalendarCheck} tone="amber" />
        <KpiCard label="가맹 미확인" value={kpis.unconfirmed} icon={FileWarning} tone="red" />
        <KpiCard label="가맹 완료" value={kpis.done} icon={CheckCircle2} tone="green" />
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="상호명, 대표자, 연락처, 주소..."
            className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <AppSelect
          value={categoryFilter}
          onValueChange={setCategoryFilter}
          aria-label="분류 필터"
          options={[
            { value: "", label: "분류 전체" },
            ...CATEGORIES.map((c) => ({ value: c, label: c })),
          ]}
        />
        <AppSelect
          value={sortKey}
          onValueChange={(value) => setSortKey(value as SortKey)}
          aria-label="정렬 기준"
          options={[
            { value: "created_at", label: "등록일" },
            { value: "open_date", label: "오픈일" },
            { value: "received_date", label: "접수날짜" },
          ]}
        />
        {(search || categoryFilter) && (
          <button
            onClick={() => {
              setSearch("");
              setCategoryFilter("");
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
        <BulkDeleteActions
          count={selected.size}
          deleting={deleting}
          onDelete={handleDelete}
          onCancel={() => setSelected(new Set())}
        >
          <button
            onClick={() => setBulkTransferConfirmOpen(true)}
            className="text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            일괄 설치지원 이관
          </button>
        </BulkDeleteActions>
      )}

      {(() => {
        const targetRows = localRows.filter((r) => selected.has(r.id));
        const toInsert = targetRows.filter((r) => classifyTransfer(r) === "insert");
        const toSkip = targetRows.filter((r) => classifyTransfer(r) === "skip");
        const groups = [
          { key: "insert", label: `이관 ${toInsert.length}건`, rows: toInsert },
          { key: "skip", label: `이미 이관됨 ${toSkip.length}건`, rows: toSkip },
        ].filter((g) => g.rows.length > 0);
        return (
          <BulkConfirmDialog
            open={bulkTransferConfirmOpen}
            title="일괄 설치지원 이관"
            busy={bulkTransferring}
            confirmText="이관"
            subtitle={`총 ${toInsert.length}건 이관을 진행합니다.`}
            confirmQuestion="이관하시겠습니까?"
            items={groups.map((g) => ({
              id: g.key,
              label: g.label,
              detail: summarizeRows(g.rows),
            }))}
            onCancel={() => setBulkTransferConfirmOpen(false)}
            onConfirm={async () => {
              setBulkTransferConfirmOpen(false);
              await handleBulkTransfer();
            }}
          />
        );
      })()}

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
              <th className="px-3 py-3 border-b border-slate-200">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
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
                  id={`woo-row-${row.id}`}
                  className={`border-b border-slate-100 transition-colors cursor-pointer ${
                    localLinkedInstalls[row.id]?.status === "completed"
                      ? "bg-green-50 hover:bg-green-100"
                      : "hover:bg-blue-50"
                  }`}
                  onClick={() => toggleExpand(row.id)}
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
                        ) : DATE_FIELDS.includes(col.key) ? (
                          <DateField row={row} field={col.key} onSave={saveField} />
                        ) : (
                          <EditableText row={row} field={col.key} onSave={saveField} />
                        )}
                      </td>
                    );
                  })}
                </tr>
                {expandedId === row.id && (
                  <tr key={`${row.id}-expand`} className="bg-blue-50/50 border-b border-slate-100">
                    <td colSpan={MAIN_COLUMNS.length + 2} className="px-6 py-4">
                      <div className="grid grid-cols-4 gap-4">
                        {DETAIL_COLUMNS.map((col) => {
                          const options = SELECT_OPTIONS[col.key];
                          const wide = [
                            "internet_note",
                            "install_schedule_note",
                            "address",
                            "memo",
                          ].includes(col.key);
                          return (
                            <div key={col.key} className={wide ? "col-span-4" : ""}>
                              <label className="text-xs font-semibold text-slate-400">
                                {col.label}
                              </label>
                              {options ? (
                                <SelectField
                                  row={row}
                                  field={col.key}
                                  options={options}
                                  onSave={saveField}
                                />
                              ) : DATE_FIELDS.includes(col.key) ? (
                                <DateField row={row} field={col.key} onSave={saveField} />
                              ) : (
                                <EditableText row={row} field={col.key} onSave={saveField} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <div>
                          {localLinkedInstalls[row.id] ? (
                            <button
                              onClick={() => router.push("/installs")}
                              className={`text-xs font-semibold px-2.5 py-1 rounded-lg border cursor-pointer hover:opacity-80 transition-opacity ${
                                localLinkedInstalls[row.id].status === "completed"
                                  ? "bg-green-50 text-green-600 border-green-200"
                                  : "bg-purple-50 text-purple-600 border-purple-200"
                              }`}
                            >
                              {localLinkedInstalls[row.id].status === "completed"
                                ? "설치완료 →"
                                : "설치지원 이관됨 →"}
                            </button>
                          ) : (
                            <button
                              onClick={() => transferToInstall(row)}
                              disabled={transferringId === row.id}
                              className="text-xs font-semibold bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 disabled:opacity-50"
                            >
                              {transferringId === row.id ? "처리 중..." : "설치지원 이관"}
                            </button>
                          )}
                        </div>
                        <HistoryButton onClick={() => setHistoryOpenId(row.id)} />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={MAIN_COLUMNS.length + 2} className="text-center text-slate-400 py-10">
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
