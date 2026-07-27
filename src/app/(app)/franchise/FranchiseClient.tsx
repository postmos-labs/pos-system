"use client";

import { useState, useTransition, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { formatPhone, formatBusinessNumber, formatDateText } from "@/lib/format";
import { useColumnWidths } from "@/hooks/useColumnWidths";
import { mergeRowsPreservingIdentity } from "@/lib/mergeRows";
import { deleteFranchiseRows } from "./actions";
import {
  approveCsResponsibleTransfer,
  approveFranchiseTransfer,
  requestFranchiseTransfer,
} from "../dashboard/actions";
import type {
  ApplicantType,
  EquipmentItem,
  FranchiseApplication,
  FranchiseApplicationLog,
  FranchiseApplicationMemo,
  FranchiseStatus,
  Profile,
} from "@/types";
import { APPLICANT_TYPE_LABEL, FRANCHISE_STATUS_LABEL, FRANCHISE_STATUS_COLOR } from "@/types";
import type { DocCase } from "@/lib/solapi";
import { useToast } from "@/components/ui/Toast";
import BulkConfirmDialog from "@/components/ui/BulkConfirmDialog";
import FormModal from "@/components/ui/FormModal";
import FranchiseCreateDialog, { type FranchiseCreateInput } from "./FranchiseCreateDialog";
import FranchiseDetailDrawer from "./FranchiseDetailDrawer";
import FranchiseMemoDrawer from "./FranchiseMemoDrawer";
import FranchiseReceiptSurface from "./FranchiseReceiptSurface";
import {
  INSTALLATION_DELIVERY_TYPE_OPTIONS,
  type InstallationDeliveryType,
} from "@/lib/installationDeliveryType";
import { appendApprovalNote, type ApprovalNote } from "@/lib/approvalNotes";
import {
  docCaseOf,
  applyFranchiseStatusSideEffects,
  notifyAndLogFranchiseStatus,
} from "@/lib/franchiseStatusEffects";
import { VAN_COMPANY_LABEL, RECEPTION_CHANNEL_LABEL } from "@/lib/franchiseCodes";

const DOC_CASE_LABEL: Record<DocCase, string> = {
  both: "대표자명+상호명",
  business_only: "상호명만",
  owner_only: "대표자명만",
  phone_only: "번호만",
};

interface Props {
  rows: FranchiseApplication[];
  salesProfiles: Pick<Profile, "id" | "name" | "role">[];
  csProfiles: Pick<Profile, "id" | "name" | "role">[];
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
  currentUserApprovalRole: string;
  initialStatusFilter?: string;
  initialHighlightId?: string;
  linkedInstalls?: Record<string, { id: string; status: string }>;
  linkedInternets?: Record<string, { id: string; status: string | null; category: string | null }>;
  todayDate: string;
  todayCompletedIds: string[];
  initialTransferApprovals: Record<string, TransferApproval>;
}

type TransferApproval = {
  franchise_application_id: string;
  status: "requested" | "cs_responsible_approved" | "approved" | "rejected";
  delivery_type: string | null;
  requested_by: string;
  requested_by_name: string;
  requested_at: string;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  cs_approved_by: string | null;
  cs_approved_by_name: string | null;
  cs_approved_at: string | null;
  approval_notes: ApprovalNote[];
};

type ReceiptTableView = "all" | "mine" | "doc_incomplete" | "doc_waiting" | "approved";
type ReceiptKpi =
  "today_received" | "doc_waiting" | "doc_incomplete" | "reviewing" | "today_completed";

const REVIEWING_STATUS_SET = new Set<FranchiseStatus>([
  "card_apply_done",
  "toss_review_apply_done",
]);
const APPROVED_STATUS_SET = new Set<FranchiseStatus>(["card_done", "toss_review_done"]);
const COMPLETED_STATUS_SET = new Set<FranchiseStatus>([
  "card_done",
  "internet_done",
  "toss_review_done",
  "completed",
]);

const STATUS_DROPDOWN_HIDDEN: FranchiseStatus[] = [
  "internet_apply_done",
  "internet_done",
  "card_internet_apply_done",
];
const SELECTABLE_FRANCHISE_STATUSES = (
  Object.keys(FRANCHISE_STATUS_LABEL) as FranchiseStatus[]
).filter((s) => !STATUS_DROPDOWN_HIDDEN.includes(s));

const DEFAULT_WIDTHS: Record<string, number> = {
  reception_date: 100,
  reception_channel: 90,
  applicant_type: 110,
  business_name: 160,
  owner_name: 90,
  phone: 130,
  creator: 80,
  cs_id: 90,
  internet_status: 110,
  status: 140,
  memo: 160,
};
const COL_WIDTHS_STORAGE_KEY = "franchise_col_widths";
const PAGE_SIZE = 50;

export default function FranchiseClient({
  rows,
  salesProfiles,
  csProfiles,
  currentUserId,
  currentUserName,
  currentUserRole,
  currentUserApprovalRole,
  initialStatusFilter = "",
  initialHighlightId,
  linkedInstalls = {},
  linkedInternets = {},
  todayDate,
  todayCompletedIds,
  initialTransferApprovals,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [localRows, setLocalRows] = useState(rows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [localLinkedInstalls, setLocalLinkedInstalls] =
    useState<Record<string, { id: string; status: string }>>(linkedInstalls);

  const localLinkedInstallsRef = useRef(localLinkedInstalls);
  useEffect(() => {
    localLinkedInstallsRef.current = localLinkedInstalls;
  }, [localLinkedInstalls]);
  const [localLinkedInternets, setLocalLinkedInternets] =
    useState<Record<string, { id: string; status: string | null; category: string | null }>>(
      linkedInternets,
    );
  const [linkingInternetId, setLinkingInternetId] = useState<string | null>(null);
  const [statusConfirm, setStatusConfirm] = useState<{
    row: FranchiseApplication;
    newStatus: FranchiseStatus;
    msg: string;
    docCase?: DocCase;
  } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [logsByRow, setLogsByRow] = useState<Record<string, FranchiseApplicationLog[]>>({});
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [memosByRow, setMemosByRow] = useState<Record<string, FranchiseApplicationMemo[]>>({});

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [applicantTypeFilter, setApplicantTypeFilter] = useState("");
  const [salesFilter, setSalesFilter] = useState("");
  const [csFilter, setCsFilter] = useState("");

  const [sortBy, setSortBy] = useState<
    "updated_at" | "created_at" | "open_date" | "install_date" | "status" | "manual"
  >("created_at");
  const [rowDragId, setRowDragId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const { colWidths, startResize } = useColumnWidths(COL_WIDTHS_STORAGE_KEY, DEFAULT_WIDTHS);
  const [vanFilter, setVanFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(true);
  const [bulkStatusModal, setBulkStatusModal] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<FranchiseStatus | "">("");
  const [bulkChanging, setBulkChanging] = useState(false);
  const [bulkStatusConfirmOpen, setBulkStatusConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [tableView, setTableView] = useState<ReceiptTableView>("all");
  const [activeKpi, setActiveKpi] = useState<ReceiptKpi | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [bulkAssignModal, setBulkAssignModal] = useState(false);
  const [bulkAssignCs, setBulkAssignCs] = useState("");
  const [bulkAssignSales, setBulkAssignSales] = useState("");
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkTransferConfirmOpen, setBulkTransferConfirmOpen] = useState(false);
  const [bulkTransferring, setBulkTransferring] = useState(false);
  const [teamLeadTransferRow, setTeamLeadTransferRow] = useState<FranchiseApplication | null>(null);
  const [teamLeadDeliveryType, setTeamLeadDeliveryType] = useState<InstallationDeliveryType | "">(
    "",
  );
  const [teamLeadTransferNote, setTeamLeadTransferNote] = useState("");
  const [csApprovalRow, setCsApprovalRow] = useState<FranchiseApplication | null>(null);
  const [csApprovalNote, setCsApprovalNote] = useState("");
  const [transferRequestRow, setTransferRequestRow] = useState<FranchiseApplication | null>(null);
  const [transferRequestNote, setTransferRequestNote] = useState("");
  const [bulkTransferNoteModal, setBulkTransferNoteModal] = useState(false);
  const [bulkTransferNote, setBulkTransferNote] = useState("");
  const [transferApprovals, setTransferApprovals] = useState(initialTransferApprovals);
  const [savedFilters, setSavedFilters] = useState<
    { name: string; filters: Record<string, string> }[]
  >(() => {
    try {
      return JSON.parse(localStorage.getItem("franchise_saved_filters") ?? "[]");
    } catch {
      return [];
    }
  });
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    setLocalRows((prev) => mergeRowsPreservingIdentity(prev, rows));
    setSelected(new Set());
  }, [rows]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (e.key === "n" || e.key === "N") setShowForm((v) => !v);
      if (e.key === "?") setShowShortcuts((v) => !v);
      if (e.key === "Escape") {
        setShowShortcuts(false);
        setShowForm(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    const supabase = createClient();
    for (const days of [7, 3, 1]) {
      const templateKey = `franchise_dday_${days}_${today}`;
      (async () => {
        try {
          const { data: already } = await supabase
            .from("notification_logs")
            .select("id")
            .eq("entity_type", "franchise_dday_notify")
            .eq("entity_id", currentUserId)
            .eq("template_key", templateKey)
            .limit(1)
            .maybeSingle();
          if (already) return;
          const target = new Date(Date.now() + days * 86400000).toISOString().split("T")[0];
          const matched = rows.filter(
            (r) =>
              r.open_date === target &&
              (currentUserRole === "admin" ||
                currentUserRole === "master" ||
                r.cs_id === currentUserId ||
                r.sales_id === currentUserId),
          );
          if (matched.length === 0) return;
          const names = matched.map((r) => r.business_name || r.owner_name || "미입력").join(", ");
          const { error } = await supabase.from("notifications").insert({
            user_id: currentUserId,
            type: "open_date_soon",
            title: `오픈 D-${days} 알림 ${matched.length}건`,
            body: `${names} — ${days}일 후 오픈 예정입니다. 준비 상태를 확인해주세요.`,
          });
          if (error) {
            toast.error("D-day 알림 생성 실패: " + error.message);
            return;
          }
          await supabase.from("notification_logs").insert({
            entity_type: "franchise_dday_notify",
            entity_id: currentUserId,
            template_key: templateKey,
            user_id: currentUserId,
          });
        } catch (err) {
          console.error("D-day 알림 처리 실패:", err);
        }
      })();
    }
  }, []);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    const key = `reject_renotify_${currentUserId}_${today}`;
    if (localStorage.getItem(key)) return;

    localStorage.setItem(key, "1");
  }, []);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    const templateKey = `franchise_stale_${today}`;
    const supabase = createClient();
    (async () => {
      try {
        const { data: already } = await supabase
          .from("notification_logs")
          .select("id")
          .eq("entity_type", "franchise_stale_notify")
          .eq("entity_id", currentUserId)
          .eq("template_key", templateKey)
          .limit(1)
          .maybeSingle();
        if (already) return;
        const terminal: FranchiseStatus[] = ["card_done", "internet_done"];
        const stale = rows.filter(
          (r) =>
            !terminal.includes(r.status) &&
            Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 86400000) >= 7 &&
            (currentUserRole === "admin" ||
              currentUserRole === "master" ||
              r.cs_id === currentUserId ||
              r.sales_id === currentUserId),
        );
        if (stale.length === 0) return;
        const names = stale
          .slice(0, 3)
          .map((r) => r.business_name || r.owner_name || "미입력")
          .join(", ");
        const { error } = await supabase.from("notifications").insert({
          user_id: currentUserId,
          type: "stale_franchise",
          title: `장기 미처리 건 ${stale.length}개`,
          body:
            names +
            (stale.length > 3 ? ` 외 ${stale.length - 3}건` : "") +
            " — 7일 이상 상태 변화가 없습니다.",
        });
        if (error) {
          toast.error("장기 미처리 알림 생성 실패: " + error.message);
          return;
        }
        await supabase.from("notification_logs").insert({
          entity_type: "franchise_stale_notify",
          entity_id: currentUserId,
          template_key: templateKey,
          user_id: currentUserId,
        });
      } catch (err) {
        console.error("장기 미처리 알림 처리 실패:", err);
      }
    })();
  }, []);

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("franchise_applications-realtime")
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

  const todayCompletedIdSet = useMemo(() => new Set(todayCompletedIds), [todayCompletedIds]);

  type FilterSkip = {
    skipView?: boolean;
    skipKpi?: boolean;
    skipStatus?: boolean;
    skipChannel?: boolean;
  };
  const matchesFilters = useCallback(
    (row: FranchiseApplication, skip: FilterSkip = {}) => {
      if (!skip.skipKpi && activeKpi) {
        if (
          activeKpi === "today_received" &&
          format(new Date(row.created_at), "yyyy-MM-dd") !== todayDate
        )
          return false;
        if (activeKpi === "doc_waiting" && row.status !== "doc_waiting") return false;
        if (activeKpi === "doc_incomplete" && row.status !== "doc_incomplete") return false;
        if (activeKpi === "reviewing" && !REVIEWING_STATUS_SET.has(row.status)) return false;
        if (
          activeKpi === "today_completed" &&
          (!APPROVED_STATUS_SET.has(row.status) || !todayCompletedIdSet.has(row.id))
        )
          return false;
      }
      if (!skip.skipView) {
        if (
          tableView === "mine" &&
          ((row.sales_id !== currentUserId && row.cs_id !== currentUserId) ||
            COMPLETED_STATUS_SET.has(row.status))
        )
          return false;
        if (tableView === "doc_incomplete" && row.status !== "doc_incomplete") return false;
        if (tableView === "doc_waiting" && row.status !== "doc_waiting") return false;
        if (tableView === "approved" && !APPROVED_STATUS_SET.has(row.status)) return false;
      }
      if (!skip.skipStatus && statusFilter && row.status !== statusFilter) return false;
      if (applicantTypeFilter && row.applicant_type !== applicantTypeFilter) return false;
      if (
        !skip.skipChannel &&
        channelFilter &&
        (row.reception_channel_code || "") !== channelFilter
      )
        return false;
      if (vanFilter && !row.van_company_codes?.includes(vanFilter)) return false;
      if (dateFrom || dateTo) {
        const createdLocalDate = format(new Date(row.created_at), "yyyy-MM-dd");
        if (dateFrom && createdLocalDate < dateFrom) return false;
        if (dateTo && createdLocalDate > dateTo) return false;
      }
      return true;
    },
    [
      activeKpi,
      todayDate,
      todayCompletedIdSet,
      tableView,
      currentUserId,
      statusFilter,
      applicantTypeFilter,
      channelFilter,
      vanFilter,
      dateFrom,
      dateTo,
    ],
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = localRows.filter((row) => {
      if (!matchesFilters(row)) return false;
      if (term) {
        const haystack =
          `${row.business_name ?? ""} ${row.owner_name ?? ""} ${row.phone ?? ""} ${row.business_number ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (sortBy === "status") return a.status.localeCompare(b.status);
      if (sortBy === "open_date") return (a.open_date ?? "").localeCompare(b.open_date ?? "");
      if (sortBy === "install_date")
        return (a.install_date ?? "").localeCompare(b.install_date ?? "");
      if (sortBy === "created_at")
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "manual")
        return (
          (b.sort_order ?? new Date(b.created_at).getTime()) -
          (a.sort_order ?? new Date(a.created_at).getTime())
        );
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [localRows, search, sortBy, matchesFilters]);

  useEffect(() => {
    setPage(1);
  }, [
    search,
    statusFilter,
    applicantTypeFilter,
    channelFilter,
    vanFilter,
    sortBy,
    tableView,
    activeKpi,
    dateFrom,
    dateTo,
  ]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const highlightAppliedRef = useRef(false);
  useEffect(() => {
    if (!initialHighlightId || highlightAppliedRef.current) return;
    const target = localRows.find((r) => r.id === initialHighlightId);
    if (!target) return;
    highlightAppliedRef.current = true;
    setSearch("");
    setStatusFilter("");
    setApplicantTypeFilter("");
    setChannelFilter("");
    setVanFilter("");
    setDateFrom("");
    setDateTo("");
    setTableView("all");
    setActiveKpi(null);
    setExpandedId(target.id);
    if (!logsByRow[target.id]) {
      const supabase = createClient();
      void supabase
        .from("franchise_application_logs")
        .select("*, user:profiles(name)")
        .eq("franchise_application_id", target.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => setLogsByRow((prev) => ({ ...prev, [target.id]: data ?? [] })));
    }
  }, [initialHighlightId, localRows, logsByRow]);

  useEffect(() => {
    if (!initialHighlightId) return;
    const idx = filteredRows.findIndex((r) => r.id === initialHighlightId);
    if (idx === -1) return;
    setPage(Math.floor(idx / PAGE_SIZE) + 1);
    setTimeout(() => {
      document
        .getElementById(`franchise-row-${initialHighlightId}`)
        ?.scrollIntoView({ block: "center" });
    }, 50);
  }, [initialHighlightId, filteredRows]);

  const canReorder =
    sortBy === "manual" &&
    !search.trim() &&
    !statusFilter &&
    !applicantTypeFilter &&
    !channelFilter &&
    !vanFilter &&
    !dateFrom &&
    !dateTo &&
    tableView === "all" &&
    !activeKpi;

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

  function shareLink(id: string) {
    const url = `${window.location.origin}/franchise?id=${id}`;
    navigator.clipboard.writeText(url);
    toast.success("건별 링크가 복사됐습니다.");
  }

  function completeness(row: FranchiseApplication): number {
    const fields = [
      row.business_name,
      row.owner_name,
      row.phone,
      row.business_number,
      row.address,
      row.open_date,
      row.cs_id,
      row.sales_id,
    ];
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }

  function saveFilterPreset() {
    const name = prompt("필터 프리셋 이름을 입력하세요:");
    if (!name) return;
    const preset = {
      name,
      filters: { statusFilter, applicantTypeFilter, salesFilter, csFilter, sortBy },
    };
    const next = [...savedFilters, preset];
    setSavedFilters(next);
    localStorage.setItem("franchise_saved_filters", JSON.stringify(next));
  }

  function loadFilterPreset(preset: { name: string; filters: Record<string, string> }) {
    setStatusFilter(preset.filters.statusFilter ?? "");
    setApplicantTypeFilter(preset.filters.applicantTypeFilter ?? "");
    setSalesFilter(preset.filters.salesFilter ?? "");
    setCsFilter(preset.filters.csFilter ?? "");
    setSortBy((preset.filters.sortBy as typeof sortBy) ?? "updated_at");
  }

  function removeFilterPreset(name: string) {
    if (!confirm(`'${name}' 프리셋을 삭제하시겠습니까?`)) return;
    const next = savedFilters.filter((f) => f.name !== name);
    setSavedFilters(next);
    localStorage.setItem("franchise_saved_filters", JSON.stringify(next));
  }

  async function handleBulkAssign() {
    if (!bulkAssignCs && !bulkAssignSales) return;
    setBulkAssigning(true);
    const supabase = createClient();
    const ids = [...selected];
    const patch: Record<string, string | null> = {};
    if (bulkAssignCs) patch.cs_id = bulkAssignCs;
    if (bulkAssignSales) patch.sales_id = bulkAssignSales;
    const { error } = await supabase.from("franchise_applications").update(patch).in("id", ids);
    setBulkAssigning(false);
    if (error) {
      toast.error("일괄 배정 실패: " + error.message);
      return;
    }
    const cs = bulkAssignCs ? (csProfiles.find((p) => p.id === bulkAssignCs) ?? null) : undefined;
    const sales = bulkAssignSales
      ? (salesProfiles.find((p) => p.id === bulkAssignSales) ?? null)
      : undefined;
    const idSet = new Set(ids);
    setLocalRows((prev) =>
      prev.map((r) =>
        idSet.has(r.id)
          ? {
              ...r,
              ...(bulkAssignCs
                ? { cs_id: bulkAssignCs, cs: cs as FranchiseApplication["cs"] }
                : {}),
              ...(bulkAssignSales
                ? { sales_id: bulkAssignSales, sales: sales as FranchiseApplication["sales"] }
                : {}),
            }
          : r,
      ),
    );
    setBulkAssignModal(false);
    setBulkAssignCs("");
    setBulkAssignSales("");
    setSelected(new Set());
  }

  function statusAgeDays(row: FranchiseApplication) {
    const ms = Date.now() - new Date(row.updated_at).getTime();
    return Math.floor(ms / 86400000);
  }

  const statusCounts = useMemo(() => {
    const counts: Partial<Record<FranchiseStatus, number>> = {};
    for (const row of localRows) {
      if (!matchesFilters(row, { skipView: true, skipKpi: true, skipStatus: true })) continue;
      counts[row.status] = (counts[row.status] ?? 0) + 1;
    }
    return counts;
  }, [localRows, matchesFilters]);

  const tableViewCounts = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = localRows.filter((row) => {
      if (!matchesFilters(row, { skipView: true, skipKpi: true })) return false;
      if (!term) return true;
      const haystack =
        `${row.business_name ?? ""} ${row.owner_name ?? ""} ${row.phone ?? ""} ${row.business_number ?? ""}`.toLowerCase();
      return haystack.includes(term);
    });
    return {
      all: base.length,
      mine: base.filter(
        (row) =>
          (row.sales_id === currentUserId || row.cs_id === currentUserId) &&
          !COMPLETED_STATUS_SET.has(row.status),
      ).length,
      doc_incomplete: base.filter((row) => row.status === "doc_incomplete").length,
      doc_waiting: base.filter((row) => row.status === "doc_waiting").length,
      approved: base.filter((row) => APPROVED_STATUS_SET.has(row.status)).length,
    };
  }, [localRows, search, matchesFilters, currentUserId]);

  const kpiCounts = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = localRows.filter((row) => {
      if (!matchesFilters(row, { skipView: true, skipKpi: true, skipStatus: true })) return false;
      if (!term) return true;
      const haystack =
        `${row.business_name ?? ""} ${row.owner_name ?? ""} ${row.phone ?? ""} ${row.business_number ?? ""}`.toLowerCase();
      return haystack.includes(term);
    });
    return {
      today_received: base.filter(
        (row) => format(new Date(row.created_at), "yyyy-MM-dd") === todayDate,
      ).length,
      doc_waiting: base.filter((row) => row.status === "doc_waiting").length,
      doc_incomplete: base.filter((row) => row.status === "doc_incomplete").length,
      reviewing: base.filter((row) => REVIEWING_STATUS_SET.has(row.status)).length,
      today_completed: base.filter(
        (row) => APPROVED_STATUS_SET.has(row.status) && todayCompletedIdSet.has(row.id),
      ).length,
    };
  }, [localRows, search, matchesFilters, todayDate, todayCompletedIdSet]);

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

  const handleDelete = useCallback(() => {
    if (selected.size === 0) return;
    setDeleteConfirmOpen(true);
  }, [selected]);

  const confirmDelete = useCallback(async () => {
    setDeleting(true);
    const { error } = await deleteFranchiseRows([...selected]);
    setDeleting(false);
    setDeleteConfirmOpen(false);
    if (error) {
      toast.error("삭제 실패: " + error);
      return;
    }
    setLocalRows((prev) => prev.filter((r) => !selected.has(r.id)));
    setSelected(new Set());
  }, [selected, toast]);

  async function handleCreate(form: FranchiseCreateInput): Promise<boolean> {
    if (form.phone || form.business_name || form.business_number) {
      const dupe = localRows.find(
        (r) =>
          (form.phone && r.phone === form.phone) ||
          (form.business_name && r.business_name === form.business_name) ||
          (form.business_number && r.business_number === form.business_number),
      );
      if (dupe) {
        const label = dupe.business_name || dupe.owner_name || dupe.phone || "";
        if (
          !confirm(
            `"${label}" 건이 이미 접수되어 있습니다 (상태: ${FRANCHISE_STATUS_LABEL[dupe.status]}). 그래도 등록하시겠습니까?`,
          )
        )
          return false;
      }
    }
    setSubmitting(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("franchise_applications")
      .insert({
        business_name: form.business_name || null,
        owner_name: form.owner_name || null,
        phone: form.phone ? formatPhone(form.phone) : null,
        business_number: form.business_number ? formatBusinessNumber(form.business_number) : null,
        equipment_items: form.equipmentItems,
        address: form.address || null,
        address_detail: form.address_detail || null,
        title: form.title || null,
        sales_id: form.sales_id || null,
        cs_id: form.cs_id || null,
        applicant_type: form.applicant_type,
        status: "doc_waiting",
        reception_channel_code: form.reception_channel_code || null,
        option_code: form.option_code || null,
        case_type_code: "NEW",
        reception_date: form.reception_date ? formatDateText(form.reception_date) : null,
        open_date: form.open_date ? formatDateText(form.open_date) : null,
        install_date: form.install_date ? formatDateText(form.install_date) : null,
        van_company_codes: form.van_company_codes,
        internet: form.internet || null,
        memo: form.memo || null,
        created_by: currentUserId,
      })
      .select()
      .single();
    setSubmitting(false);
    if (error) {
      toast.error("등록 실패: " + error.message);
      return false;
    }

    if (form.sendDocNotify && form.phone) {
      const docCase = docCaseOf(form.owner_name, form.business_name);
      try {
        await fetch("/api/franchise/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "doc_request",
            phone: form.phone,
            ownerName: form.owner_name,
            businessName: form.business_name,
            applicantType: form.applicant_type,
            docCase,
          }),
        });
      } catch {}
    }
    setShowForm(false);
    const sales = form.sales_id
      ? (salesProfiles.find((p) => p.id === form.sales_id) ?? null)
      : null;
    const cs = form.cs_id ? (csProfiles.find((p) => p.id === form.cs_id) ?? null) : null;
    setLocalRows((prev) => [
      {
        ...data,
        sales: sales as FranchiseApplication["sales"],
        cs: cs as FranchiseApplication["cs"],
        creator: { name: currentUserName } as FranchiseApplication["creator"],
      },
      ...prev,
    ]);
    return true;
  }

  async function updateStatus(
    row: FranchiseApplication,
    status: FranchiseStatus,
    sendNotify: boolean,
    docCase?: DocCase,
  ) {
    setBusyId(row.id);
    const supabase = createClient();
    const patch: Record<string, unknown> = { status };
    if (status === "doc_waiting") patch.doc_template = APPLICANT_TYPE_LABEL[row.applicant_type];
    const { error } = await supabase.from("franchise_applications").update(patch).eq("id", row.id);
    if (error) {
      setBusyId(null);
      toast.error("상태 변경 실패: " + error.message);
      return;
    }

    await supabase.from("franchise_application_logs").insert({
      franchise_application_id: row.id,
      user_id: currentUserId,
      from_status: row.status,
      to_status: status,
    });

    const { linkedInstall } = await applyFranchiseStatusSideEffects({
      row,
      status,
      sendNotify,
      docCase,
      currentUserId,
      toast,
    });
    if (linkedInstall) setLocalLinkedInstalls((prev) => ({ ...prev, [row.id]: linkedInstall }));
    setBusyId(null);
    setLocalRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...r,
              status,
              doc_template:
                status === "doc_waiting"
                  ? APPLICANT_TYPE_LABEL[row.applicant_type]
                  : r.doc_template,
              updated_at: new Date().toISOString(),
            }
          : r,
      ),
    );
  }

  async function updateApplicantType(row: FranchiseApplication, applicantType: ApplicantType) {
    if (applicantType === row.applicant_type) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("franchise_applications")
      .update({ applicant_type: applicantType })
      .eq("id", row.id);
    if (error) {
      toast.error("사업자 유형 변경 실패: " + error.message);
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

  async function updateCs(row: FranchiseApplication, csId: string) {
    if (csId === (row.cs_id ?? "")) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("franchise_applications")
      .update({ cs_id: csId || null })
      .eq("id", row.id);
    if (error) {
      toast.error("담당 CS 변경 실패: " + error.message);
      return;
    }
    const cs = csId ? (csProfiles.find((p) => p.id === csId) ?? null) : null;
    setLocalRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...r,
              cs_id: csId || undefined,
              cs: cs as FranchiseApplication["cs"],
              updated_at: new Date().toISOString(),
            }
          : r,
      ),
    );
  }

  async function updateSales(row: FranchiseApplication, salesId: string) {
    if (salesId === (row.sales_id ?? "")) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("franchise_applications")
      .update({ sales_id: salesId || null })
      .eq("id", row.id);
    if (error) {
      toast.error("담당 영업 변경 실패: " + error.message);
      return;
    }
    const sales = salesId ? (salesProfiles.find((p) => p.id === salesId) ?? null) : null;
    setLocalRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...r,
              sales_id: salesId || undefined,
              sales: sales as FranchiseApplication["sales"],
              updated_at: new Date().toISOString(),
            }
          : r,
      ),
    );
  }

  const saveField = useCallback(
    async (row: FranchiseApplication, field: keyof FranchiseApplication, value: string) => {
      const supabase = createClient();
      const saveValue: string | null = value || null;
      const { error } = await supabase
        .from("franchise_applications")
        .update({ [field]: saveValue })
        .eq("id", row.id);
      if (error) {
        toast.error("수정 실패: " + error.message);
        return;
      }

      const linked = localLinkedInstallsRef.current[row.id];
      if (
        linked &&
        (field === "business_name" ||
          field === "owner_name" ||
          field === "phone" ||
          field === "address")
      ) {
        const patch: Record<string, string | null> = {};
        if (field === "business_name" || field === "owner_name") {
          const businessName = field === "business_name" ? saveValue : row.business_name;
          const ownerName = field === "owner_name" ? saveValue : row.owner_name;
          patch.customer_name = businessName || ownerName || "미입력";
        } else if (field === "phone") {
          patch.customer_phone = saveValue;
        } else if (field === "address") {
          patch.address = saveValue;
        }
        const { error: syncError } = await supabase
          .from("installations")
          .update(patch)
          .eq("id", linked.id);
        if (syncError) toast.error("설치관리 동기화 실패: " + syncError.message);
      }
      setLocalRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, [field]: saveValue ?? undefined, updated_at: new Date().toISOString() }
            : r,
        ),
      );
    },
    [],
  );

  async function saveEquipmentItems(row: FranchiseApplication, items: EquipmentItem[]) {
    const supabase = createClient();
    const { error } = await supabase
      .from("franchise_applications")
      .update({ equipment_items: items })
      .eq("id", row.id);
    if (error) {
      toast.error("수정 실패: " + error.message);
      return;
    }

    const linked = localLinkedInstalls[row.id];
    if (linked) {
      const { error: syncError } = await supabase
        .from("installations")
        .update({ items })
        .eq("id", linked.id);
      if (syncError) toast.error("설치관리 동기화 실패: " + syncError.message);
    }
    setLocalRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? { ...r, equipment_items: items, updated_at: new Date().toISOString() }
          : r,
      ),
    );
  }

  async function saveVanCompanyCodes(row: FranchiseApplication, codes: string[]) {
    const supabase = createClient();
    const { error } = await supabase
      .from("franchise_applications")
      .update({ van_company_codes: codes })
      .eq("id", row.id);
    if (error) {
      toast.error("수정 실패: " + error.message);
      return;
    }
    setLocalRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? { ...r, van_company_codes: codes, updated_at: new Date().toISOString() }
          : r,
      ),
    );
  }

  async function notifyAndLog(
    franchiseId: string,
    logKey: string,
    payload: Record<string, unknown>,
  ) {
    await notifyAndLogFranchiseStatus(franchiseId, logKey, payload, currentUserId, toast);
    setLogsByRow((prev) =>
      prev[franchiseId] ? { ...prev, [franchiseId]: undefined as any } : prev,
    );
  }

  function handleExcel() {
    import("xlsx").then((XLSX) => {
      const data = filteredRows.map((r) => ({
        상호명: r.business_name ?? "",
        대표자: r.owner_name ?? "",
        연락처: r.phone ?? "",
        사업자번호: r.business_number ?? "",
        사업자유형: APPLICANT_TYPE_LABEL[r.applicant_type],
        접수채널: RECEPTION_CHANNEL_LABEL[
          r.reception_channel_code as keyof typeof RECEPTION_CHANNEL_LABEL
        ] ?? "",
        상태: FRANCHISE_STATUS_LABEL[r.status],
        VAN사: (r.van_company_codes ?? [])
          .map((code) => VAN_COMPANY_LABEL[code as keyof typeof VAN_COMPANY_LABEL] ?? code)
          .join(", "),
        인터넷: r.internet ?? "",
        주소: r.address ?? "",
        오픈예정일: r.open_date ?? "",
        설치발송일: r.install_date ?? "",
        담당영업: (r as any).sales?.name ?? "",
        담당CS: (r as any).cs?.name ?? "",
        비고: r.memo ?? "",
        등록일: format(new Date(r.created_at), "yyyy-MM-dd", { locale: ko }),
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "가맹접수");
      XLSX.writeFile(wb, `가맹접수_${format(new Date(), "yyyyMMdd")}.xlsx`);
    });
  }

  async function handleBulkStatusChange() {
    if (!bulkStatus) return;
    setBulkChanging(true);
    const supabase = createClient();
    const ids = [...selected];
    const rowsBefore = localRows.filter((r) => ids.includes(r.id));
    const { error } = await supabase
      .from("franchise_applications")
      .update({ status: bulkStatus })
      .in("id", ids);
    if (error) {
      setBulkChanging(false);
      toast.error("일괄 변경 실패: " + error.message);
      return;
    }
    await supabase.from("franchise_application_logs").insert(
      rowsBefore.map((r) => ({
        franchise_application_id: r.id,
        user_id: currentUserId,
        from_status: r.status,
        to_status: bulkStatus,
      })),
    );
    setBulkChanging(false);
    const idSet = new Set(ids);
    const status = bulkStatus;
    setLocalRows((prev) =>
      prev.map((r) =>
        idSet.has(r.id) ? { ...r, status, updated_at: new Date().toISOString() } : r,
      ),
    );
    setBulkStatusModal(false);
    setBulkStatus("");
    setSelected(new Set());
  }

  function requestTransferApproval(row: FranchiseApplication) {
    if (!["cs_manager", "cs_responsible"].includes(currentUserApprovalRole)) {
      toast.warning("이관 승인요청은 CS매니저 또는 CS책임만 등록할 수 있습니다.");
      return;
    }
    const existing = transferApprovals[row.id];
    if (
      existing &&
      existing.status !== "rejected" &&
      localLinkedInstalls[row.id]?.status !== "rejected"
    ) {
      toast.warning(
        existing.status === "requested"
          ? "이미 이관 승인요청이 진행 중입니다."
          : "이미 이관 승인 처리가 완료된 접수입니다.",
      );
      return;
    }
    setTransferRequestNote("");
    setTransferRequestRow(row);
  }

  async function submitTransferRequest() {
    const row = transferRequestRow;
    if (!row) return;
    const note = transferRequestNote.trim();
    const requestedByResponsible = currentUserApprovalRole === "cs_responsible";
    const existing = transferApprovals[row.id];
    const approvalStatus = requestedByResponsible
      ? ("cs_responsible_approved" as const)
      : ("requested" as const);
    const approvalNotes = appendApprovalNote(
      existing?.approval_notes,
      { id: currentUserId, name: currentUserName, role: currentUserApprovalRole },
      note,
      "request",
    );
    const approval = {
      franchise_application_id: row.id,
      status: approvalStatus,
      delivery_type: null,
      requested_by: currentUserId,
      requested_by_name: currentUserName || "사용자",
      requested_at: new Date().toISOString(),
      approved_by: null,
      approved_by_name: null,
      approved_at: null,
      cs_approved_by: requestedByResponsible ? currentUserId : null,
      cs_approved_by_name: requestedByResponsible ? currentUserName || "CS책임" : null,
      cs_approved_at: requestedByResponsible ? new Date().toISOString() : null,
      approval_notes: approvalNotes,
    };
    setTransferringId(row.id);
    const result = await requestFranchiseTransfer(row.id, note);
    setTransferringId(null);
    if (result.error) {
      toast.error("승인요청 실패: " + result.error);
      return;
    }
    if (result.notificationError) {
      toast.warning(
        `승인요청은 등록됐지만 ${requestedByResponsible ? "팀장" : "CS책임"} 팝업 알림에 실패했습니다: ` +
          result.notificationError,
      );
    }
    setTransferApprovals((prev) => ({ ...prev, [row.id]: approval }));
    toast.success(
      requestedByResponsible
        ? "팀장 최종 승인요청을 등록했습니다."
        : "기술지원 이관 승인요청을 등록했습니다.",
    );
    setTransferRequestRow(null);
    setTransferRequestNote("");
  }

  function approveTransfer(row: FranchiseApplication) {
    const approval = transferApprovals[row.id];
    if (!approval) return;
    if (approval.requested_by === currentUserId) {
      toast.warning("요청자는 직접 승인할 수 없습니다.");
      return;
    }
    const isCsResponsibleApproval =
      currentUserApprovalRole === "cs_responsible" && approval.status === "requested";
    const isTeamLeadApproval =
      currentUserApprovalRole === "team_lead" && approval.status === "cs_responsible_approved";
    if (!isCsResponsibleApproval && !isTeamLeadApproval) {
      toast.warning("현재 승인 단계의 권한이 없습니다.");
      return;
    }
    if (isTeamLeadApproval) {
      setTeamLeadDeliveryType("");
      setTeamLeadTransferNote("");
      setTeamLeadTransferRow(row);
      return;
    }
    setCsApprovalNote("");
    setCsApprovalRow(row);
  }

  async function submitCsApproval() {
    const row = csApprovalRow;
    const approval = row && transferApprovals[row.id];
    if (!row || !approval) return;
    const note = csApprovalNote.trim();
    setTransferringId(row.id);
    const result = await approveCsResponsibleTransfer(row.id, note);
    setTransferringId(null);
    if (result.error) {
      toast.error("승인 실패: " + result.error);
      return;
    }
    if ("notificationError" in result && result.notificationError) {
      toast.warning(
        "1차 승인은 완료됐지만 팀장 팝업 알림에 실패했습니다: " + result.notificationError,
      );
    }
    setTransferApprovals((prev) => ({
      ...prev,
      [row.id]: {
        ...approval,
        status: "cs_responsible_approved",
        cs_approved_by_name: currentUserName || "CS책임",
        approval_notes: appendApprovalNote(
          approval.approval_notes,
          { id: currentUserId, name: currentUserName, role: currentUserApprovalRole },
          note,
          "first_approval",
        ),
      },
    }));
    toast.success("CS책임 승인 완료. 팀장 최종 승인을 기다립니다.");
    setCsApprovalRow(null);
    setCsApprovalNote("");
  }

  async function submitTeamLeadTransfer() {
    const row = teamLeadTransferRow;
    const approval = row && transferApprovals[row.id];
    if (!row || !approval || !teamLeadDeliveryType) return;
    const note = teamLeadTransferNote.trim();
    const deliveryType = teamLeadDeliveryType as InstallationDeliveryType;
    setTransferringId(row.id);
    const result = await approveFranchiseTransfer(row.id, deliveryType, note);
    setTransferringId(null);
    if (result.error) {
      toast.error("승인 실패: " + result.error);
      return;
    }
    if ("notificationError" in result && result.notificationError) {
      toast.warning(
        "이관은 완료됐지만 기술지원 내부 알림에 실패했습니다: " + result.notificationError,
      );
    }
    const approvedAt = new Date().toISOString();
    setTransferApprovals((prev) => ({
      ...prev,
      [row.id]: {
        ...approval,
        status: "approved",
        delivery_type: deliveryType,
        approved_by: currentUserId,
        approved_by_name: currentUserName || "관리자",
        approved_at: approvedAt,
        approval_notes: appendApprovalNote(
          approval.approval_notes,
          { id: currentUserId, name: currentUserName, role: currentUserApprovalRole },
          note,
          "final_approval",
        ),
      },
    }));
    setTeamLeadTransferRow(null);
    setTeamLeadTransferNote("");
    const supabase = createClient();
    const { data: linkedInstall } = await supabase
      .from("installations")
      .select("id,status")
      .eq("franchise_application_id", row.id)
      .maybeSingle();
    if (linkedInstall) setLocalLinkedInstalls((prev) => ({ ...prev, [row.id]: linkedInstall }));
    toast.success("승인되어 기술지원 설치건이 자동 이관되었습니다.");
    router.refresh();
  }

  function classifyTransfer(row: FranchiseApplication): "insert" | "update" | "skip" {
    const existing = localLinkedInstalls[row.id];
    if (!existing) return "insert";
    if (existing.status === "rejected") return "update";
    return "skip";
  }

  function handleBulkTransfer() {
    const targetRows = localRows.filter((r) => selected.has(r.id));
    const toInsert = targetRows.filter((r) => classifyTransfer(r) === "insert");
    const toUpdate = targetRows.filter((r) => classifyTransfer(r) === "update");
    if (toInsert.length === 0 && toUpdate.length === 0) {
      toast.warning("이관 가능한 건이 없습니다. 이미 모두 이관된 상태입니다.");
      return;
    }
    setBulkTransferNote("");
    setBulkTransferNoteModal(true);
  }

  async function submitBulkTransfer() {
    const note = bulkTransferNote.trim();
    const targetRows = localRows.filter((r) => selected.has(r.id));
    const toInsert = targetRows.filter((r) => classifyTransfer(r) === "insert");
    const toUpdate = targetRows.filter((r) => classifyTransfer(r) === "update");
    setBulkTransferNoteModal(false);
    setBulkTransferring(true);
    const rows = [...toInsert, ...toUpdate];
    const results = await Promise.all(
      rows.map(async (row) => ({ row, result: await requestFranchiseTransfer(row.id, note) })),
    );
    const succeeded = results.filter((item) => !item.result.error);
    const failed = results.filter((item) => item.result.error);
    const notificationFailed = results.filter(
      (item) => !item.result.error && item.result.notificationError,
    );
    const requestedAt = new Date().toISOString();
    setTransferApprovals((prev) => {
      const next = { ...prev };
      for (const { row, result } of succeeded) {
        const approvalStatus =
          "approvalStatus" in result && result.approvalStatus ? result.approvalStatus : "requested";
        const requestedByResponsible = approvalStatus === "cs_responsible_approved";
        next[row.id] = {
          franchise_application_id: row.id,
          status: approvalStatus,
          delivery_type: null,
          requested_by: currentUserId,
          requested_by_name: currentUserName || "사용자",
          requested_at: requestedAt,
          approved_by: null,
          approved_by_name: null,
          approved_at: null,
          cs_approved_by: requestedByResponsible ? currentUserId : null,
          cs_approved_by_name: requestedByResponsible ? currentUserName || "CS책임" : null,
          cs_approved_at: requestedByResponsible ? requestedAt : null,
          approval_notes: appendApprovalNote(
            prev[row.id]?.approval_notes,
            { id: currentUserId, name: currentUserName, role: currentUserApprovalRole },
            note,
            "request",
          ),
        };
      }
      return next;
    });

    setBulkTransferring(false);
    setSelected(new Set());

    if (succeeded.length)
      toast.success(
        `${succeeded.length}건 ${currentUserApprovalRole === "cs_responsible" ? "팀장 최종 " : ""}기술지원 이관 승인요청 완료`,
      );
    if (failed.length) toast.error(`${failed.length}건 승인요청 실패: ${failed[0].result.error}`);
    if (notificationFailed.length)
      toast.warning(
        `${notificationFailed.length}건의 ${currentUserApprovalRole === "cs_responsible" ? "팀장" : "CS책임"} 팝업 알림 발송에 실패했습니다.`,
      );
  }

  async function linkToInternet(row: FranchiseApplication) {
    if (localLinkedInternets[row.id]) {
      toast.warning("이미 인터넷관리에 등록된 접수입니다.");
      return;
    }
    if (
      !confirm(
        `'${row.business_name || row.owner_name || "미입력"}' 접수를 인터넷관리 탭에 등록하시겠습니까?`,
      )
    )
      return;
    setLinkingInternetId(row.id);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("internet_management")
      .insert({
        business_name: row.business_name || null,
        owner_name: row.owner_name || null,
        phone: row.phone || null,
        franchise_application_id: row.id,
        sort_order: Date.now(),
      })
      .select("id, status, category")
      .single();
    setLinkingInternetId(null);
    if (error) {
      toast.error("인터넷관리 등록 실패: " + error.message);
      return;
    }
    setLocalLinkedInternets((prev) => ({
      ...prev,
      [row.id]: { id: data.id, status: data.status, category: data.category },
    }));
  }

  function handleStatusChange(row: FranchiseApplication, newStatus: FranchiseStatus) {
    if (newStatus === row.status) return;

    const silentStatus = newStatus === "completed" || newStatus === "hold";
    const canNotify = !silentStatus && !!row.phone;
    const confirmMsg =
      newStatus === "completed"
        ? `'완료'로 상태만 변경됩니다. (고객 안내 메시지는 발송되지 않습니다)`
        : newStatus === "hold"
          ? `'보류'로 상태만 변경됩니다. (고객 안내 메시지는 발송되지 않습니다)`
          : newStatus === "doc_waiting"
            ? `'${APPLICANT_TYPE_LABEL[row.applicant_type]}' 서류 안내 메시지가 고객에게 발송됩니다. 아래에서 보낼 템플릿이 맞는지 확인 후 진행하세요.`
            : newStatus === "toss_review_done"
              ? `토스심사완료로 변경하면 고객에게 메시지가 발송되고, 입력된 정보로 설치 작업이 자동 생성됩니다.`
              : `'${FRANCHISE_STATUS_LABEL[newStatus]}'(으)로 변경하면 고객에게 메시지가 발송됩니다.`;
    setStatusConfirm({
      row,
      newStatus,
      msg: silentStatus
        ? confirmMsg
        : canNotify
          ? confirmMsg
          : "연락처가 없어 메시지 발송 없이 상태만 변경됩니다.",
      docCase:
        newStatus === "doc_waiting" ? docCaseOf(row.owner_name, row.business_name) : undefined,
    });
  }

  async function toggleExpand(row: FranchiseApplication) {
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
  }

  async function openHistory(row: FranchiseApplication) {
    setHistoryOpenId(row.id);
    if (memosByRow[row.id]) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("franchise_application_memos")
      .select("*, user:profiles(name)")
      .eq("franchise_application_id", row.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("히스토리 불러오기 실패: " + error.message);
      return;
    }
    setMemosByRow((prev) => ({ ...prev, [row.id]: data ?? [] }));
  }

  async function addMemo(row: FranchiseApplication, content: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("franchise_application_memos")
      .insert({
        franchise_application_id: row.id,
        user_id: currentUserId,
        author_name: currentUserName,
        content,
      })
      .select("*, user:profiles(name)")
      .single();
    if (error) {
      toast.error("히스토리 등록 실패: " + error.message);
      return;
    }
    setMemosByRow((prev) => ({ ...prev, [row.id]: [data, ...(prev[row.id] ?? [])] }));
  }

  async function toggleMemoPin(row: FranchiseApplication, memo: FranchiseApplicationMemo) {
    const supabase = createClient();
    const nextPinnedAt = memo.pinned_at ? null : new Date().toISOString();
    const { error } = await supabase
      .from("franchise_application_memos")
      .update({ pinned_at: nextPinnedAt })
      .eq("id", memo.id);
    if (error) {
      toast.error("고정 변경 실패: " + error.message);
      return;
    }
    setMemosByRow((prev) => ({
      ...prev,
      [row.id]: (prev[row.id] ?? []).map((m) =>
        m.id === memo.id ? { ...m, pinned_at: nextPinnedAt } : m,
      ),
    }));
  }

  async function deleteMemo(row: FranchiseApplication, memo: FranchiseApplicationMemo) {
    if (!confirm("이 메모를 삭제하시겠습니까?")) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("franchise_application_memos")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", memo.id);
    if (error) {
      toast.error("삭제 실패: " + error.message);
      return;
    }
    setMemosByRow((prev) => ({
      ...prev,
      [row.id]: (prev[row.id] ?? []).filter((m) => m.id !== memo.id),
    }));
  }

  const canNotifyConfirm = statusConfirm
    ? statusConfirm.newStatus !== "completed" &&
      statusConfirm.newStatus !== "hold" &&
      !!statusConfirm.row.phone
    : false;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {}
      {showShortcuts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl shadow-xl p-6 w-72 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-bold text-slate-800">⌨️ 단축키 안내</p>
            {[
              ["N", "신규 접수 폼 열기/닫기"],
              ["?", "단축키 도움말"],
              ["Esc", "모달/폼 닫기"],
            ].map(([key, desc]) => (
              <div key={key} className="flex items-center gap-3">
                <kbd className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded font-mono font-bold min-w-[32px] text-center">
                  {key}
                </kbd>
                <span className="text-sm text-slate-600">{desc}</span>
              </div>
            ))}
            <button
              onClick={() => setShowShortcuts(false)}
              className="mt-2 text-xs text-slate-400 hover:text-slate-600 text-center"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {}
      {bulkAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-6 w-72 flex flex-col gap-4">
            <p className="text-sm font-bold text-slate-800">{selected.size}건 일괄 담당자 배정</p>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500">담당 CS</label>
              <select
                value={bulkAssignCs}
                onChange={(e) => setBulkAssignCs(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">변경 안함</option>
                {csProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500">담당 영업</label>
              <select
                value={bulkAssignSales}
                onChange={(e) => setBulkAssignSales(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">변경 안함</option>
                {salesProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleBulkAssign}
                disabled={(!bulkAssignCs && !bulkAssignSales) || bulkAssigning}
                className="w-full py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {bulkAssigning ? "배정 중..." : "배정 확정"}
              </button>
              <button
                onClick={() => {
                  setBulkAssignModal(false);
                  setBulkAssignCs("");
                  setBulkAssignSales("");
                }}
                className="w-full py-2 rounded-lg text-slate-400 text-sm hover:text-slate-600"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {}
      {bulkStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-6 w-72 flex flex-col gap-4">
            <p className="text-sm font-bold text-slate-800">{selected.size}건 일괄 상태 변경</p>
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value as FranchiseStatus)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">상태 선택</option>
              {SELECTABLE_FRANCHISE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {FRANCHISE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setBulkStatusConfirmOpen(true)}
                disabled={!bulkStatus || bulkChanging}
                className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {bulkChanging ? "변경 중..." : "변경 확정"}
              </button>
              <button
                onClick={() => {
                  setBulkStatusModal(false);
                  setBulkStatus("");
                }}
                className="w-full py-2 rounded-lg text-slate-400 text-sm hover:text-slate-600"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      <BulkConfirmDialog
        open={bulkStatusConfirmOpen}
        title="일괄 상태 변경"
        busy={bulkChanging}
        confirmText="변경"
        items={localRows
          .filter((r) => selected.has(r.id))
          .map((r) => ({
            id: r.id,
            label: r.business_name || r.owner_name || r.id,
            detail: bulkStatus
              ? `${FRANCHISE_STATUS_LABEL[r.status]} → ${FRANCHISE_STATUS_LABEL[bulkStatus]}`
              : undefined,
          }))}
        onCancel={() => setBulkStatusConfirmOpen(false)}
        onConfirm={async () => {
          setBulkStatusConfirmOpen(false);
          await handleBulkStatusChange();
        }}
      />

      <BulkConfirmDialog
        open={deleteConfirmOpen}
        title="선택 항목 삭제"
        busy={deleting}
        confirmText="삭제"
        confirmColor="red"
        items={localRows
          .filter((r) => selected.has(r.id))
          .map((r) => ({
            id: r.id,
            label: r.business_name || r.owner_name || r.id,
          }))}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={confirmDelete}
      />

      {(() => {
        const targetRows = localRows.filter((r) => selected.has(r.id));
        const transferableRows = targetRows.filter((r) => classifyTransfer(r) !== "skip");
        return (
          <BulkConfirmDialog
            open={bulkTransferConfirmOpen}
            title="일괄 기술지원 이관 승인요청"
            busy={bulkTransferring}
            confirmText="승인요청"
            subtitle={`총 ${transferableRows.length}건의 이관 승인을 요청합니다. 구분은 팀장이 최종 승인할 때 선택합니다.`}
            confirmQuestion="승인요청하시겠습니까?"
            items={transferableRows.map((row) => ({
              id: row.id,
              label: row.business_name || row.owner_name || row.id,
              detail: classifyTransfer(row) === "update" ? "재이관" : "이관",
            }))}
            onCancel={() => setBulkTransferConfirmOpen(false)}
            onConfirm={async () => {
              setBulkTransferConfirmOpen(false);
              await handleBulkTransfer();
            }}
          />
        );
      })()}

      {teamLeadTransferRow && (
        <FormModal
          title="기술지원 이관 최종 승인"
          onClose={() => !transferringId && setTeamLeadTransferRow(null)}
        >
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {teamLeadTransferRow.business_name ||
                teamLeadTransferRow.owner_name ||
                teamLeadTransferRow.id}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                이관 구분 <span className="text-red-500">*</span>
              </label>
              <select
                value={teamLeadDeliveryType}
                onChange={(event) =>
                  setTeamLeadDeliveryType(event.target.value as InstallationDeliveryType | "")
                }
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">구분을 선택해주세요</option>
                {INSTALLATION_DELIVERY_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                기술지원에 전달할 비고
              </label>
              <textarea
                value={teamLeadTransferNote}
                onChange={(event) => setTeamLeadTransferNote(event.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="기술지원이 확인할 내용을 입력해주세요. (선택 사항)"
                className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <p className="mt-1 text-right text-xs text-slate-400">
                {teamLeadTransferNote.length}/2,000
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTeamLeadTransferRow(null)}
                disabled={!!transferringId}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitTeamLeadTransfer}
                disabled={!teamLeadDeliveryType || !!transferringId}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {transferringId ? "승인 중..." : "구분 선택 후 최종 승인"}
              </button>
            </div>
          </div>
        </FormModal>
      )}

      {transferRequestRow && (
        <FormModal
          title="기술지원 이관 승인요청"
          onClose={() => !transferringId && setTransferRequestRow(null)}
        >
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {transferRequestRow.business_name ||
                transferRequestRow.owner_name ||
                transferRequestRow.id}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                {currentUserApprovalRole === "cs_responsible"
                  ? "팀장에게 전달할 비고"
                  : "CS책임에게 전달할 비고"}
              </label>
              <textarea
                value={transferRequestNote}
                onChange={(event) => setTransferRequestNote(event.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="다음 승인자가 확인할 내용을 입력해주세요. (선택 사항)"
                className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <p className="mt-1 text-right text-xs text-slate-400">
                {transferRequestNote.length}/2,000
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTransferRequestRow(null)}
                disabled={!!transferringId}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitTransferRequest}
                disabled={!!transferringId}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {transferringId ? "요청 중..." : "승인요청"}
              </button>
            </div>
          </div>
        </FormModal>
      )}

      {csApprovalRow && (
        <FormModal title="이관 승인" onClose={() => !transferringId && setCsApprovalRow(null)}>
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {csApprovalRow.business_name || csApprovalRow.owner_name || csApprovalRow.id}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                팀장에게 전달할 비고
              </label>
              <textarea
                value={csApprovalNote}
                onChange={(event) => setCsApprovalNote(event.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="팀장이 확인할 내용을 입력해주세요. (선택 사항)"
                className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <p className="mt-1 text-right text-xs text-slate-400">
                {csApprovalNote.length}/2,000
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCsApprovalRow(null)}
                disabled={!!transferringId}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitCsApproval}
                disabled={!!transferringId}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {transferringId ? "승인 중..." : "승인"}
              </button>
            </div>
          </div>
        </FormModal>
      )}

      {bulkTransferNoteModal && (
        <FormModal
          title="일괄 기술지원 이관 비고"
          onClose={() => !bulkTransferring && setBulkTransferNoteModal(false)}
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                선택한 모든 이관 건에 적용할 전달 비고
              </label>
              <textarea
                value={bulkTransferNote}
                onChange={(event) => setBulkTransferNote(event.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="다음 승인자가 확인할 내용을 입력해주세요. (선택 사항)"
                className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <p className="mt-1 text-right text-xs text-slate-400">
                {bulkTransferNote.length}/2,000
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkTransferNoteModal(false)}
                disabled={bulkTransferring}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitBulkTransfer}
                disabled={bulkTransferring}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {bulkTransferring ? "요청 중..." : "승인요청"}
              </button>
            </div>
          </div>
        </FormModal>
      )}

      {statusConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-6 w-80 flex flex-col gap-4">
            <p className="text-sm text-slate-700 leading-relaxed">{statusConfirm.msg}</p>
            {statusConfirm.newStatus === "doc_waiting" && statusConfirm.docCase && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">
                  발송 템플릿 ({APPLICANT_TYPE_LABEL[statusConfirm.row.applicant_type]})
                </label>
                <select
                  value={statusConfirm.docCase}
                  onChange={(e) =>
                    setStatusConfirm((prev) =>
                      prev ? { ...prev, docCase: e.target.value as DocCase } : prev,
                    )
                  }
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                >
                  {(Object.keys(DOC_CASE_LABEL) as DocCase[]).map((c) => (
                    <option key={c} value={c}>
                      {DOC_CASE_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {canNotifyConfirm ? (
                <>
                  <button
                    className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                    onClick={() => {
                      const c = statusConfirm;
                      setStatusConfirm(null);
                      updateStatus(c.row, c.newStatus, true, c.docCase);
                    }}
                  >
                    카톡 발송 후 변경
                  </button>
                  <button
                    className="w-full py-2 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200"
                    onClick={() => {
                      const c = statusConfirm;
                      setStatusConfirm(null);
                      updateStatus(c.row, c.newStatus, false, c.docCase);
                    }}
                  >
                    알림톡 없이 상태만 변경
                  </button>
                </>
              ) : (
                <button
                  className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                  onClick={() => {
                    const c = statusConfirm;
                    setStatusConfirm(null);
                    updateStatus(c.row, c.newStatus, false, c.docCase);
                  }}
                >
                  상태 변경
                </button>
              )}
              <button
                className="w-full py-2 rounded-lg text-slate-400 text-sm hover:text-slate-600"
                onClick={() => setStatusConfirm(null)}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
      {}
      <FranchiseReceiptSurface
        rows={pagedRows}
        allRows={localRows}
        filteredCount={filteredRows.length}
        selected={selected}
        allChecked={allChecked}
        page={page}
        totalPages={totalPages}
        kpiCounts={kpiCounts}
        activeKpi={activeKpi}
        tableView={tableView}
        tableViewCounts={tableViewCounts}
        search={search}
        statusFilter={statusFilter}
        applicantTypeFilter={applicantTypeFilter}
        channelFilter={channelFilter}
        dateFrom={dateFrom}
        dateTo={dateTo}
        sortBy={sortBy}
        csProfiles={csProfiles}
        linkedInstalls={localLinkedInstalls}
        linkedInternets={localLinkedInternets}
        busyId={busyId}
        onHelp={() => setShowShortcuts(true)}
        onNew={() => setShowForm(true)}
        onKpiChange={(key) => {
          setActiveKpi((current) => (current === key ? null : key));
          setTableView("all");
          setStatusFilter("");
        }}
        onTableViewChange={(view, kpi) => {
          setTableView(view);
          setActiveKpi(kpi ?? null);
          setStatusFilter("");
        }}
        onSearchChange={setSearch}
        onStatusFilterChange={setStatusFilter}
        onApplicantTypeFilterChange={setApplicantTypeFilter}
        onChannelFilterChange={setChannelFilter}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onSortChange={setSortBy}
        onToggleAll={toggleAll}
        onToggleRow={toggleOne}
        onSaveField={saveField}
        onApplicantTypeChange={updateApplicantType}
        onCsChange={updateCs}
        onStatusChange={handleStatusChange}
        onOpenDetail={toggleExpand}
        onOpenMemo={(id) => {
          const row = localRows.find((r) => r.id === id);
          if (row) void openHistory(row);
        }}
        onPageChange={setPage}
        onSelectAllFiltered={selectAllFiltered}
        onBulkStatus={() => setBulkStatusModal(true)}
        onBulkAssign={() => setBulkAssignModal(true)}
        onBulkDelete={handleDelete}
        onBulkTransfer={() => setBulkTransferConfirmOpen(true)}
      />

      {showForm && (
        <FranchiseCreateDialog
          onSubmit={handleCreate}
          submitting={submitting}
          onClose={() => setShowForm(false)}
          csProfiles={csProfiles}
        />
      )}

      {expandedId &&
        (() => {
          const row = localRows.find((item) => item.id === expandedId);
          if (!row) return null;
          return (
            <FranchiseDetailDrawer
              key={row.id}
              row={row}
              salesProfiles={salesProfiles}
              csProfiles={csProfiles}
              linkedInstall={localLinkedInstalls[row.id]}
              linkedInternet={localLinkedInternets[row.id]}
              busy={busyId === row.id}
              transferring={transferringId === row.id}
              linkingInternet={linkingInternetId === row.id}
              onClose={() => setExpandedId(null)}
              onSave={(field, value) => saveField(row, field, value)}
              onEquipmentChange={(items) => saveEquipmentItems(row, items)}
              onVanCompanyChange={(codes) => saveVanCompanyCodes(row, codes)}
              onApplicantTypeChange={(value) => updateApplicantType(row, value)}
              onCsChange={(value) => updateCs(row, value)}
              onSalesChange={(value) => updateSales(row, value)}
              onStatusChange={(value) => handleStatusChange(row, value)}
              onCopyLink={() => shareLink(row.id)}
              onResendDocuments={() => {
                if (!row.phone) return;
                const dc = docCaseOf(row.owner_name, row.business_name);
                notifyAndLog(row.id, "doc_request", {
                  type: "doc_request",
                  phone: row.phone,
                  ownerName: row.owner_name,
                  businessName: row.business_name,
                  applicantType: row.applicant_type,
                  docCase: dc,
                });
              }}
              transferApproval={
                transferApprovals[row.id]?.status === "cs_responsible_approved"
                  ? {
                      ...transferApprovals[row.id],
                      status: "requested" as const,
                      requested_by_name:
                        transferApprovals[row.id].cs_approved_by_name ||
                        transferApprovals[row.id].requested_by_name,
                    }
                  : transferApprovals[row.id]
              }
              canApproveTransfer={
                ((currentUserApprovalRole === "cs_responsible" &&
                  transferApprovals[row.id]?.status === "requested") ||
                  (currentUserApprovalRole === "team_lead" &&
                    transferApprovals[row.id]?.status === "cs_responsible_approved")) &&
                transferApprovals[row.id]?.requested_by !== currentUserId
              }
              onRequestTransfer={() => requestTransferApproval(row)}
              onApproveTransfer={() => approveTransfer(row)}
              onOpenInstalls={() => router.push("/installs")}
              onLinkInternet={() => linkToInternet(row)}
              onOpenInternet={() => router.push("/internet")}
              onOpenHistory={() => void openHistory(row)}
            />
          );
        })()}

      {historyOpenId &&
        (() => {
          const row = localRows.find((r) => r.id === historyOpenId);
          if (!row) return null;
          return (
            <FranchiseMemoDrawer
              row={row}
              entries={memosByRow[row.id]}
              onClose={() => setHistoryOpenId(null)}
              onAdd={(content) => addMemo(row, content)}
              onDelete={(memo) => deleteMemo(row, memo)}
              onTogglePin={(memo) => toggleMemoPin(row, memo)}
            />
          );
        })()}
    </div>
  );
}
