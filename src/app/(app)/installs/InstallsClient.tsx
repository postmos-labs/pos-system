"use client";

import { useState, useMemo, useEffect, useCallback, useRef, memo, Fragment } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatPhone, thumbUrl } from "@/lib/format";
import { useColumnWidths } from "@/hooks/useColumnWidths";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  Plus,
  Search,
  RefreshCw,
  Download,
  GripVertical,
  Trash2,
  ChevronDown,
  Percent,
} from "lucide-react";
import type { Profile, FranchiseApplication } from "@/types";
import { FRANCHISE_STATUS_LABEL } from "@/types";
import { useToast } from "@/components/ui/Toast";
import BulkConfirmDialog from "@/components/ui/BulkConfirmDialog";
import { NotificationHistory } from "@/components/ui/NotificationHistory";
import FormModal from "@/components/ui/FormModal";
import MemoHistoryPanel from "@/components/ui/MemoHistoryPanel";
import InstallationPostHistoryPanel from "@/components/ui/InstallationPostHistoryPanel";
import RateBadge from "@/components/ui/RateBadge";
import InstallationActivityHistory from "@/components/ui/InstallationActivityHistory";
import ApprovalNoteTimeline from "@/components/ui/ApprovalNoteTimeline";
import { appendApprovalNote, type ApprovalNote } from "@/lib/approvalNotes";
import { AppSelect } from "@/components/ui/AppSelect";
import { DatePickerField, CalendarPopoverButton } from "@/components/ui/DatePickerField";
import { PRODUCT_CATALOG, QtyStepper, InstallItemsEditor } from "./InstallItemsEditor";
import {
  approveInstallationCompletion,
  approveInstallationStatusByTeamLead,
  changeInstallationAssignment,
  changeInstallationStatus,
  createInstallation,
  deleteInstallations,
  rejectInstallationStatusApproval,
  requestInstallationCompletion,
  requestInstallationStatusApproval,
  rescheduleInstallationByTeamLead,
  sendInstallTransitNotice,
} from "./actions";
import type { MerchantEquipmentItem } from "../merchants/merchant360";
import InstallDetailDrawer, { type InstallFranchiseDetail } from "./InstallDetailDrawer";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  statusLabel,
  statusOrderFor,
  APPROVAL_TARGETS,
  type DeliveryType,
  DELIVERY_TYPE_LABELS,
  DELIVERY_TYPE_BADGE_COLORS,
  DELIVERY_TYPE_SOLID_COLORS,
  deliveryTypeOf,
} from "./installStatus";

// merchants/loadMerchant360.ts의 fetchEquipmentRows와 같은 컬럼 세트. 114번 마이그레이션 미적용
// 환경(카테고리/수량 등 컬럼 없음)에서도 가맹접수 원본 정보 드로어가 깨지지 않도록 기본 컬럼으로
// 재조회한다.
const EQUIPMENT_COLUMNS_EXTENDED =
  "id,name,serial_number,status,installed_date,notes,created_at,category,quantity,components,manufacturer,supplier,location,source";
const EQUIPMENT_COLUMNS_BASE = "id,name,serial_number,status,installed_date,notes,created_at";
function isMissingEquipmentColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist/i.test(error.message ?? "")
  );
}

export interface Installation {
  id: string;
  customer_name: string;
  contact_name?: string;
  customer_phone?: string;
  items: { name: string; quantity: number }[];
  status: string;
  assigned_to?: string;
  notes?: string;
  completion_photo_urls?: string[];
  status_token: string;
  created_by?: string;
  created_at: string;
  assignee?: { name: string } | null;
  creator?: { name: string } | null;
  franchise_application_id?: string;
  woo_customer_id?: string;
  address?: string;
  delivery_type?: string;
  scheduled_date?: string;
  scheduled_time?: string;
  tracking_number?: string;
  sort_order?: number | null;
  last_notify_status?: string;
  last_notify_at?: string;
}

interface Props {
  profile: Profile;
  techUsers: { id: string; name: string }[];
  initialInstalls: Installation[];
  mineOnly?: boolean;
  deliveryOnly?: boolean;
  initialHighlightId?: string;
  initialCompletionApprovals: Record<string, CompletionApproval>;
  initialApprovalNoteHistory?: Record<string, ApprovalNote[]>;
  initialDeliveryStats?: { total: number; completed: number };
}

export type CompletionApproval = {
  installation_id: string;
  status: "requested" | "responsible_approved" | "approved";
  target_status: string;
  request_payload?: {
    scheduled_date?: string;
    scheduled_time?: string;
    eta?: string;
    skip_notify?: boolean;
  };
  requested_by: string;
  requested_by_name: string;
  responsible_approved_by_name?: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  approval_notes: ApprovalNote[];
};

const PAGE_SIZE = 50;
const FETCH_LIMIT = 300;

const MAIN_COLUMNS = [
  { key: "name", label: "상호명" },
  { key: "delivery_type", label: "구분" },
  { key: "phone", label: "전화번호" },
  { key: "tracking_number", label: "송장번호" },
  { key: "items", label: "제품" },
  { key: "status", label: "상태" },
  { key: "tech", label: "담당기사" },
  { key: "notes", label: "비고" },
  { key: "date", label: "등록일" },
] as const;
const DEFAULT_WIDTHS: Record<string, number> = {
  name: 140,
  delivery_type: 90,
  phone: 120,
  tracking_number: 140,
  items: 160,
  status: 110,
  tech: 90,
  notes: 150,
  date: 100,
};
const COL_WIDTHS_STORAGE_KEY = "installs_col_widths";

interface CreateFormProps {
  techUsers: { id: string; name: string }[];
  onSubmit: (v: {
    customerName: string;
    contactName: string;
    customerPhone: string;
    address: string;
    assignedTo: string;
    notes: string;
    items: { name: string; quantity: number }[];
    deliveryType: DeliveryType;
    scheduledDate: string;
    scheduledTime: string;
  }) => Promise<void>;
  submitting: boolean;
  onCancel: () => void;
  onClose: () => void;
  deliveryOnly?: boolean;
  initial?: {
    customerName: string;
    contactName: string;
    customerPhone: string;
    address: string;
    deliveryType: DeliveryType;
  };
}
const CreateForm = memo(function CreateForm({
  techUsers,
  onSubmit,
  submitting,
  onCancel,
  onClose,
  deliveryOnly,
  initial,
}: CreateFormProps) {
  const [form, setForm] = useState({
    customerName: initial?.customerName ?? "",
    contactName: initial?.contactName ?? "",
    customerPhone: initial?.customerPhone ?? "",
    address: initial?.address ?? "",
    assignedTo: "",
    notes: "",
    scheduledDate: "",
    scheduledTime: "",
  });
  const [deliveryType, setDeliveryType] = useState<DeliveryType>(
    initial?.deliveryType ?? (deliveryOnly ? "delivery" : "install"),
  );
  const [cartProduct, setCartProduct] = useState(PRODUCT_CATALOG[0]);
  const [cartCustomName, setCartCustomName] = useState("");
  const [cartQty, setCartQty] = useState(1);
  const [cartItems, setCartItems] = useState<{ name: string; quantity: number }[]>([]);

  function addToCart() {
    const name = cartCustomName.trim() || cartProduct;
    if (!name) return;
    setCartItems((prev) => {
      const existing = prev.find((i) => i.name === name);
      if (existing)
        return prev.map((i) => (i.name === name ? { ...i, quantity: i.quantity + cartQty } : i));
      return [...prev, { name, quantity: cartQty }];
    });
    setCartQty(1);
    setCartCustomName("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit({
      customerName: form.customerName,
      contactName: form.contactName,
      customerPhone: form.customerPhone,
      address: form.address,
      assignedTo: form.assignedTo,
      notes: form.notes,
      items: cartItems,
      deliveryType,
      scheduledDate: form.scheduledDate,
      scheduledTime: form.scheduledTime,
    });
    setForm({
      customerName: "",
      contactName: "",
      customerPhone: "",
      address: "",
      assignedTo: "",
      notes: "",
      scheduledDate: "",
      scheduledTime: "",
    });
    setDeliveryType(deliveryOnly ? "delivery" : "install");
    setCartItems([]);
  }

  return (
    <FormModal
      title={deliveryOnly ? "새 택배발송건 등록" : "새 설치건 등록"}
      onClose={onClose}
      maxWidthClassName="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {!deliveryOnly && (
          <div className="flex gap-2">
            {(["install", "delivery", "name_change", "transfer", "as"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDeliveryType(t)}
                className={`text-xs font-semibold px-4 py-2 rounded-lg border transition-colors ${deliveryType === t ? DELIVERY_TYPE_SOLID_COLORS[t] : "bg-white text-slate-500 border-slate-200"}`}
              >
                {DELIVERY_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">상호명 *</label>
            <input
              required
              value={form.customerName}
              onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
              className={INPUT}
              placeholder="가맹점 상호명"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">고객명</label>
            <input
              value={form.contactName}
              onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
              className={INPUT}
              placeholder="홍길동"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">전화번호</label>
            <input
              value={form.customerPhone}
              onChange={(e) =>
                setForm((f) => ({ ...f, customerPhone: formatPhone(e.target.value) }))
              }
              className={INPUT}
              placeholder="01012345678"
            />
          </div>
          {techUsers.length > 0 && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">담당 기사</label>
              <AppSelect
                value={form.assignedTo}
                onValueChange={(value) => setForm((f) => ({ ...f, assignedTo: value }))}
                aria-label="담당 기사"
                className="w-full"
                options={[
                  { value: "", label: "미배정" },
                  ...techUsers.map((t) => ({ value: t.id, label: t.name })),
                ]}
              />
            </div>
          )}
          <div className="col-span-2">
            <label className="block text-xs text-slate-500 mb-1">주소</label>
            <input
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className={INPUT}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">설치 예정일</label>
            <DatePickerField
              value={form.scheduledDate}
              onChange={(value) => setForm((f) => ({ ...f, scheduledDate: value }))}
              ariaLabel="설치 예정일"
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">희망 시간대</label>
            <input
              type="time"
              value={form.scheduledTime}
              onChange={(e) => setForm((f) => ({ ...f, scheduledTime: e.target.value }))}
              className={INPUT}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">비고</label>
            <input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={INPUT}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-slate-500 mb-1">제품 추가</label>
            <div className="flex gap-2">
              <AppSelect
                value={cartProduct}
                onValueChange={(value) => {
                  setCartProduct(value);
                  setCartCustomName("");
                }}
                aria-label="제품 선택"
                className="w-full"
                options={PRODUCT_CATALOG.map((p) => ({ value: p, label: p }))}
              />
              <QtyStepper value={cartQty} onChange={setCartQty} />
              <button
                type="button"
                onClick={addToCart}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
              >
                추가
              </button>
            </div>
            <input
              value={cartCustomName}
              onChange={(e) => setCartCustomName(e.target.value)}
              placeholder="목록에 없는 제품은 직접 입력"
              className="mt-1.5 border border-slate-200 rounded-lg px-3 py-2 text-sm w-full"
            />
            {cartItems.length > 0 && (
              <ul className="mt-2 space-y-1">
                {cartItems.map((it) => (
                  <li
                    key={it.name}
                    className="flex justify-between items-center bg-slate-50 rounded-lg px-3 py-2 text-sm gap-2"
                  >
                    <span className="flex-1">{it.name}</span>
                    <QtyStepper
                      size="sm"
                      value={it.quantity}
                      onChange={(q) =>
                        setCartItems((prev) =>
                          prev.map((i) => (i.name === it.name ? { ...i, quantity: q } : i)),
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setCartItems((prev) => prev.filter((i) => i.name !== it.name))}
                      className="text-red-400 text-xs"
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {submitting ? "등록 중..." : "등록"}
          </button>
        </div>
      </form>
    </FormModal>
  );
});

const EditableInstallText = memo(function EditableInstallText({
  value,
  onSave,
  inputRef,
}: {
  value: string;
  onSave: (v: string) => void;
  inputRef?: (el: HTMLInputElement | null) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      ref={inputRef}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== value) onSave(text);
      }}
      onClick={(e) => e.stopPropagation()}
      className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
    />
  );
});

export default function InstallsClient({
  profile,
  techUsers,
  initialInstalls,
  mineOnly,
  deliveryOnly,
  initialHighlightId,
  initialCompletionApprovals,
  initialApprovalNoteHistory = {},
  initialDeliveryStats = { total: 0, completed: 0 },
}: Props) {
  const canEdit = ["tech", "cs", "admin", "master"].includes(profile.role);
  const canDelete = profile.role === "admin" || profile.role === "master" || !!profile.can_delete;
  const toast = useToast();
  const router = useRouter();
  const [installs, setInstalls] = useState<Installation[]>(initialInstalls);
  const [deliveryStats, setDeliveryStats] = useState(initialDeliveryStats);
  const [loading, setLoading] = useState(false);
  const [hitFetchLimit, setHitFetchLimit] = useState(initialInstalls.length >= FETCH_LIMIT);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [detailInst, setDetailInst] = useState<Installation | null>(null);
  const [detailDraft, setDetailDraft] = useState<{
    customer_name: string;
    contact_name: string;
    customer_phone: string;
    address: string;
    scheduled_date: string;
    scheduled_time: string;
    items: { name: string; quantity: number }[];
    notes: string;
  } | null>(null);
  const [completeModal, setCompleteModal] = useState<{ id: string; notes: string } | null>(null);
  const completeNotesRef = useRef<HTMLTextAreaElement>(null);
  const [completePhotos, setCompletePhotos] = useState<File[]>([]);
  const [completing, setCompleting] = useState(false);
  const [completionApprovals, setCompletionApprovals] = useState(initialCompletionApprovals);
  const [approvalNoteHistory, setApprovalNoteHistory] = useState(initialApprovalNoteHistory);
  const completingRef = useRef(false);
  const [rejectModal, setRejectModal] = useState<{ id: string; reason: string } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [transitModal, setTransitModal] = useState<{ id: string; eta: string } | null>(null);
  const [transitNoticeModal, setTransitNoticeModal] = useState<{ id: string; eta: string } | null>(
    null,
  );
  const [sendingTransitNotice, setSendingTransitNotice] = useState(false);
  const [mobileExpandedId, setMobileExpandedId] = useState<string | null>(null);
  const highlightId =
    initialHighlightId ??
    (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("id") : null);
  const highlightAppliedRef = useRef(false);
  useEffect(() => {
    if (!highlightId || highlightAppliedRef.current) return;
    const target = installs.find((i) => i.id === highlightId);
    if (!target) return;
    highlightAppliedRef.current = true;
    setMobileExpandedId(highlightId);
    openInstallDetail(target);
    setSearch("");
    setStatusFilter("");
    setTechFilter("");
    setDateFrom("");
    setDateTo("");
    setDeliveryTab("all");
    if (target.status === "rejected") setShowRejected(true);
    if (target.status === "completed") setShowCompleted(true);
    document.getElementById(`install-card-${highlightId}`)?.scrollIntoView({ block: "center" });
  }, [highlightId, installs]);
  const [createPrefill, setCreatePrefill] = useState<{
    customerName: string;
    contactName: string;
    customerPhone: string;
    address: string;
    deliveryType: DeliveryType;
  } | null>(null);
  const prefillAppliedRef = useRef(false);
  useEffect(() => {
    if (prefillAppliedRef.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const newParam = params.get("new");
    if (newParam !== "as" && newParam !== "delivery") return;
    prefillAppliedRef.current = true;
    const merchantId = params.get("merchantId");

    async function loadPrefill() {
      let seed = {
        customerName: "",
        contactName: "",
        customerPhone: "",
        address: "",
        deliveryType: newParam as DeliveryType,
      };
      if (merchantId) {
        const supabase = createClient();
        const { data } = await supabase
          .from("merchants")
          .select("business_name, contact_name, contact_phone, phone, address, address_detail")
          .eq("id", merchantId)
          .maybeSingle();
        if (data) {
          seed = {
            customerName: data.business_name ?? "",
            contactName: data.contact_name ?? "",
            customerPhone: data.contact_phone ?? data.phone ?? "",
            address: [data.address, data.address_detail].filter(Boolean).join(" "),
            deliveryType: newParam as DeliveryType,
          };
        }
      }
      setCreatePrefill(seed);
      setShowForm(true);
      router.replace(window.location.pathname);
    }
    loadPrefill();
  }, [router]);
  const [sendingTransit, setSendingTransit] = useState(false);
  const [scheduleModal, setScheduleModal] = useState<{
    id: string;
    date: string;
    time: string;
    isReschedule?: boolean;
  } | null>(null);
  const [sendingSchedule, setSendingSchedule] = useState(false);
  const [editingNotes, setEditingNotes] = useState<{ id: string; value: string } | null>(null);
  const [todayScheduled, setTodayScheduled] = useState<
    { id: string; business_name?: string; owner_name?: string }[]
  >([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [techFilter, setTechFilter] = useState("");
  const [showRejected, setShowRejected] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [franchiseDetail, setFranchiseDetail] = useState<InstallFranchiseDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  // 가맹접수 원본 정보 섹션에서 함께 보여주는 실제 설치 구성(merchant_equipment) 상태.
  // franchise_application_id -> merchants 역조회로 구한 merchantId가 null이면 연결된 가맹점이
  // 없다는 뜻 — InstallCompositionSection이 이 경우 저장을 막고 이유를 보여준다.
  const [compositionMerchantId, setCompositionMerchantId] = useState<string | null>(null);
  const [compositionEquipment, setCompositionEquipment] = useState<MerchantEquipmentItem[]>([]);
  const [deliveryTab, setDeliveryTab] = useState<"all" | DeliveryType>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [checklistItems, setChecklistItems] = useState<{ label: string; checked: boolean }[]>([]);
  const [showMonthlyStats, setShowMonthlyStats] = useState(false);
  const [skipNotify, setSkipNotify] = useState(false);
  const [rowDragId, setRowDragId] = useState<string | null>(null);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [postHistoryOpenId, setPostHistoryOpenId] = useState<string | null>(null);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [notePrompt, setNotePrompt] = useState<{
    title: string;
    placeholder?: string;
    value: string;
  } | null>(null);
  const notePromptResolveRef = useRef<((value: string | null) => void) | null>(null);
  const { colWidths, startResize } = useColumnWidths(COL_WIDTHS_STORAGE_KEY, DEFAULT_WIDTHS);

  function promptNote(title: string, options?: { placeholder?: string }): Promise<string | null> {
    return new Promise((resolve) => {
      notePromptResolveRef.current = resolve;
      setNotePrompt({ title, placeholder: options?.placeholder, value: "" });
    });
  }

  function resolveNotePrompt(value: string | null) {
    const resolve = notePromptResolveRef.current;
    notePromptResolveRef.current = null;
    setNotePrompt(null);
    resolve?.(value);
  }

  const supabase = createClient();

  function buildDetailDraft(inst: Installation) {
    return {
      customer_name: inst.customer_name,
      contact_name: inst.contact_name ?? "",
      customer_phone: inst.customer_phone ?? "",
      address: inst.address ?? "",
      scheduled_date: inst.scheduled_date ?? "",
      scheduled_time: inst.scheduled_time ?? "",
      items: inst.items ?? [],
      notes: inst.notes ?? "",
    };
  }

  async function fetchInstalls() {
    setLoading(true);
    let query = supabase
      .from("installations")
      .select(
        "*, assignee:profiles!installations_assigned_to_fkey(name), creator:profiles!installations_created_by_fkey(name)",
      );
    if (deliveryOnly) query = query.eq("delivery_type", "delivery");
    else query = query.neq("delivery_type", "delivery");
    const { data } = await query
      .order("sort_order", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(FETCH_LIMIT);
    setInstalls((data as any) ?? []);
    setHitFetchLimit((data?.length ?? 0) >= FETCH_LIMIT);
    setLoading(false);
    if (!deliveryOnly && !mineOnly) {
      const { data: deliveryRows } = await supabase
        .from("installations")
        .select("status")
        .eq("delivery_type", "delivery");
      setDeliveryStats({
        total: deliveryRows?.length ?? 0,
        completed: (deliveryRows ?? []).filter((row) => row.status === "completed").length,
      });
    }
  }

  async function openFranchiseDetail(franchiseId: string) {
    setLoadingDetail(true);
    setFranchiseDetail({});
    setCompositionMerchantId(null);
    setCompositionEquipment([]);
    const [{ data }, { data: merchantRow }] = await Promise.all([
      supabase
        .from("franchise_applications")
        .select(
          "*, sales:profiles!franchise_applications_sales_id_fkey(name), cs:profiles!franchise_applications_cs_id_fkey(name)",
        )
        .eq("id", franchiseId)
        .single(),
      // 실제 설치 구성(merchant_equipment)의 정본은 merchant_id 기준이라, 이 설치건이 연결된
      // franchise_application_id로 merchants를 역조회해야 한다(merchants-360/decisions.md).
      supabase
        .from("merchants")
        .select("id")
        .eq("franchise_application_id", franchiseId)
        .maybeSingle(),
    ]);
    setFranchiseDetail((data as InstallFranchiseDetail | null) ?? null);
    setLoadingDetail(false);

    const merchantId = merchantRow?.id ?? null;
    setCompositionMerchantId(merchantId);
    if (!merchantId) return;

    const extended = await supabase
      .from("merchant_equipment")
      .select(EQUIPMENT_COLUMNS_EXTENDED)
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false });
    const rows = isMissingEquipmentColumnError(extended.error)
      ? await supabase
          .from("merchant_equipment")
          .select(EQUIPMENT_COLUMNS_BASE)
          .eq("merchant_id", merchantId)
          .order("created_at", { ascending: false })
      : extended;
    setCompositionEquipment((rows.data ?? []) as unknown as MerchantEquipmentItem[]);
  }

  // 설치건 상세 드로어를 연다. 가맹접수 원본 조회(openFranchiseDetail)는 원래 "가맹접수" 버튼을
  // 눌렀을 때만 수행했지만, 이제 드로어 하나에서 두 정보를 같이 보여주므로 드로어가 열리는
  // 시점에 함께 수행한다. 조회 자체(쿼리)는 그대로다.
  function openInstallDetail(inst: Installation) {
    setDetailDraft(buildDetailDraft(inst));
    setDetailInst(inst);
    if (inst.franchise_application_id) {
      openFranchiseDetail(inst.franchise_application_id);
    } else {
      setFranchiseDetail(null);
      setLoadingDetail(false);
      setCompositionMerchantId(null);
      setCompositionEquipment([]);
    }
  }

  function closeInstallDetail() {
    setDetailInst(null);
    setDetailDraft(null);
    setFranchiseDetail(null);
    setLoadingDetail(false);
    setCompositionMerchantId(null);
    setCompositionEquipment([]);
  }

  async function handleCreate(newInstall: {
    customerName: string;
    contactName: string;
    customerPhone: string;
    address: string;
    assignedTo: string;
    notes: string;
    items: { name: string; quantity: number }[];
    deliveryType: DeliveryType;
    scheduledDate: string;
    scheduledTime: string;
  }) {
    if (!newInstall.customerName) return;
    setSubmitting(true);
    const result = await createInstallation({
      customerName: newInstall.customerName,
      contactName: newInstall.contactName || null,
      customerPhone: newInstall.customerPhone ? formatPhone(newInstall.customerPhone) : null,
      address: newInstall.address || null,
      items: newInstall.items,
      assignedTo: newInstall.assignedTo || null,
      notes: newInstall.notes || null,
      deliveryType: newInstall.deliveryType,
      scheduledDate: newInstall.scheduledDate || null,
      scheduledTime: newInstall.scheduledTime || null,
    });
    setSubmitting(false);
    if (result.error || !result.installation) {
      toast.error("등록 실패: " + (result.error ?? "알 수 없는 오류"));
      return;
    }
    setShowForm(false);
    setPage(1);
    const assignee = newInstall.assignedTo
      ? (techUsers.find((t) => t.id === newInstall.assignedTo) ?? null)
      : null;
    setInstalls((prev) => [
      { ...result.installation, assignee, creator: { name: profile.name } } as Installation,
      ...prev,
    ]);
  }

  async function handleStatusChange(id: string, status: string) {
    if (status === "completed") {
      const inst = installs.find((i) => i.id === id);
      setChecklistItems(
        inst?.delivery_type === "as"
          ? []
          : [
              { label: "전원 정상 확인", checked: false },
              { label: "영수증 프린터 테스트", checked: false },
              { label: "카드단말기 연결", checked: false },
              { label: "설치사진 촬영", checked: false },
              { label: "고객 서명/동의", checked: false },
            ],
      );
      setCompleteModal({ id, notes: inst?.notes ?? "" });
      setCompletePhotos([]);
      return;
    }
    if (status === "in_transit") {
      setTransitModal({ id, eta: "" });
      return;
    }
    if (status === "scheduled") {
      const inst = installs.find((i) => i.id === id);
      setScheduleModal({ id, date: inst?.scheduled_date ?? "", time: inst?.scheduled_time ?? "" });
      return;
    }
    if (status === "reschedule") {
      const inst = installs.find((i) => i.id === id);
      setScheduleModal({
        id,
        date: inst?.scheduled_date ?? "",
        time: inst?.scheduled_time ?? "",
        isReschedule: true,
      });
      return;
    }
    if (APPROVAL_TARGETS.has(status)) {
      await requestStepApproval(id, status);
      return;
    }
    const result = await changeInstallationStatus({ installationId: id, status, skipNotify });
    if (result.error) {
      toast.error("상태 변경 실패: " + result.error);
      return;
    }
    setInstalls((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
  }

  function pendingApproval(
    installationId: string,
    targetStatus: string,
    note: string,
    status: "requested" | "responsible_approved",
    requestPayload: CompletionApproval["request_payload"] = {},
  ): CompletionApproval {
    return {
      installation_id: installationId,
      status,
      target_status: targetStatus,
      request_payload: requestPayload,
      requested_by: profile.id,
      requested_by_name: profile.name,
      responsible_approved_by_name: status === "responsible_approved" ? profile.name : null,
      approved_by: null,
      approved_by_name: null,
      approval_notes: appendApprovalNote(
        [],
        { id: profile.id, name: profile.name, role: profile.approval_role ?? "tech_manager" },
        note,
        "request",
      ),
    };
  }

  const approvalRequestPrompt =
    profile.approval_role === "tech_responsible"
      ? "팀장에게 전달할 비고를 입력해주세요."
      : "기술지원책임에게 전달할 비고를 입력해주세요.";

  async function requestStepApproval(id: string, targetStatus: string) {
    const note = await promptNote(approvalRequestPrompt);
    if (note === null) return false;
    const result = await requestInstallationStatusApproval({
      installationId: id,
      targetStatus,
      note,
      skipNotify,
    });
    if (result.error) {
      toast.error("승인요청 실패: " + result.error);
      return false;
    }
    const nextApproval = pendingApproval(
      id,
      targetStatus,
      note,
      result.approvalStatus ?? "requested",
    );
    setCompletionApprovals((prev) => ({ ...prev, [id]: nextApproval }));
    setApprovalNoteHistory((prev) => ({
      ...prev,
      [id]: [...(prev[id] ?? []), ...nextApproval.approval_notes],
    }));
    if (result.notificationError)
      toast.warning("승인요청은 등록됐지만 팝업 알림에 실패했습니다: " + result.notificationError);
    toast.success(
      `${statusLabel(targetStatus)} ${result.approvalStatus === "responsible_approved" ? "최종" : "1차"} 승인을 요청했습니다.`,
    );
    return true;
  }

  async function submitTransit(skipEta?: boolean, skipSend?: boolean) {
    if (!transitModal) return;
    setSendingTransit(true);
    try {
      const { id, eta } = transitModal;
      const sendEta = skipEta ? undefined : eta.trim() || undefined;
      const result = await changeInstallationStatus({
        installationId: id,
        status: "in_transit",
        eta: sendEta,
        skipNotify: skipNotify || !!skipSend,
      });
      if (result.error) {
        toast.error("이동중 처리 실패: " + result.error);
        return;
      }
      setInstalls((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: "in_transit" } : item)),
      );
      setTransitModal(null);
      if (result.notificationError)
        toast.warning("상태는 변경됐지만 알림톡 발송에 실패했습니다: " + result.notificationError);
      toast.success("이동중 상태로 변경했습니다.");
    } catch (e) {
      toast.error(
        "이동중 처리 중 오류가 발생했습니다: " + (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setSendingTransit(false);
    }
  }

  async function submitTransitNotice() {
    if (!transitNoticeModal) return;
    setSendingTransitNotice(true);
    try {
      const { id, eta } = transitNoticeModal;
      const result = await sendInstallTransitNotice(id, eta.trim() || undefined);
      if (result.error) {
        toast.error("이동중 알림톡 발송 실패: " + result.error);
        return;
      }
      setTransitNoticeModal(null);
      toast.success("이동중 알림톡을 발송했습니다.");
    } catch (e) {
      toast.error(
        "이동중 알림톡 발송 중 오류가 발생했습니다: " +
          (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setSendingTransitNotice(false);
    }
  }

  async function submitSchedule() {
    if (!scheduleModal) return;
    const { id, date, time, isReschedule } = scheduleModal;
    if (!date.trim()) return;
    setSendingSchedule(true);
    const effectiveSkipNotify = isReschedule ? true : skipNotify;

    if (profile.approval_role === "team_lead") {
      const note = await promptNote("변경 사유를 입력해주세요.");
      if (note === null) {
        setSendingSchedule(false);
        return;
      }
      const result = await rescheduleInstallationByTeamLead({
        installationId: id,
        scheduledDate: date,
        scheduledTime: time,
        note,
        skipNotify: effectiveSkipNotify,
      });
      if (result.error) {
        setSendingSchedule(false);
        toast.error("일정 변경 실패: " + result.error);
        return;
      }
      setInstalls((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, status: "scheduled", scheduled_date: date, scheduled_time: time }
            : item,
        ),
      );
      setScheduleModal(null);
      setSendingSchedule(false);
      if (result.notificationError)
        toast.warning("일정은 변경됐지만 알림톡 발송에 실패했습니다: " + result.notificationError);
      toast.success("일정이 변경되었습니다.");
      return;
    }

    const note = await promptNote(approvalRequestPrompt);
    if (note === null) {
      setSendingSchedule(false);
      return;
    }
    const result = await requestInstallationStatusApproval({
      installationId: id,
      targetStatus: "scheduled",
      scheduledDate: date,
      scheduledTime: time,
      skipNotify: effectiveSkipNotify,
      note,
    });
    if (result.error) {
      setSendingSchedule(false);
      toast.error("일정 승인요청 실패: " + result.error);
      return;
    }
    const nextApproval = pendingApproval(
      id,
      "scheduled",
      note,
      result.approvalStatus ?? "requested",
      { scheduled_date: date, scheduled_time: time, skip_notify: effectiveSkipNotify },
    );
    setCompletionApprovals((prev) => ({ ...prev, [id]: nextApproval }));
    setApprovalNoteHistory((prev) => ({
      ...prev,
      [id]: [...(prev[id] ?? []), ...nextApproval.approval_notes],
    }));
    setScheduleModal(null);
    setSendingSchedule(false);
    if (result.notificationError)
      toast.warning("승인요청은 등록됐지만 팝업 알림에 실패했습니다: " + result.notificationError);
    toast.success(
      `일정확정 ${result.approvalStatus === "responsible_approved" ? "최종" : "1차"} 승인을 요청했습니다.`,
    );
  }

  async function submitReject() {
    if (!rejectModal) return;
    setRejecting(true);
    const { id, reason } = rejectModal;
    const result = await changeInstallationStatus({
      installationId: id,
      status: "rejected",
      notes: reason,
      skipNotify: true,
    });
    if (result.error) {
      setRejecting(false);
      toast.error("반려 처리 실패: " + result.error);
      return;
    }
    setInstalls((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: "rejected", notes: reason || i.notes } : i)),
    );
    setRejectModal(null);
    setRejecting(false);

    const inst = installs.find((i) => i.id === id);
    if (inst?.franchise_application_id) {
      const { data: fa } = await supabase
        .from("franchise_applications")
        .select("cs_id, business_name, owner_name, status")
        .eq("id", inst.franchise_application_id)
        .single();

      const name = fa?.business_name || fa?.owner_name || "미입력";

      if (fa) {
        await supabase.from("franchise_application_logs").insert({
          franchise_application_id: inst.franchise_application_id,
          user_id: profile.id,
          from_status: fa.status,
          to_status: "install_rejected",
        });
      }

      const notifyTargets: string[] = [];
      if (fa?.cs_id) {
        notifyTargets.push(fa.cs_id);
      } else {
        const { data: csProfiles } = await supabase.from("profiles").select("id").eq("role", "cs");
        csProfiles?.forEach((u) => notifyTargets.push(u.id));
      }
      if (notifyTargets.length) {
        const { error: notifyError } = await supabase.from("notifications").insert(
          notifyTargets.map((uid) => ({
            user_id: uid,
            franchise_application_id: inst.franchise_application_id,
            type: "install_rejected",
            title: `[${name}] 기술지원 반려`,
            body: reason
              ? `반려 사유: ${reason}`
              : "기술지원팀에서 설치건을 반려했습니다. 가맹접수를 확인해주세요.",
          })),
        );
        if (notifyError) console.error("반려 알림 발송 실패:", notifyError.message);
      }
    }
  }

  async function submitCompletion(skipCompleteSend?: boolean) {
    if (!completeModal) return;
    if (!["tech", "admin", "master"].includes(profile.role)) {
      toast.warning("설치완료 승인요청은 기술지원팀만 등록할 수 있습니다.");
      return;
    }
    if (completingRef.current) return;
    completingRef.current = true;
    setCompleting(true);
    const { id } = completeModal;
    const notes = completeNotesRef.current?.value ?? completeModal.notes;
    const approvalNote = notes.trim();
    const prevInst = installs.find((i) => i.id === id);
    const prevNotes = (prevInst?.notes ?? "").trim();
    const saveValue = computeStampedNotes(prevNotes, notes);

    const photoUrls: string[] = [];
    for (const [i, file] of completePhotos.entries()) {
      const ext = file.name.split(".").pop() ?? "jpg";

      const path = `${id}/${Date.now()}-${i}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("install-photos")
        .upload(path, file);
      if (uploadError) {
        toast.error("사진 업로드 실패: " + uploadError.message);
        setCompleting(false);
        completingRef.current = false;
        return;
      }
      const {
        data: { publicUrl },
      } = supabase.storage.from("install-photos").getPublicUrl(path);
      photoUrls.push(publicUrl);
    }

    const { error } = await supabase
      .from("installations")
      .update({
        notes: saveValue,
        completion_photo_urls: photoUrls,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      toast.error("완료정보 저장 실패: " + error.message);
      setCompleting(false);
      completingRef.current = false;
      return;
    }

    const approvalResult = await requestInstallationCompletion(
      id,
      approvalNote,
      skipNotify || !!skipCompleteSend,
    );
    if (approvalResult.error) {
      toast.error("설치완료 승인요청 실패: " + approvalResult.error);
      setCompleting(false);
      completingRef.current = false;
      return;
    }
    if ("notificationError" in approvalResult && approvalResult.notificationError) {
      toast.warning(
        "승인요청은 등록됐지만 승인자 팝업 알림에 실패했습니다: " +
          approvalResult.notificationError,
      );
    }
    const approval = pendingApproval(
      id,
      "completed",
      approvalNote,
      approvalResult.approvalStatus ?? "requested",
      {
        skip_notify: skipNotify || !!skipCompleteSend,
      },
    );
    setInstalls((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, notes: saveValue ?? undefined, completion_photo_urls: photoUrls } : i,
      ),
    );
    setCompletionApprovals((prev) => ({ ...prev, [id]: approval }));
    setApprovalNoteHistory((prev) => ({
      ...prev,
      [id]: [...(prev[id] ?? []), ...approval.approval_notes],
    }));
    setCompleteModal(null);
    setCompletePhotos([]);
    setCompleting(false);
    completingRef.current = false;
    toast.success(
      approvalResult.approvalStatus === "responsible_approved"
        ? "설치완료 최종 승인을 요청했습니다. 팀장 승인이 필요합니다."
        : "설치완료 승인을 요청했습니다. 기술지원책임 1차 승인과 팀장 최종 승인이 필요합니다.",
    );
    return;
    /* Legacy direct-completion side effects are intentionally deferred until approval. */
    /*
    const inst = installs.find(i => i.id === id)

    if (inst && inst.status !== 'completed' && inst.items?.length) {
      const { data: unmatched, error: deductError } = await supabase.rpc('deduct_inventory_on_install', {
        p_items: inst.items,
        p_install_id: id,
        p_note: `설치완료 자동차감 (${inst.customer_name})`,
      })
      if (deductError) {
        toast.error('재고 자동차감 실패: ' + deductError.message)
      } else if (unmatched && unmatched.length > 0) {
        toast.warning('재고에서 찾지 못해 차감되지 않은 품목: ' + unmatched.map((u: { unmatched_name: string }) => u.unmatched_name).join(', '))
      }
    }
    if (inst?.franchise_application_id) {
      const { data: fa } = await supabase
        .from('franchise_applications')
        .select('cs_id, sales_id, business_name, owner_name, status, phone, business_number, address, address_detail, equipment_items, memo')
        .eq('id', inst.franchise_application_id)
        .single()
      const name = fa?.business_name || fa?.owner_name || '미입력'

      if (fa) {
        await autoRegisterMerchant({ ...fa, id: inst.franchise_application_id } as FranchiseApplication, toast)
      }

      const notifyTargets = [...new Set([fa?.cs_id, fa?.sales_id].filter(Boolean) as string[])]
      if (notifyTargets.length) {
        const { error: notifyError } = await supabase.from('notifications').insert(notifyTargets.map(uid => ({
          user_id: uid,
          franchise_application_id: inst.franchise_application_id,
          type: 'install_completed',
          title: `[${name}] 설치완료`,
          body: '기술지원팀에서 설치를 완료했습니다.',
        })))
        if (notifyError) console.error('완료 알림 발송 실패:', notifyError.message)
      }
    }
    */
  }

  async function approveCompletion(id: string) {
    const approval = completionApprovals[id];
    if (!approval || !["requested", "responsible_approved"].includes(approval.status)) return;
    const isResponsible =
      approval.status === "requested" &&
      (profile.approval_role === "tech_responsible" || profile.approval_role === "team_lead");
    const isTeamLead =
      profile.approval_role === "team_lead" && approval.status === "responsible_approved";
    if (!isResponsible && !isTeamLead) {
      toast.warning("현재 승인 단계의 권한이 없습니다.");
      return;
    }
    if (approval.requested_by === profile.id) {
      toast.warning("요청자는 직접 승인할 수 없습니다.");
      return;
    }
    const note = await promptNote(
      isResponsible ? "팀장에게 전달할 비고를 입력해주세요." : "최종 전달 비고를 입력해주세요.",
    );
    if (note === null) return;
    setCompleting(true);
    const result = isResponsible
      ? await approveInstallationCompletion(id, note)
      : await approveInstallationStatusByTeamLead(id, note);
    if (result.error) {
      setCompleting(false);
      toast.error("승인 실패: " + result.error);
      return;
    }
    if (isResponsible) {
      const approvalNotes = appendApprovalNote(
        approval.approval_notes,
        { id: profile.id, name: profile.name, role: profile.approval_role ?? "tech_responsible" },
        note,
        "first_approval",
      );
      setCompletionApprovals((prev) => ({
        ...prev,
        [id]: {
          ...approval,
          status: "responsible_approved",
          responsible_approved_by_name: profile.name,
          approval_notes: approvalNotes,
        },
      }));
      setApprovalNoteHistory((prev) => ({
        ...prev,
        [id]: [
          ...(prev[id] ?? []).filter(
            (item) => !approval.approval_notes.some((current) => current.id === item.id),
          ),
          ...approvalNotes,
        ],
      }));
    } else {
      const approvalNotes = appendApprovalNote(
        approval.approval_notes,
        { id: profile.id, name: profile.name, role: "team_lead" },
        note,
        "final_approval",
      );
      setApprovalNoteHistory((prev) => ({
        ...prev,
        [id]: [
          ...(prev[id] ?? []).filter(
            (item) => !approval.approval_notes.some((current) => current.id === item.id),
          ),
          ...approvalNotes,
        ],
      }));
      setCompletionApprovals((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setInstalls((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                status: approval.target_status,
                ...(approval.target_status === "scheduled"
                  ? {
                      scheduled_date: approval.request_payload?.scheduled_date,
                      scheduled_time: approval.request_payload?.scheduled_time,
                    }
                  : {}),
              }
            : item,
        ),
      );
    }
    setCompleting(false);
    if (result.notificationError)
      toast.warning(
        `${isResponsible ? "팀장 팝업 알림" : "알림톡"} 처리에 실패했습니다: ` +
          result.notificationError,
      );
    toast.success(
      isResponsible
        ? "1차 승인 완료. 팀장 최종 승인을 기다립니다."
        : `${statusLabel(approval.target_status)} 최종 승인 및 상태 반영이 완료됐습니다.`,
    );
  }

  async function rejectCompletion(id: string) {
    const approval = completionApprovals[id];
    if (!approval || !["requested", "responsible_approved"].includes(approval.status)) return;
    const canReject =
      (approval.status === "requested" &&
        (profile.approval_role === "tech_responsible" || profile.approval_role === "team_lead")) ||
      (profile.approval_role === "team_lead" && approval.status === "responsible_approved");
    if (!canReject) {
      toast.warning("현재 승인 단계의 권한이 없습니다.");
      return;
    }
    if (approval.requested_by === profile.id) {
      toast.warning("요청자는 직접 반려할 수 없습니다.");
      return;
    }
    const reason = await promptNote("반려 사유를 입력해주세요.", {
      placeholder: "반려 사유 (선택 사항, 비워두어도 반려할 수 있습니다)",
    });
    if (reason === null) return;
    setCompleting(true);
    const result = await rejectInstallationStatusApproval(id, reason);
    setCompleting(false);
    if (result.error) {
      toast.error("반려 실패: " + result.error);
      return;
    }
    if (result.notificationError)
      toast.warning(
        "반려 처리되었지만 요청자 알림 전송에 실패했습니다: " + result.notificationError,
      );
    setCompletionApprovals((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    toast.success("승인 요청을 반려했습니다.");
  }

  function computeStampedNotes(prevNotes: string, notes: string): string | null {
    let saveValue: string | null = notes || null;
    if (notes && prevNotes) {
      if (notes.startsWith(prevNotes)) {
        const added = notes.slice(prevNotes.length).replace(/^\n+/, "");
        if (!added.trim()) {
          saveValue = prevNotes;
        } else {
          const stamp = `[${profile.name} ${new Date().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}]`;
          saveValue = `${prevNotes}\n${stamp} ${added}`;
        }
      }
    } else if (notes && !prevNotes) {
      const stamp = `[${profile.name} ${new Date().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}]`;
      saveValue = `${stamp} ${notes}`;
    }
    return saveValue;
  }

  async function saveNotes(id: string, notes: string, raw?: boolean) {
    const prev = installs.find((i) => i.id === id);
    const prevNotes = (prev?.notes ?? "").trim();
    // 메모 삭제 등 이미 완성된 원본 텍스트를 그대로 저장할 때는 스탬프 로직을 건너뛴다
    const saveValue = raw ? notes || null : computeStampedNotes(prevNotes, notes);
    const { error } = await supabase
      .from("installations")
      .update({ notes: saveValue })
      .eq("id", id);
    if (error) {
      toast.error("수정 실패: " + error.message);
      return false;
    }
    setInstalls((prev) =>
      prev.map((i) => (i.id === id ? { ...i, notes: saveValue ?? undefined } : i)),
    );
    setEditingNotes(null);
    return true;
  }

  async function saveInstallField(
    id: string,
    field:
      | "customer_name"
      | "contact_name"
      | "customer_phone"
      | "address"
      | "delivery_type"
      | "scheduled_date"
      | "scheduled_time"
      | "tracking_number"
      | "notes",
    value: string,
  ) {
    if (field === "notes") return saveNotes(id, value);
    const saveValue =
      field === "customer_phone" ? (value ? formatPhone(value) : null) : value || null;
    const { error } = await supabase
      .from("installations")
      .update({ [field]: saveValue })
      .eq("id", id);
    if (error) {
      toast.error("수정 실패: " + error.message);
      return false;
    }
    setInstalls((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: saveValue ?? undefined } : i)),
    );
    return true;
  }

  async function saveInstallItems(id: string, items: { name: string; quantity: number }[]) {
    const { error } = await supabase.from("installations").update({ items }).eq("id", id);
    if (error) {
      toast.error("수정 실패: " + error.message);
      return;
    }
    setInstalls((prev) => prev.map((i) => (i.id === id ? { ...i, items } : i)));
  }

  async function saveRowNow(id: string) {
    if (savingRowId) return;
    const inst = installs.find((i) => i.id === id);
    if (!inst || !detailDraft) return;
    const tasks: Promise<boolean>[] = [];
    if (detailDraft.customer_name !== inst.customer_name)
      tasks.push(saveInstallField(id, "customer_name", detailDraft.customer_name));
    if (detailDraft.contact_name !== (inst.contact_name ?? ""))
      tasks.push(saveInstallField(id, "contact_name", detailDraft.contact_name));
    if (detailDraft.customer_phone !== (inst.customer_phone ?? ""))
      tasks.push(saveInstallField(id, "customer_phone", detailDraft.customer_phone));
    if (detailDraft.address !== (inst.address ?? ""))
      tasks.push(saveInstallField(id, "address", detailDraft.address));
    if (detailDraft.scheduled_date !== (inst.scheduled_date ?? ""))
      tasks.push(saveInstallField(id, "scheduled_date", detailDraft.scheduled_date));
    if (detailDraft.scheduled_time !== (inst.scheduled_time ?? ""))
      tasks.push(saveInstallField(id, "scheduled_time", detailDraft.scheduled_time));
    if (detailDraft.notes !== (inst.notes ?? ""))
      tasks.push(saveInstallField(id, "notes", detailDraft.notes));
    if (JSON.stringify(detailDraft.items) !== JSON.stringify(inst.items ?? [])) {
      tasks.push(saveInstallItems(id, detailDraft.items).then(() => true));
    }
    if (tasks.length === 0) {
      toast.success("변경사항이 없습니다");
      return;
    }
    setSavingRowId(id);
    const results = await Promise.all(tasks);
    setSavingRowId(null);
    if (results.every(Boolean)) toast.success("저장되었습니다");
  }

  async function handleAssign(id: string, assignedTo: string) {
    const prev = installs.find((i) => i.id === id);
    const result = await changeInstallationAssignment(id, assignedTo || null);
    if (result.error) {
      toast.error("배정 실패: " + result.error);
      return;
    }
    const assignee = assignedTo ? (techUsers.find((t) => t.id === assignedTo) ?? null) : null;
    setInstalls((prevList) =>
      prevList.map((i) =>
        i.id === id ? { ...i, assigned_to: assignedTo || undefined, assignee } : i,
      ),
    );
    if (assignedTo && assignedTo !== prev?.assigned_to) {
      const { error: notifyError } = await supabase.from("notifications").insert({
        user_id: assignedTo,
        type: "install_assigned",
        title: "설치 배정",
        body: `${prev?.customer_name ?? "고객"} 설치건이 배정되었습니다.`,
      });
      if (notifyError) console.error("배정 알림 발송 실패:", notifyError.message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("삭제하시겠습니까?")) return;
    const { error } = await deleteInstallations([id]);
    if (error) {
      toast.error("삭제 실패: " + error);
      return;
    }
    setInstalls((prev) => prev.filter((i) => i.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const deletableInstalls = pagedInstalls.filter((i) => !i.franchise_application_id);
    setSelected((prev) => {
      if (deletableInstalls.length > 0 && deletableInstalls.every((i) => prev.has(i.id))) {
        const next = new Set(prev);
        deletableInstalls.forEach((i) => next.delete(i.id));
        return next;
      }
      return new Set([...prev, ...deletableInstalls.map((i) => i.id)]);
    });
  }

  function handleBulkDelete() {
    if (selected.size === 0) return;
    setBulkDeleteConfirmOpen(true);
  }

  async function confirmBulkDelete() {
    setDeletingSelected(true);
    const ids = [...selected];
    const { error } = await deleteInstallations(ids);
    setDeletingSelected(false);
    setBulkDeleteConfirmOpen(false);
    if (error) {
      toast.error("삭제 실패: " + error);
      return;
    }
    setInstalls((prev) => prev.filter((i) => !selected.has(i.id)));
    setSelected(new Set());
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/install-status/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("고객 조회 링크가 복사됐습니다.");
  }

  function handleExcel() {
    import("xlsx").then((XLSX) => {
      const rows = filteredInstalls.map((i) => ({
        상호명: i.customer_name,
        고객명: i.contact_name ?? "",
        전화번호: i.customer_phone ?? "",
        주소: i.address ?? "",
        제품: i.items.map((it) => `${it.name} x${it.quantity}`).join(", "),
        상태: statusLabel(i.status, i.delivery_type),
        담당자: (i.assignee as any)?.name ?? "",
        비고: i.notes ?? "",
        등록일: format(new Date(i.created_at), "yyyy-MM-dd HH:mm", { locale: ko }),
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "설치관리");
      XLSX.writeFile(wb, `설치관리_${format(new Date(), "yyyyMMdd")}.xlsx`);
    });
  }

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    const lastCheck = localStorage.getItem("install_schedule_check");
    if (lastCheck === today) return;
    async function checkToday() {
      const { data } = await supabase
        .from("franchise_applications")
        .select("id, business_name, owner_name")
        .eq("install_date", today);
      if (data && data.length > 0) {
        setTodayScheduled(data);
        localStorage.setItem("install_schedule_check", today);
      }
    }
    checkToday();
  }, []);

  const assignCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const inst of installs) {
      if (inst.assigned_to && inst.status !== "completed" && inst.status !== "rejected") {
        counts[inst.assigned_to] = (counts[inst.assigned_to] ?? 0) + 1;
      }
    }
    return counts;
  }, [installs]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of installs) counts[i.status] = (counts[i.status] ?? 0) + 1;
    return counts;
  }, [installs]);

  const techProfiles = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    for (const i of installs) {
      const assignee = (i as unknown as { assignee?: { name?: string } }).assignee;
      if (i.assigned_to && !seen.has(i.assigned_to)) {
        seen.add(i.assigned_to);
        list.push({ id: i.assigned_to, name: assignee?.name ?? i.assigned_to });
      }
    }
    return list;
  }, [installs]);

  const monthlyStats = useMemo(() => {
    const stats: Record<string, { total: number; completed: number }> = {};
    for (const i of installs) {
      const m = i.created_at.slice(0, 7);
      if (!stats[m]) stats[m] = { total: 0, completed: 0 };
      stats[m].total++;
      if (i.status === "completed") stats[m].completed++;
    }
    return Object.entries(stats)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6);
  }, [installs]);

  const techStats = useMemo(() => {
    const stats: Record<string, { name: string; total: number; completed: number }> = {};
    for (const i of installs) {
      if (!i.assigned_to) continue;
      if (!stats[i.assigned_to]) {
        const name = (i as any).assignee?.name ?? i.assigned_to;
        stats[i.assigned_to] = { name, total: 0, completed: 0 };
      }
      stats[i.assigned_to].total++;
      if (i.status === "completed") stats[i.assigned_to].completed++;
    }
    return Object.values(stats).sort((a, b) => b.completed - a.completed);
  }, [installs]);

  const filteredInstalls = useMemo(() => {
    const q = search.trim().toLowerCase();
    return installs.filter((i) => {
      if (!deliveryOnly && (i as any).delivery_type === "delivery") return false;
      if (deliveryOnly && (i as any).delivery_type !== "delivery") return false;
      if (
        !deliveryOnly &&
        deliveryTab !== "all" &&
        deliveryTypeOf((i as any).delivery_type) !== deliveryTab
      )
        return false;
      if (!showRejected && i.status === "rejected" && statusFilter !== "rejected") return false;
      if (!showCompleted && i.status === "completed" && statusFilter !== "completed") return false;
      if (statusFilter && i.status !== statusFilter) return false;
      if (techFilter && i.assigned_to !== techFilter) return false;
      if (dateFrom && i.created_at < dateFrom) return false;
      if (dateTo && i.created_at > dateTo + "T23:59:59") return false;
      if (
        q &&
        !(
          i.customer_name?.toLowerCase().includes(q) ||
          i.contact_name?.toLowerCase().includes(q) ||
          i.customer_phone?.toLowerCase().includes(q) ||
          i.items?.some((it) => it.name.toLowerCase().includes(q))
        )
      )
        return false;
      return true;
    });
  }, [
    installs,
    search,
    statusFilter,
    techFilter,
    showRejected,
    showCompleted,
    deliveryTab,
    dateFrom,
    dateTo,
    mineOnly,
    deliveryOnly,
  ]);

  const canReorder =
    !search.trim() &&
    !statusFilter &&
    !techFilter &&
    !dateFrom &&
    !dateTo &&
    deliveryTab === "all" &&
    !showRejected &&
    !showCompleted;

  const columns = MAIN_COLUMNS;

  const reorderInstalls = useCallback(
    (dragId: string, dropId: string) => {
      if (dragId === dropId) return;
      const from = installs.findIndex((i) => i.id === dragId);
      const to = installs.findIndex((i) => i.id === dropId);
      if (from === -1 || to === -1) return;
      const next = [...installs];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setInstalls(next);
      const n = next.length;
      Promise.all(
        next.map((r, i) =>
          supabase
            .from("installations")
            .update({ sort_order: (n - i) * 1000 })
            .eq("id", r.id),
        ),
      ).catch(() => toast.error("순서 저장에 실패했습니다."));
    },
    [installs, supabase, toast],
  );

  const pagedInstalls = filteredInstalls.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // installs 배열이 최신 상태(예: 상태 변경, 필드 저장)를 갖고 있으므로 detailInst 스냅샷이
  // 아니라 여기서 다시 찾은 값을 드로어에 넘긴다. 인라인 확장 행이던 시절엔 installs.map의
  // 루프 변수를 그대로 썼던 것과 동일한 효과.
  const activeDetailInst = detailInst
    ? (installs.find((item) => item.id === detailInst.id) ?? null)
    : null;

  useEffect(() => {
    if (!highlightId) return;
    const idx = filteredInstalls.findIndex((i) => i.id === highlightId);
    if (idx === -1) return;
    setPage(Math.floor(idx / PAGE_SIZE) + 1);
    setTimeout(() => {
      document.getElementById(`install-row-${highlightId}`)?.scrollIntoView({ block: "center" });
    }, 50);
  }, [highlightId, filteredInstalls]);
  const totalPages = Math.ceil(filteredInstalls.length / PAGE_SIZE);

  const thisMonth = installs.filter((i) => {
    const d = new Date(i.created_at);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;

  const installCompletionStats = useMemo(() => {
    const installOnly = installs.filter((i) => deliveryTypeOf(i.delivery_type) === "install");
    const total = installOnly.length;
    const completed = installOnly.filter((i) => i.status === "completed").length;
    return { total, completed, rate: total > 0 ? Math.round((completed / total) * 100) : null };
  }, [installs]);

  const deliveryCompletionRate =
    deliveryStats.total > 0
      ? Math.round((deliveryStats.completed / deliveryStats.total) * 100)
      : null;

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-5">
      {}
      {skipNotify && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm text-red-700 font-semibold">
          ⚠ 알림 건너뛰기가 켜져 있습니다 — 상태를 변경해도 고객에게 알림톡이 발송되지 않습니다.
          <button
            onClick={() => setSkipNotify(false)}
            className="ml-auto text-xs font-semibold underline underline-offset-2 hover:text-red-900"
          >
            지금 끄기
          </button>
        </div>
      )}
      {}
      {hitFetchLimit && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-700">
          최근 {FETCH_LIMIT}건만 불러왔습니다. 그보다 오래된 건은 검색/필터에 나타나지 않을 수
          있습니다.
        </div>
      )}
      {}
      {todayScheduled.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-amber-600 font-bold text-sm">
            오늘 설치 예정 {todayScheduled.length}건
          </span>
          <span className="text-amber-500 text-xs">
            {todayScheduled.map((f) => f.business_name || f.owner_name || "미입력").join(" · ")}
          </span>
          <button
            onClick={() => setTodayScheduled([])}
            className="ml-auto text-amber-400 hover:text-amber-600 text-xs"
          >
            닫기
          </button>
        </div>
      )}

      {}
      {!mineOnly && techUsers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {techUsers.map((t) => (
            <button
              key={t.id}
              onClick={() => setTechFilter((prev) => (prev === t.id ? "" : t.id))}
              className={`text-xs rounded-lg px-3 py-1.5 flex items-center gap-1.5 border transition-colors ${techFilter === t.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600"}`}
            >
              <span>{t.name}</span>
              <span
                className={`font-bold ${techFilter === t.id ? "text-blue-100" : "text-blue-600"}`}
              >
                {assignCounts[t.id] ?? 0}건
              </span>
            </button>
          ))}
          {techFilter && (
            <button
              onClick={() => setTechFilter("")}
              className="text-xs text-slate-400 hover:text-red-500 px-2 py-1.5 transition-colors"
            >
              ✕ 필터 해제
            </button>
          )}
        </div>
      )}

      {activeDetailInst && (
        <InstallDetailDrawer
          key={activeDetailInst.id}
          installation={activeDetailInst}
          canEdit={canEdit}
          canDelete={canDelete}
          profile={profile}
          draft={detailDraft}
          onDraftChange={(patch) => setDetailDraft((d) => (d ? { ...d, ...patch } : d))}
          saving={savingRowId === activeDetailInst.id}
          onSave={() => saveRowNow(activeDetailInst.id)}
          franchiseLoading={loadingDetail}
          franchiseDetail={franchiseDetail}
          merchantId={compositionMerchantId}
          equipment={compositionEquipment}
          approval={completionApprovals[activeDetailInst.id]}
          approvalNotes={approvalNoteHistory[activeDetailInst.id]}
          completing={completing}
          onApproveCompletion={() => approveCompletion(activeDetailInst.id)}
          onRejectCompletion={() => rejectCompletion(activeDetailInst.id)}
          onCopyLink={() => copyLink(activeDetailInst.status_token)}
          onReschedule={() => handleStatusChange(activeDetailInst.id, "reschedule")}
          onTechReject={() => setRejectModal({ id: activeDetailInst.id, reason: "" })}
          onDelete={() => handleDelete(activeDetailInst.id)}
          onOpenPostHistory={() => setPostHistoryOpenId(activeDetailInst.id)}
          onOpenHistory={() => setHistoryOpenId(activeDetailInst.id)}
          onOpenWoo={() => router.push("/woo")}
          onClose={closeInstallDetail}
        />
      )}

      {notePrompt && (
        <FormModal
          title={notePrompt.title}
          onClose={() => resolveNotePrompt(null)}
          zIndexClassName="z-[60]"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">비고</label>
              <textarea
                autoFocus
                value={notePrompt.value}
                onChange={(e) =>
                  setNotePrompt((prev) => (prev ? { ...prev, value: e.target.value } : prev))
                }
                maxLength={2000}
                rows={4}
                placeholder={notePrompt.placeholder ?? "내용을 입력해주세요. (선택 사항)"}
                className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <p className="mt-1 text-right text-xs text-slate-400">
                {notePrompt.value.length}/2,000
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => resolveNotePrompt(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => resolveNotePrompt(notePrompt.value.trim())}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                확인
              </button>
            </div>
          </div>
        </FormModal>
      )}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-80 flex flex-col gap-4">
            <p className="text-sm font-bold text-slate-800">반려 사유 입력</p>
            <textarea
              value={rejectModal.reason}
              onChange={(e) =>
                setRejectModal((prev) => (prev ? { ...prev, reason: e.target.value } : prev))
              }
              placeholder="반려 사유를 입력하세요 (선택)"
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <div className="flex flex-col gap-2">
              <button
                onClick={submitReject}
                disabled={rejecting}
                className="w-full py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50"
              >
                {rejecting ? "처리 중..." : "반려 확정"}
              </button>
              <button
                onClick={() => setRejectModal(null)}
                className="w-full py-2 rounded-lg text-slate-400 text-sm hover:text-slate-600"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
      {}
      {transitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-80 flex flex-col gap-4">
            <p className="text-sm font-bold text-slate-800">
              몇 시 방문 예정인가요? (설치 상태도 이동중으로 변경됩니다)
            </p>
            <input
              type="time"
              value={transitModal.eta}
              onChange={(e) =>
                setTransitModal((prev) => (prev ? { ...prev, eta: e.target.value } : prev))
              }
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <p className="text-xs text-slate-400 -mt-2">
              ※ 예정시각을 입력해야 알림톡이 발송됩니다.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => submitTransit(false)}
                disabled={sendingTransit}
                className="w-full py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
              >
                {sendingTransit ? "처리 중..." : "시각 기록하고 발송"}
              </button>
              <button
                onClick={() => submitTransit(true, true)}
                disabled={sendingTransit}
                className="w-full py-2 rounded-lg border border-slate-200 text-slate-400 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                {sendingTransit ? "처리 중..." : "템플릿 안보내고 변경"}
              </button>
              <button
                onClick={() => setTransitModal(null)}
                className="w-full py-2 rounded-lg text-slate-400 text-sm hover:text-slate-600"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
      {}
      {transitNoticeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-80 flex flex-col gap-4">
            <p className="text-sm font-bold text-slate-800">몇 시 방문 예정인가요?</p>
            <input
              type="time"
              value={transitNoticeModal.eta}
              onChange={(e) =>
                setTransitNoticeModal((prev) => (prev ? { ...prev, eta: e.target.value } : prev))
              }
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <p className="text-xs text-slate-400 -mt-2">
              ※ 설치 상태는 바뀌지 않고, 고객에게 이동중 알림톡만 발송됩니다.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={submitTransitNotice}
                disabled={sendingTransitNotice}
                className="w-full py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
              >
                {sendingTransitNotice ? "처리 중..." : "이동중 알림톡 발송"}
              </button>
              <button
                onClick={() => setTransitNoticeModal(null)}
                className="w-full py-2 rounded-lg text-slate-400 text-sm hover:text-slate-600"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
      {}
      {scheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-80 flex flex-col gap-4">
            <p className="text-sm font-bold text-slate-800">
              {scheduleModal.isReschedule
                ? "설치 일정을 변경하시나요?"
                : "설치 일정을 확정하시나요?"}
            </p>
            <div>
              <label className="block text-xs text-slate-500 mb-1">설치 예정일</label>
              <DatePickerField
                value={scheduleModal.date}
                onChange={(next) =>
                  setScheduleModal((prev) => (prev ? { ...prev, date: next } : prev))
                }
                ariaLabel="설치 예정일"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">희망 시간대 (선택)</label>
              <input
                type="time"
                value={scheduleModal.time}
                onChange={(e) =>
                  setScheduleModal((prev) => (prev ? { ...prev, time: e.target.value } : prev))
                }
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>
            <p className="text-xs text-slate-400 -mt-2">
              {scheduleModal.isReschedule
                ? "※ 예정일만 입력해도 변경할 수 있습니다. 시간대는 선택 입력이며, 고객에게 알림톡은 발송되지 않습니다."
                : "※ 설치 예정일만 입력해도 확정/발송할 수 있습니다. 시간대는 선택 입력입니다."}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => submitSchedule()}
                disabled={sendingSchedule || !scheduleModal.date.trim()}
                className="w-full py-2 rounded-lg bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 disabled:opacity-50"
              >
                {sendingSchedule
                  ? "처리 중..."
                  : scheduleModal.isReschedule
                    ? "일정 변경하기"
                    : "일정 확정하고 발송"}
              </button>
              <button
                onClick={() => setScheduleModal(null)}
                className="w-full py-2 rounded-lg text-slate-400 text-sm hover:text-slate-600"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {mineOnly ? "기사 페이지" : deliveryOnly ? "택배 발송" : "설치 관리"}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {mineOnly
              ? `내 담당 건 ${installs.length}건`
              : `이번달 ${thisMonth}건 / 전체 ${installs.length}건`}
          </p>
        </div>
        <div className="flex gap-2">
          {!mineOnly && (
            <button
              onClick={handleExcel}
              className="flex items-center gap-1.5 text-sm px-3 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50"
            >
              <Download size={15} />
              엑셀
            </button>
          )}
          <button
            onClick={fetchInstalls}
            aria-label="새로고침"
            className="flex items-center gap-1.5 text-sm px-3 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw size={15} />
          </button>
          {canEdit && !mineOnly && (
            <button
              onClick={() => {
                setShowForm((v) => !v);
                setCreatePrefill(null);
              }}
              className="flex items-center gap-2 bg-blue-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-blue-700 font-semibold"
            >
              <Plus size={16} />새 설치건
            </button>
          )}
        </div>
      </div>

      {!mineOnly && !deliveryOnly && (
        <div className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-3.5 sm:grid-cols-2">
          <RateBadge
            title="설치완료율"
            description="전체 설치건 중 설치완료 상태인 비율"
            icon={Percent}
            tone="blue"
            stats={[
              {
                rate: installCompletionStats.rate,
                label: "전체 설치건",
                detail: `${installCompletionStats.completed}/${installCompletionStats.total}건`,
              },
            ]}
          />
          <RateBadge
            title="택배발송완료율"
            description="택배발송건 중 완료 상태인 비율"
            icon={Percent}
            tone="orange"
            stats={[
              {
                rate: deliveryCompletionRate,
                label: "택배발송건",
                detail: `${deliveryStats.completed}/${deliveryStats.total}건`,
              },
            ]}
          />
        </div>
      )}

      {canDelete && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white border border-slate-200 shadow-lg rounded-xl px-5 py-3">
          <span className="text-sm font-semibold text-blue-700">{selected.size}건 선택됨</span>
          <button
            onClick={handleBulkDelete}
            disabled={deletingSelected}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Trash2 size={14} />
            {deletingSelected ? "삭제 중..." : "선택 삭제"}
          </button>
        </div>
      )}

      {}
      {canEdit && !mineOnly && showForm && (
        <CreateForm
          techUsers={techUsers}
          onSubmit={handleCreate}
          submitting={submitting}
          onCancel={() => {
            setShowForm(false);
            setCreatePrefill(null);
          }}
          onClose={() => {
            setShowForm(false);
            setCreatePrefill(null);
          }}
          deliveryOnly={deliveryOnly}
          initial={createPrefill ?? undefined}
        />
      )}

      {}
      <div className="flex items-center justify-end gap-2">
        {!deliveryOnly && (
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mr-auto">
            {(
              [
                ["all", "전체"],
                ["install", "설치"],
                ["name_change", "명변"],
                ["transfer", "전환"],
                ["as", "AS"],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => {
                  setDeliveryTab(tab);
                  setPage(1);
                }}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${deliveryTab === tab ? "bg-white text-slate-900 shadow-sm ring-1 ring-black/5" : "text-slate-500 hover:text-slate-700"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setShowMonthlyStats((v) => !v)}
          className="text-xs text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50"
        >
          {showMonthlyStats ? "실적 숨기기" : "기사별 월간 실적"}
        </button>
      </div>

      {}
      {showMonthlyStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-500 mb-3">기사별 완료 실적 (누적)</p>
            <div className="space-y-2">
              {techStats.slice(0, 8).map((t, idx) => (
                <div key={t.name} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-4">{idx + 1}</span>
                  <span className="text-sm text-slate-700 flex-1">{t.name}</span>
                  <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-400 rounded-full"
                      style={{ width: `${t.total > 0 ? (t.completed / t.total) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 w-16 text-right">
                    {t.completed}/{t.total}건
                  </span>
                </div>
              ))}
              {techStats.length === 0 && <p className="text-xs text-slate-400">데이터 없음</p>}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-500 mb-3">월별 실적 (최근 6개월)</p>
            <table className="text-xs w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-1.5 pr-4 text-slate-400">월</th>
                  <th className="text-right py-1.5 pr-4 text-slate-400">총 건수</th>
                  <th className="text-right py-1.5 text-slate-400">완료</th>
                </tr>
              </thead>
              <tbody>
                {monthlyStats.map(([month, s]) => (
                  <tr key={month} className="border-b border-slate-50">
                    <td className="py-1.5 pr-4 font-medium text-slate-700">{month}</td>
                    <td className="py-1.5 pr-4 text-right text-slate-600">{s.total}건</td>
                    <td className="py-1.5 text-right text-green-600 font-medium">
                      {s.completed}건
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(STATUS_LABELS) as [string, string][]).map(([s, label]) =>
          statusCounts[s] ? (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
              className={`text-xs font-medium px-3 py-1 rounded-full border transition-all ${statusFilter === s ? STATUS_COLORS[s as keyof typeof STATUS_COLORS] + " ring-2 ring-offset-1 ring-blue-400" : "bg-white border-slate-200 text-slate-600"}`}
            >
              {label} {statusCounts[s]}
            </button>
          ) : null,
        )}
        <button
          onClick={() => setShowRejected((v) => !v)}
          className={`text-xs font-medium px-3 py-1 rounded-full border transition-all ${showRejected ? "bg-red-100 text-red-700 border-red-200" : "bg-white border-slate-200 text-slate-400"}`}
        >
          {showRejected ? "반려건 포함" : "반려건 숨김"}
        </button>
        <button
          onClick={() => setShowCompleted((v) => !v)}
          className={`text-xs font-medium px-3 py-1 rounded-full border transition-all ${showCompleted ? "bg-green-100 text-green-700 border-green-200" : "bg-white border-slate-200 text-slate-400"}`}
        >
          {showCompleted ? "완료건 포함" : "완료건 숨김"}
        </button>
      </div>

      {}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="상호명, 고객명, 전화번호, 제품명 검색"
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <AppSelect
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value);
            setPage(1);
          }}
          aria-label="상태 필터"
          options={[
            { value: "", label: "상태 전체" },
            ...(Object.entries(STATUS_LABELS) as [string, string][]).map(([s, l]) => ({
              value: s,
              label: l,
            })),
          ]}
        />
        <DatePickerField
          value={dateFrom}
          onChange={(next) => {
            setDateFrom(next);
            setPage(1);
          }}
          ariaLabel="시작일"
          placeholder="시작일"
        />
        <DatePickerField
          value={dateTo}
          onChange={(next) => {
            setDateTo(next);
            setPage(1);
          }}
          ariaLabel="종료일"
          placeholder="종료일"
        />
        {[
          {
            label: "오늘",
            fn: () => {
              const d = new Date().toISOString().slice(0, 10);
              setDateFrom(d);
              setDateTo(d);
              setPage(1);
            },
          },
          {
            label: "이번주",
            fn: () => {
              const now = new Date();
              const mon = new Date(now);
              mon.setDate(now.getDate() - now.getDay() + 1);
              const sun = new Date(mon);
              sun.setDate(mon.getDate() + 6);
              setDateFrom(mon.toISOString().slice(0, 10));
              setDateTo(sun.toISOString().slice(0, 10));
              setPage(1);
            },
          },
          {
            label: "이번달",
            fn: () => {
              const now = new Date();
              const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
              const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
                .toISOString()
                .slice(0, 10);
              setDateFrom(first);
              setDateTo(last);
              setPage(1);
            },
          },
        ].map(({ label, fn }) => (
          <button
            key={label}
            onClick={fn}
            className="text-xs text-slate-500 border border-slate-200 rounded-xl px-2.5 py-2.5 hover:bg-slate-50 whitespace-nowrap"
          >
            {label}
          </button>
        ))}
        {!mineOnly && (
          <AppSelect
            value={techFilter}
            onValueChange={(value) => {
              setTechFilter(value);
              setPage(1);
            }}
            aria-label="기사 필터"
            options={[
              { value: "", label: "기사 전체" },
              ...techProfiles.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
        )}
        {(statusFilter || (!mineOnly && techFilter) || search || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setStatusFilter("");
              if (!mineOnly) setTechFilter("");
              setSearch("");
              setDateFrom("");
              setDateTo("");
              setPage(1);
            }}
            className="text-sm text-slate-400 hover:text-red-500 px-2 transition-colors"
          >
            초기화
          </button>
        )}
        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer ml-auto whitespace-nowrap border border-slate-200 rounded-xl px-3 py-2.5 bg-white hover:bg-slate-50">
          <input
            type="checkbox"
            checked={skipNotify}
            onChange={(e) => setSkipNotify(e.target.checked)}
            className="w-3.5 h-3.5 accent-slate-600"
          />
          알림톡 건너뛰기
        </label>
      </div>

      {}
      {mineOnly && (
        <div className="md:hidden space-y-3">
          {loading ? (
            <div className="py-16 text-center text-slate-400 text-sm">불러오는 중...</div>
          ) : filteredInstalls.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">설치건이 없습니다</div>
          ) : (
            filteredInstalls.map((inst) => {
              const expanded = mobileExpandedId === inst.id;
              return (
                <div
                  key={inst.id}
                  id={`install-card-${inst.id}`}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
                >
                  <button
                    onClick={() => setMobileExpandedId(expanded ? null : inst.id)}
                    className="w-full flex items-center justify-between gap-2 p-4 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-900 break-words">
                          {inst.customer_name}
                        </span>
                        {inst.franchise_application_id && (
                          <span className="text-[10px] font-semibold bg-purple-100 text-purple-600 border border-purple-200 px-1.5 py-0.5 rounded-md shrink-0">
                            가맹이관
                          </span>
                        )}
                        {inst.woo_customer_id && (
                          <span className="text-[10px] font-semibold bg-teal-100 text-teal-600 border border-teal-200 px-1.5 py-0.5 rounded-md shrink-0">
                            우국상이관
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500 text-sm mt-0.5">{inst.customer_phone || "-"}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-xs font-medium rounded-lg border px-2 py-1 whitespace-nowrap ${STATUS_COLORS[inst.status]}`}
                      >
                        {statusLabel(inst.status, inst.delivery_type)}
                      </span>
                      {canEdit && inst.status !== "in_transit" && inst.status !== "completed" && (
                        <span
                          role="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusChange(inst.id, "in_transit");
                          }}
                          className="text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 px-3 py-2 rounded-lg whitespace-nowrap"
                        >
                          이동중
                        </span>
                      )}
                      <ChevronDown
                        size={16}
                        className={`text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                      />
                    </div>
                  </button>
                  {expanded && (
                    <div
                      className="px-4 pb-4 border-t border-slate-100 pt-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {canEdit ? (
                        <InstallItemsEditor
                          items={inst.items ?? []}
                          onChange={(items) => saveInstallItems(inst.id, items)}
                        />
                      ) : (
                        <div className="text-sm text-slate-700">
                          {inst.items?.length > 0
                            ? inst.items.map((i) => `${i.name} x${i.quantity}`).join(", ")
                            : "-"}
                        </div>
                      )}
                      <p className="mt-2 text-xs text-slate-400">
                        등록 {format(new Date(inst.created_at), "M/d HH:mm", { locale: ko })}
                      </p>
                      <div className="mt-2">
                        <InstallationActivityHistory
                          installationId={inst.id}
                          statusLabels={STATUS_LABELS}
                        />
                      </div>
                      <div className="mt-2">
                        <NotificationHistory
                          entityType="install"
                          entityId={inst.id}
                          labelMap={STATUS_LABELS}
                        />
                      </div>
                      {inst.completion_photo_urls && inst.completion_photo_urls.length > 0 && (
                        <div className="flex gap-1 mt-2">
                          {inst.completion_photo_urls.map((url, idx) => (
                            <a
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={`${inst.customer_name} ${idx + 1}.jpg`}
                            >
                              <img
                                src={thumbUrl(url, 40)}
                                alt="설치완료사진"
                                loading="lazy"
                                decoding="async"
                                className="w-10 h-10 object-cover rounded border border-slate-200"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                      {canEdit && (
                        <div className="mt-3 space-y-2">
                          <label className="text-xs text-slate-500">담당기사</label>
                          <AppSelect
                            value={inst.assigned_to || ""}
                            onValueChange={(value) => handleAssign(inst.id, value)}
                            aria-label="담당기사"
                            className="w-full"
                            options={[
                              { value: "", label: "미배정" },
                              ...techUsers.map((t) => ({ value: t.id, label: t.name })),
                            ]}
                          />
                          <AppSelect
                            value={inst.status}
                            disabled={!!completionApprovals[inst.id]}
                            onValueChange={(value) => handleStatusChange(inst.id, value)}
                            aria-label="상태 변경"
                            className={`w-full font-medium ${STATUS_COLORS[inst.status]
                              .split(" ")
                              .map((c) => `!${c}`)
                              .join(" ")}`}
                            options={statusOrderFor(inst.delivery_type).map((s) => ({
                              value: s,
                              label: statusLabel(s, inst.delivery_type),
                            }))}
                          />
                          {!!approvalNoteHistory[inst.id]?.length && (
                            <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                              <p className="mb-2 text-xs font-semibold text-blue-700">
                                승인 비고 이력
                              </p>
                              <ApprovalNoteTimeline notes={approvalNoteHistory[inst.id]!} />
                            </div>
                          )}
                          {inst.status !== "completed" && inst.status !== "rejected" && (
                            <button
                              onClick={() => handleStatusChange(inst.id, "reschedule")}
                              disabled={!!completionApprovals[inst.id]}
                              className="w-full text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50 px-3 py-2 rounded-lg"
                            >
                              일정변경
                            </button>
                          )}
                          {inst.status !== "completed" && (
                            <button
                              onClick={() => setTransitModal({ id: inst.id, eta: "" })}
                              className="w-full text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 px-3 py-2 rounded-lg"
                            >
                              도착시간 알림 발송
                            </button>
                          )}
                          <label className="text-xs text-slate-500">비고</label>
                          <textarea
                            defaultValue={inst.notes ?? ""}
                            onBlur={(e) => saveNotes(inst.id, e.target.value)}
                            placeholder="비고 추가..."
                            rows={4}
                            className="w-full text-sm border border-slate-200 rounded-lg px-2 py-2 focus:outline-none resize-none"
                          />
                        </div>
                      )}
                      {profile.role === "tech" &&
                        inst.franchise_application_id &&
                        inst.status !== "rejected" &&
                        inst.status !== "completed" && (
                          <button
                            onClick={() => setRejectModal({ id: inst.id, reason: "" })}
                            className="mt-2 text-xs text-red-500 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-50"
                          >
                            반려
                          </button>
                        )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {}
      <div
        className={`bg-white rounded-2xl border border-slate-200 overflow-hidden ${mineOnly ? "hidden md:block" : ""}`}
      >
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">불러오는 중...</div>
        ) : filteredInstalls.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">설치건이 없습니다</div>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full text-sm border-collapse [&_th]:border [&_th]:border-slate-200 [&_td]:border [&_td]:border-slate-200 [&_tbody_tr:nth-child(even)]:bg-slate-50/60"
              style={{ tableLayout: "fixed" }}
            >
              <colgroup>
                {canDelete && <col style={{ width: 32 }} />}
                <col style={{ width: 24 }} />
                {columns.map((col) => (
                  <col
                    key={col.key}
                    style={{ width: colWidths[col.key] ?? DEFAULT_WIDTHS[col.key] ?? 140 }}
                  />
                ))}
              </colgroup>
              <thead>
                <tr className="bg-slate-50">
                  {canDelete && (
                    <th className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={
                          pagedInstalls.some((i) => !i.franchise_application_id) &&
                          pagedInstalls
                            .filter((i) => !i.franchise_application_id)
                            .every((i) => selected.has(i.id))
                        }
                        onChange={toggleAll}
                        className="w-4 h-4 accent-blue-600 cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="px-1 py-3" />
                  {columns.map((col) => {
                    const label =
                      mineOnly && col.key === "tracking_number" ? "이동중 알림" : col.label;
                    return (
                      <th
                        key={col.key}
                        title={label}
                        className="relative px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap overflow-hidden text-ellipsis select-none"
                      >
                        {label}
                        <div
                          onMouseDown={(e) => startResize(e, col.key)}
                          className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-500/60"
                        />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {pagedInstalls.map((inst) => (
                  <Fragment key={inst.id}>
                    <tr
                      id={`install-row-${inst.id}`}
                      className={`hover:bg-blue-50/40 transition cursor-pointer ${rowDragId === inst.id ? "opacity-40" : ""}`}
                      onClick={() => {
                        if (detailInst?.id === inst.id) closeInstallDetail();
                        else openInstallDetail(inst);
                      }}
                      onDragOver={(e) => {
                        if (canReorder && rowDragId) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (rowDragId) reorderInstalls(rowDragId, inst.id);
                      }}
                    >
                      {canDelete && (
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          {!inst.franchise_application_id && (
                            <input
                              type="checkbox"
                              checked={selected.has(inst.id)}
                              onChange={() => toggleOne(inst.id)}
                              className="w-4 h-4 accent-blue-600 cursor-pointer"
                            />
                          )}
                        </td>
                      )}
                      <td
                        className={`px-1 py-3 text-slate-700 ${canReorder ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed opacity-30"}`}
                        draggable={canReorder}
                        onClick={(e) => e.stopPropagation()}
                        onDragStart={(e) => {
                          if (!canReorder) {
                            e.preventDefault();
                            return;
                          }
                          setRowDragId(inst.id);
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
                      <td
                        className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis"
                        title={inst.customer_name}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>{inst.customer_name}</span>
                          {inst.franchise_application_id && (
                            <span className="text-[10px] font-semibold bg-purple-100 text-purple-600 border border-purple-200 px-1.5 py-0.5 rounded-md">
                              가맹이관
                            </span>
                          )}
                          {inst.woo_customer_id && (
                            <span className="text-[10px] font-semibold bg-teal-100 text-teal-600 border border-teal-200 px-1.5 py-0.5 rounded-md">
                              우국상이관
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        className="px-2 py-3 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canEdit ? (
                          <AppSelect
                            value={deliveryTypeOf(inst.delivery_type)}
                            onValueChange={(value) =>
                              saveInstallField(inst.id, "delivery_type", value)
                            }
                            aria-label="구분"
                            className={`h-auto text-xs font-medium py-1 ${DELIVERY_TYPE_BADGE_COLORS[
                              deliveryTypeOf(inst.delivery_type)
                            ]
                              .split(" ")
                              .map((c) => `!${c}`)
                              .join(" ")}`}
                            options={(
                              ["install", "delivery", "name_change", "transfer", "as"] as const
                            ).map((t) => ({ value: t, label: DELIVERY_TYPE_LABELS[t] }))}
                          />
                        ) : (
                          <span
                            className={`text-xs font-medium rounded-lg border px-2 py-1 ${DELIVERY_TYPE_BADGE_COLORS[deliveryTypeOf(inst.delivery_type)]}`}
                          >
                            {DELIVERY_TYPE_LABELS[deliveryTypeOf(inst.delivery_type)]}
                          </span>
                        )}
                      </td>
                      <td
                        className="px-4 py-3 text-slate-700 whitespace-nowrap overflow-hidden text-ellipsis"
                        title={inst.customer_phone || undefined}
                      >
                        {inst.customer_phone || "-"}
                      </td>
                      <td
                        className="px-4 py-3 text-slate-700 whitespace-nowrap overflow-hidden text-ellipsis"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {mineOnly ? (
                          canEdit && inst.status !== "completed" ? (
                            <button
                              onClick={() => setTransitNoticeModal({ id: inst.id, eta: "" })}
                              className="text-xs font-semibold px-2 py-1 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors whitespace-nowrap"
                            >
                              이동중 톡
                            </button>
                          ) : (
                            "-"
                          )
                        ) : canEdit ? (
                          <EditableInstallText
                            value={inst.tracking_number ?? ""}
                            onSave={(v) => saveInstallField(inst.id, "tracking_number", v)}
                          />
                        ) : (
                          inst.tracking_number || "-"
                        )}
                      </td>
                      <td
                        className="px-4 py-3 text-slate-700 whitespace-nowrap overflow-hidden text-ellipsis"
                        title={
                          inst.items?.length > 0
                            ? inst.items.map((i) => `${i.name} x${i.quantity}`).join(", ")
                            : undefined
                        }
                      >
                        {inst.items?.length > 0
                          ? inst.items.map((i) => `${i.name} x${i.quantity}`).join(", ")
                          : "-"}
                      </td>
                      <td
                        className="px-4 py-3 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canEdit ? (
                          <AppSelect
                            value={inst.status}
                            onValueChange={(value) => handleStatusChange(inst.id, value)}
                            aria-label="상태"
                            className={`h-auto text-xs font-medium py-1 ${STATUS_COLORS[inst.status]
                              .split(" ")
                              .map((c) => `!${c}`)
                              .join(" ")}`}
                            options={statusOrderFor(inst.delivery_type).map((s) => ({
                              value: s,
                              label: statusLabel(s, inst.delivery_type),
                            }))}
                          />
                        ) : (
                          <span
                            className={`text-xs font-medium rounded-lg border px-2 py-1 ${STATUS_COLORS[inst.status]}`}
                          >
                            {statusLabel(inst.status, inst.delivery_type)}
                          </span>
                        )}
                      </td>
                      <td
                        className={`px-4 py-3 whitespace-nowrap ${inst.assigned_to === profile.id ? "animate-pulse bg-yellow-100" : ""}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canEdit ? (
                          <AppSelect
                            value={inst.assigned_to || ""}
                            onValueChange={(value) => handleAssign(inst.id, value)}
                            aria-label="담당기사"
                            className="h-auto text-xs py-1"
                            options={[
                              { value: "", label: "미배정" },
                              ...techUsers.map((t) => ({ value: t.id, label: t.name })),
                            ]}
                          />
                        ) : (
                          <span className="text-xs text-slate-700">
                            {inst.assignee?.name ?? "미배정"}
                          </span>
                        )}
                      </td>
                      <td
                        className="px-4 py-3 text-slate-700 max-w-[160px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canEdit && editingNotes?.id === inst.id ? (
                          <input
                            autoFocus
                            value={editingNotes.value}
                            onChange={(e) =>
                              setEditingNotes({ ...editingNotes, value: e.target.value })
                            }
                            onBlur={() => saveNotes(inst.id, editingNotes.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveNotes(inst.id, editingNotes.value);
                              if (e.key === "Escape") setEditingNotes(null);
                            }}
                            className="w-full text-xs border border-blue-300 rounded px-1 py-0.5 focus:outline-none"
                          />
                        ) : (
                          <span
                            className={`text-xs line-clamp-1 ${canEdit ? "cursor-pointer hover:text-blue-500" : ""}`}
                            onClick={() =>
                              canEdit && setEditingNotes({ id: inst.id, value: inst.notes ?? "" })
                            }
                            title={inst.notes || (canEdit ? "클릭하여 수정" : undefined)}
                          >
                            {inst.notes ||
                              (canEdit ? (
                                <span className="text-slate-500">비고 추가...</span>
                              ) : (
                                "-"
                              ))}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap font-mono">
                        {format(new Date(inst.created_at), "M/d HH:mm", { locale: ko })}
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex justify-center gap-3 py-4 border-t border-slate-100">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40"
                >
                  이전
                </button>
                <span className="text-xs text-slate-400 flex items-center">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40"
                >
                  다음
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {completeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-80 max-w-full max-h-[85vh] overflow-y-auto flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-800">
              {installs.find((i) => i.id === completeModal.id)?.delivery_type === "as"
                ? "AS 완료 처리"
                : "설치 완료 처리"}
            </h3>
            {checklistItems.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-slate-500 font-medium">완료 전 체크리스트 (필수)</p>
                {checklistItems.map((item, i) => (
                  <label
                    key={i}
                    className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() =>
                        setChecklistItems((prev) =>
                          prev.map((c, j) => (j === i ? { ...c, checked: !c.checked } : c)),
                        )
                      }
                      className="w-3.5 h-3.5 accent-green-600"
                    />
                    <span className={item.checked ? "line-through text-slate-400" : ""}>
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">설치완료사진 (선택, 여러 장 가능)</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setCompletePhotos(Array.from(e.target.files ?? []))}
                className="w-full text-sm text-slate-600 rounded-lg border border-blue-200 bg-blue-50 file:mr-3 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:text-sm file:font-medium file:cursor-pointer"
              />
              {completePhotos.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {completePhotos.map((file, i) => (
                    <div key={i} className="relative">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-14 h-14 object-cover rounded-lg border border-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => setCompletePhotos((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs leading-none flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">비고</label>
              <textarea
                key={completeModal.id}
                ref={completeNotesRef}
                defaultValue={completeModal.notes}
                placeholder="현장 비고를 남겨주세요"
                rows={6}
                className={INPUT + " resize-none"}
              />
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => submitCompletion(false)}
                disabled={completing || checklistItems.some((c) => !c.checked)}
                className="w-full py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {completing ? "처리 중..." : "완료 처리"}
              </button>
              <button
                onClick={() => submitCompletion(true)}
                disabled={completing || checklistItems.some((c) => !c.checked)}
                className="w-full py-2 rounded-lg border border-slate-200 text-slate-400 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                {completing ? "처리 중..." : "템플릿 안보내고 완료 처리"}
              </button>
              <button
                onClick={() => {
                  setCompleteModal(null);
                  setCompletePhotos([]);
                }}
                disabled={completing}
                className="w-full py-2 rounded-lg text-slate-400 text-sm hover:text-slate-600"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      <BulkConfirmDialog
        open={bulkDeleteConfirmOpen}
        title="선택 항목 삭제"
        busy={deletingSelected}
        confirmText="삭제"
        confirmColor="red"
        items={installs
          .filter((i) => selected.has(i.id))
          .map((i) => ({ id: i.id, label: i.customer_name || i.id }))}
        onCancel={() => setBulkDeleteConfirmOpen(false)}
        onConfirm={confirmBulkDelete}
      />

      {historyOpenId &&
        (() => {
          const row = installs.find((i) => i.id === historyOpenId);
          if (!row) return null;
          return (
            <MemoHistoryPanel
              title={row.customer_name}
              memo={row.notes}
              createdAt={row.created_at}
              onAddMemo={(value) =>
                saveNotes(
                  row.id,
                  `${(row.notes ?? "").trim()}${(row.notes ?? "").trim() ? "\n" : ""}${value}`,
                )
              }
              onDeleteMemo={(newMemo) => saveNotes(row.id, newMemo, true)}
              onClose={() => setHistoryOpenId(null)}
              entityType="install"
              entityId={row.id}
              labelMap={STATUS_LABELS}
              franchiseApplicationId={row.franchise_application_id}
              franchiseStatusLabelMap={FRANCHISE_STATUS_LABEL as Record<string, string>}
            />
          );
        })()}

      {postHistoryOpenId &&
        (() => {
          const row = installs.find((install) => install.id === postHistoryOpenId);
          if (!row || !["completed", "delivery_sent"].includes(row.status)) return null;
          return (
            <InstallationPostHistoryPanel
              installationId={row.id}
              title={row.customer_name}
              onClose={() => setPostHistoryOpenId(null)}
            />
          );
        })()}
    </div>
  );
}

const INPUT =
  "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";
