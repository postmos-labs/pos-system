"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, X, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import {
  TYPE_LABEL,
  STATUS_LABEL,
  STATUS_COLOR,
  type TicketStatus,
  type TicketType,
} from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { createInstallation } from "../installs/actions";
import { AppSelect } from "@/components/ui/AppSelect";

interface CalendarTicket {
  id: string;
  title: string;
  type: string;
  status: string;
  scheduled_at?: string | null;
  install_date?: string | null;
  open_date?: string | null;
  card_apply_date?: string | null;
  tech_id?: string | null;
  sales_id?: string | null;
  merchant?: { business_name: string } | null;
  tech?: { name: string } | null;
  sales?: { name: string } | null;
}

interface CalendarFranchiseRow {
  id: string;
  business_name?: string | null;
  status: string;
  open_date?: string | null;
  install_date?: string | null;
  sales_id?: string | null;
  sales?: { name: string } | null;
}

interface CalendarWooRow {
  id: string;
  business_name?: string | null;
  manager?: string | null;
  open_date?: string | null;
}

interface CalendarInstallRow {
  id: string;
  customer_name?: string | null;
  status: string;
  scheduled_date?: string | null;
  assigned_to?: string | null;
  delivery_type?: string | null;
  assignee?: { name: string } | null;
}

interface CalendarManualEvent {
  id: string;
  date: string;
  title: string;
  memo?: string | null;
  category?: string | null;
  assigned_to?: string | null;
  assignee?: { name: string } | null;
  created_by?: string | null;
}

interface CalendarEvent {
  date: string;
  label: string;
  category: string;
  color: string;
  href: string;
  businessName: string;
  subtitle: string;
  statusLabel?: string;
  statusColor?: string;
  type?: TicketType;
  techName?: string;
  salesName?: string;
  glow?: boolean;
  manualId?: string;
  ownerIds: string[];
  newTab?: boolean;
}

const EVENT_TYPES = [
  { key: "scheduled_at", label: "일정", color: "bg-indigo-500" },
  { key: "install_date", label: "설치", color: "bg-emerald-500" },
  { key: "open_date", label: "오픈", color: "bg-blue-500" },
  { key: "card_apply_date", label: "카드신청", color: "bg-orange-500" },
] as const;

const FRANCHISE_EVENT_TYPES = [
  { key: "open_date", label: "오픈예정일", color: "bg-sky-500" },
  { key: "install_date", label: "설치예정일", color: "bg-teal-500" },
] as const;

const LEGEND_ITEMS = [
  { category: "일정", color: "bg-indigo-500" },
  { category: "설치", color: "bg-emerald-500" },
  { category: "오픈", color: "bg-blue-500" },
  { category: "카드신청", color: "bg-orange-500" },
  { category: "오픈예정일", color: "bg-sky-500" },
  { category: "설치예정일", color: "bg-teal-500" },
  { category: "설치 관리", color: "bg-fuchsia-500" },
  { category: "우국상 오픈", color: "bg-cyan-500" },
  { category: "우국상 설치(월요일)", color: "bg-amber-500" },
  { category: "AS", color: "bg-red-500" },
  { category: "명변", color: "bg-teal-600" },
  { category: "전환", color: "bg-pink-500" },
  { category: "택배발송", color: "bg-rose-500" },
  { category: "메모", color: "bg-violet-500" },
] as const;

// 원색 칩은 10px 흰 글씨라 읽기 어렵다. 연한 배경에 진한 글씨, 왼쪽 막대만 분류색으로 둔다.
// 범례·패널의 분류색(ev.color)은 그대로 쓰고 이 표는 셀 칩에만 쓴다.
const CHIP_STYLE: Record<string, string> = {
  "bg-indigo-500": "bg-indigo-50 text-indigo-900 border-indigo-500",
  "bg-emerald-500": "bg-emerald-50 text-emerald-900 border-emerald-500",
  "bg-blue-500": "bg-blue-50 text-blue-900 border-blue-500",
  "bg-orange-500": "bg-orange-50 text-orange-900 border-orange-500",
  "bg-sky-500": "bg-sky-50 text-sky-900 border-sky-500",
  "bg-teal-500": "bg-teal-50 text-teal-900 border-teal-500",
  "bg-teal-600": "bg-teal-50 text-teal-900 border-teal-600",
  "bg-fuchsia-500": "bg-fuchsia-50 text-fuchsia-900 border-fuchsia-500",
  "bg-cyan-500": "bg-cyan-50 text-cyan-900 border-cyan-500",
  "bg-amber-500": "bg-amber-50 text-amber-900 border-amber-500",
  "bg-red-500": "bg-red-50 text-red-900 border-red-500",
  "bg-pink-500": "bg-pink-50 text-pink-900 border-pink-500",
  "bg-rose-500": "bg-rose-50 text-rose-900 border-rose-500",
  "bg-violet-500": "bg-violet-50 text-violet-900 border-violet-500",
};
const chipClass = (color: string) =>
  CHIP_STYLE[color] ?? "bg-slate-50 text-slate-800 border-slate-400";

const CATEGORY_PRIORITY: Record<string, number> = {
  AS: 0,
  설치: 1,
  "설치 관리": 1,
  설치예정일: 1,
  명변: 1,
  전환: 1,
  택배발송: 2,
  오픈: 3,
  오픈예정일: 3,
  "우국상 오픈": 3,
  "우국상 설치(월요일)": 3,
  카드신청: 4,
  일정: 5,
  메모: 6,
};

const INSTALL_CATEGORY_BY_DELIVERY_TYPE: Record<
  string,
  { label: string; color: string; statusColor: string }
> = {
  as: { label: "AS", color: "bg-red-500", statusColor: "bg-red-50 text-red-600" },
  name_change: { label: "명변", color: "bg-teal-600", statusColor: "bg-teal-50 text-teal-600" },
  transfer: { label: "전환", color: "bg-pink-500", statusColor: "bg-pink-50 text-pink-600" },
  delivery: { label: "택배발송", color: "bg-rose-500", statusColor: "bg-rose-50 text-rose-600" },
};

const MANUAL_CATEGORY_OPTIONS = [
  { value: "일정", color: "bg-indigo-500" },
  { value: "설치", color: "bg-emerald-500" },
  { value: "오픈", color: "bg-blue-500" },
  { value: "카드신청", color: "bg-orange-500" },
  { value: "택배발송", color: "bg-rose-500" },
  { value: "AS", color: "bg-red-500" },
  { value: "메모", color: "bg-violet-500" },
] as const;
const MANUAL_CATEGORY_COLOR: Record<string, string> = Object.fromEntries(
  MANUAL_CATEGORY_OPTIONS.map((o) => [o.value, o.color]),
);

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const INSTALL_STATUS_LABEL: Record<string, string> = {
  received: "접수",
  preparing: "제품준비",
  scheduled: "일정확정",
  in_transit: "이동중",
  delivery_sent: "택배발송",
  completed: "설치완료",
  rejected: "반려",
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toYMD(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.slice(0, 10);
}

function mondayOfWeek(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dow = date.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + diff);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function summarizeOverflow(
  events: CalendarEvent[],
): { category: string; color: string; count: number }[] {
  const result: { category: string; color: string; count: number }[] = [];
  const index: Record<string, number> = {};
  for (const ev of events) {
    if (index[ev.category] === undefined) {
      index[ev.category] = result.length;
      result.push({ category: ev.category, color: ev.color, count: 1 });
    } else {
      result[index[ev.category]].count += 1;
    }
  }
  return result;
}

type CalendarTab = "all" | "personal" | "assigned";

export default function CalendarClient({
  tickets,
  franchiseRows = [],
  wooRows = [],
  manualEvents = [],
  installRows = [],
  techProfiles = [],
  currentUserId,
  canViewAssigned = false,
  showLegend = true,
  compact = false,
}: {
  tickets: CalendarTicket[];
  franchiseRows?: CalendarFranchiseRow[];
  wooRows?: CalendarWooRow[];
  manualEvents?: CalendarManualEvent[];
  installRows?: CalendarInstallRow[];
  techProfiles?: { id: string; name: string }[];
  currentUserId: string;
  canViewAssigned?: boolean;
  showLegend?: boolean;
  compact?: boolean;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [localManualEvents, setLocalManualEvents] = useState(manualEvents);
  const [localInstallRows, setLocalInstallRows] = useState(installRows);
  useEffect(() => {
    setLocalInstallRows(installRows);
  }, [installRows]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMemo, setNewMemo] = useState("");
  const [newCategory, setNewCategory] = useState<string>(MANUAL_CATEGORY_OPTIONS[0].value);
  const [newAssignedTo, setNewAssignedTo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [techFilter, setTechFilter] = useState("");
  const [activeTab, setActiveTab] = useState<CalendarTab>("all");
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    if (compact) return;
    try {
      const raw = localStorage.getItem("calendar:filters");
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        categories?: string[];
        tech?: string;
        tab?: CalendarTab;
      };
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 SSR에서 읽을 수 없어 마운트 후 동기화가 불가피함
      if (parsed.categories) setSelectedCategories(new Set(parsed.categories));
      if (parsed.tech) setTechFilter(parsed.tech);
      if (parsed.tab)
        setActiveTab(parsed.tab === "assigned" && !canViewAssigned ? "all" : parsed.tab);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (compact) return;
    try {
      localStorage.setItem(
        "calendar:filters",
        JSON.stringify({
          categories: Array.from(selectedCategories),
          tech: techFilter,
          tab: activeTab,
        }),
      );
    } catch {
      // ignore
    }
  }, [compact, selectedCategories, techFilter, activeTab]);

  const toggleCategory = useCallback((category: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  function openEvent(e: React.MouseEvent, ev: CalendarEvent) {
    e.stopPropagation();
    if (ev.manualId || !ev.href) {
      setSelectedDate(ev.date);
      return;
    }
    if (ev.newTab) window.open(ev.href, "_blank", "noopener,noreferrer");
    else router.push(ev.href);
  }

  function resetAddForm() {
    setNewTitle("");
    setNewMemo("");
    setNewCategory(MANUAL_CATEGORY_OPTIONS[0].value);
    setNewAssignedTo("");
    setShowAddForm(false);
  }

  async function handleAddEvent() {
    if (!selectedDate || !newTitle.trim()) return;
    setSubmitting(true);

    if (newCategory === "설치" || newCategory === "택배발송") {
      const result = await createInstallation({
        customerName: newTitle.trim(),
        customerPhone: null,
        assignedTo: newAssignedTo || null,
        notes: newMemo.trim() || null,
        items: [],
        deliveryType: newCategory === "택배발송" ? "delivery" : "install",
        scheduledDate: selectedDate,
      });
      setSubmitting(false);
      if (result.error || !result.installation) {
        toast.error("설치건 등록 실패: " + result.error);
        return;
      }
      const assignee = newAssignedTo
        ? (techProfiles.find((t) => t.id === newAssignedTo) ?? null)
        : null;
      setLocalInstallRows((prev) => [
        ...prev,
        { ...result.installation, assignee } as CalendarInstallRow,
      ]);
      resetAddForm();
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("calendar_events")
      .insert({
        date: selectedDate,
        title: newTitle.trim(),
        memo: newMemo.trim() || null,
        category: newCategory,
        created_by: currentUserId,
      })
      .select(
        "id, date, title, memo, category, assigned_to, created_by, assignee:profiles!calendar_events_assigned_to_fkey(name)",
      )
      .single();
    setSubmitting(false);
    if (error) {
      toast.error("일정 등록 실패: " + error.message);
      return;
    }
    setLocalManualEvents((prev) => [...prev, data as unknown as CalendarManualEvent]);
    resetAddForm();
  }

  const handleDeleteEvent = useCallback(
    async (id: string) => {
      if (!confirm("이 일정을 삭제하시겠습니까?")) return;
      const supabase = createClient();
      const { error } = await supabase.from("calendar_events").delete().eq("id", id);
      if (error) {
        toast.error("일정 삭제 실패: " + error.message);
        return;
      }
      setLocalManualEvents((prev) => prev.filter((e) => e.id !== id));
    },
    [toast],
  );

  const eventMap = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ticket of tickets) {
      for (const et of EVENT_TYPES) {
        const date = toYMD(ticket[et.key as keyof CalendarTicket] as string);
        if (!date) continue;
        if (!map[date]) map[date] = [];
        map[date].push({
          date,
          label: et.label,
          category: et.label,
          color: et.color,
          href: `/tickets/${ticket.id}`,
          businessName: ticket.merchant?.business_name ?? ticket.title,
          subtitle: ticket.title,
          statusLabel: STATUS_LABEL[ticket.status as TicketStatus],
          statusColor: STATUS_COLOR[ticket.status as TicketStatus],
          type: ticket.type as TicketType,
          techName: ticket.tech?.name,
          salesName: ticket.sales?.name,
          ownerIds: [ticket.tech_id, ticket.sales_id].filter((id): id is string => !!id),
          newTab: true,
        });
      }
    }
    for (const row of franchiseRows) {
      for (const et of FRANCHISE_EVENT_TYPES) {
        const date = toYMD(row[et.key as keyof CalendarFranchiseRow] as string);
        if (!date) continue;
        if (!map[date]) map[date] = [];
        map[date].push({
          date,
          label: et.label,
          category: et.label,
          color: et.color,
          href: `/franchise?highlight=${row.id}`,
          businessName: row.business_name || "상호명 미입력",
          subtitle: "가맹 접수",
          salesName: row.sales?.name,
          ownerIds: row.sales_id ? [row.sales_id] : [],
          newTab: true,
        });
      }
    }
    for (const row of localInstallRows) {
      const date = toYMD(row.scheduled_date);
      if (!date) continue;
      if (!map[date]) map[date] = [];
      const special = row.delivery_type
        ? INSTALL_CATEGORY_BY_DELIVERY_TYPE[row.delivery_type]
        : undefined;
      const label = special?.label ?? "설치";
      const color = special?.color ?? "bg-fuchsia-500";
      map[date].push({
        date,
        label,
        category: special ? label : "설치 관리",
        color,
        href: `/installs?id=${row.id}`,
        businessName: row.customer_name || "고객명 미입력",
        subtitle: special ? label : "설치 관리",
        statusLabel: INSTALL_STATUS_LABEL[row.status] ?? row.status,
        statusColor: special?.statusColor ?? "bg-fuchsia-50 text-fuchsia-600",
        techName: row.assignee?.name,
        newTab: true,
        ownerIds: row.assigned_to ? [row.assigned_to] : [],
      });
    }
    for (const row of wooRows) {
      const openDate = row.open_date && ISO_DATE_RE.test(row.open_date) ? row.open_date : null;
      if (!openDate) continue;
      const businessName = row.business_name || "상호명 미입력";
      if (!map[openDate]) map[openDate] = [];
      map[openDate].push({
        date: openDate,
        label: "오픈",
        category: "우국상 오픈",
        color: "bg-cyan-500",
        href: `/woo?highlight=${row.id}`,
        businessName,
        subtitle: "우국상 오픈",
        salesName: row.manager ?? undefined,
        ownerIds: [],
        newTab: true,
      });
      const installDate = mondayOfWeek(openDate);
      if (!map[installDate]) map[installDate] = [];
      map[installDate].push({
        date: installDate,
        label: "설치",
        category: "우국상 설치(월요일)",
        color: "bg-amber-500",
        href: `/woo?highlight=${row.id}`,
        businessName,
        subtitle: "우국상 설치 (오픈 주 월요일)",
        salesName: row.manager ?? undefined,
        glow: true,
        ownerIds: [],
        newTab: true,
      });
    }
    for (const ev of localManualEvents) {
      const date = toYMD(ev.date);
      if (!date) continue;
      if (!map[date]) map[date] = [];
      const category = ev.category || "메모";
      map[date].push({
        date,
        label: category,
        category,
        color: MANUAL_CATEGORY_COLOR[category] ?? "bg-violet-500",
        href: "",
        businessName: ev.title,
        subtitle: ev.memo || "",
        manualId: ev.id,
        techName: ev.assignee?.name,
        ownerIds: [ev.created_by, ev.assigned_to].filter((id): id is string => !!id),
      });
    }
    for (const list of Object.values(map))
      list.sort(
        (a, b) => (CATEGORY_PRIORITY[a.category] ?? 9) - (CATEGORY_PRIORITY[b.category] ?? 9),
      );
    return map;
  }, [tickets, franchiseRows, wooRows, localInstallRows, localManualEvents]);

  const tabFilteredEventMap = useMemo(() => {
    if (activeTab === "all") return eventMap;
    const map: Record<string, CalendarEvent[]> = {};
    for (const [date, events] of Object.entries(eventMap)) {
      const filtered =
        activeTab === "personal"
          ? events.filter((ev) => ev.ownerIds.includes(currentUserId))
          : events.filter(
              (ev) =>
                (ev.category === "설치 관리" ||
                  ev.category === "설치" ||
                  ev.category === "택배발송" ||
                  ev.category === "AS" ||
                  ev.category === "명변" ||
                  ev.category === "전환") &&
                ev.ownerIds.length > 0,
            );
      if (filtered.length) map[date] = filtered;
    }
    return map;
  }, [eventMap, activeTab, currentUserId]);

  const visibleLegendItems = useMemo(() => {
    const present = new Set<string>();
    for (const events of Object.values(eventMap)) {
      for (const ev of events) present.add(ev.category);
    }
    return LEGEND_ITEMS.filter((li) => present.has(li.category));
  }, [eventMap]);

  const visibleEventMap = useMemo(() => {
    if (selectedCategories.size === 0 && !techFilter) return tabFilteredEventMap;
    const map: Record<string, CalendarEvent[]> = {};
    for (const [date, events] of Object.entries(tabFilteredEventMap)) {
      const filtered = events.filter(
        (ev) =>
          (selectedCategories.size === 0 || selectedCategories.has(ev.category)) &&
          (!techFilter || ev.ownerIds.includes(techFilter)),
      );
      if (filtered.length) map[date] = filtered;
    }
    return map;
  }, [tabFilteredEventMap, selectedCategories, techFilter]);

  function prevMonth() {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else setMonth((m) => m - 1);
    setSelectedDate(null);
  }
  function nextMonth() {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else setMonth((m) => m + 1);
    setSelectedDate(null);
  }
  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDate(null);
  }

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  while (cells.length % 7 !== 0) cells.push(null);

  function dateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const selectedEvents = selectedDate ? (visibleEventMap[selectedDate] ?? []) : [];

  const monthTotal = Object.entries(visibleEventMap)
    .filter(([d]) => d.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`))
    .reduce((s, [, evs]) => s + evs.length, 0);

  const numRows = cells.length / 7;
  const maxEventsPerCell = compact ? 2 : 3;

  const upcomingDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  function renderEvent(ev: CalendarEvent, key: string) {
    const content = (
      <>
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`text-white text-[10px] font-bold px-1.5 py-0.5 rounded ${ev.color} ${
              ev.glow ? "ring-2 ring-amber-300" : ""
            }`}
          >
            {ev.label}
          </span>
          {ev.statusLabel && ev.statusColor && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ev.statusColor}`}>
              {ev.statusLabel}
            </span>
          )}
        </div>
        <p className="text-sm font-semibold text-slate-900 break-words">{ev.businessName}</p>
        {ev.subtitle && <p className="text-xs text-slate-500 break-words mt-0.5">{ev.subtitle}</p>}
        <div className="flex gap-2 mt-1 text-xs text-slate-400">
          {ev.type && <span>{TYPE_LABEL[ev.type]}</span>}
          {ev.techName && <span>· {ev.techName}</span>}
          {ev.salesName && <span>· {ev.salesName}</span>}
        </div>
      </>
    );
    if (ev.manualId) {
      return (
        <div
          key={key}
          className="flex items-start px-4 py-3 hover:bg-slate-50 transition-colors group"
        >
          <div className="flex-1 min-w-0">{content}</div>
          <button
            onClick={() => handleDeleteEvent(ev.manualId!)}
            className="text-slate-300 hover:text-red-500 transition-colors ml-2 opacity-0 group-hover:opacity-100"
          >
            <Trash2 size={14} />
          </button>
        </div>
      );
    }
    return (
      <Link
        key={key}
        href={ev.href}
        {...(ev.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="block px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={`flex h-full ${compact ? "gap-2" : "gap-4"}`}>
      {}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {}
        <div
          className={`flex items-center gap-2 ${compact ? "mb-1.5 flex-shrink-0" : "gap-3 mb-4"}`}
        >
          <button
            onClick={prevMonth}
            className={`rounded-lg hover:bg-slate-100 transition-colors ${compact ? "p-1" : "p-1.5"}`}
          >
            <ChevronLeft size={compact ? 15 : 18} className="text-slate-500" />
          </button>
          <h2
            className={`font-bold text-slate-900 text-center ${compact ? "text-sm min-w-[90px]" : "text-lg min-w-[120px]"}`}
          >
            {year}년 {month + 1}월
          </h2>
          <button
            onClick={nextMonth}
            className={`rounded-lg hover:bg-slate-100 transition-colors ${compact ? "p-1" : "p-1.5"}`}
          >
            <ChevronRight size={compact ? 15 : 18} className="text-slate-500" />
          </button>
          <button
            onClick={goToday}
            className={`ml-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors font-medium ${compact ? "text-[10px] px-2 py-1" : "ml-2 text-xs px-3 py-1.5"}`}
          >
            오늘
          </button>
          <span className={`ml-auto text-slate-400 ${compact ? "text-[11px]" : "text-sm"}`}>
            이번달 일정 {monthTotal}건
          </span>
        </div>

        {}
        <div
          className={`flex items-center gap-1 border-b border-slate-200 flex-shrink-0 ${compact ? "mb-1.5" : "mb-3"}`}
        >
          {(
            [
              ["all", "전체"],
              ["personal", "개인"],
              ...(canViewAssigned ? [["assigned", "배정일정"] as const] : []),
            ] as [CalendarTab, string][]
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setActiveTab(tab);
                setSelectedCategories(new Set());
                setSelectedDate(null);
              }}
              className={`font-medium border-b-2 -mb-px transition-colors ${compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"} ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
          {!compact && (
            <div className="ml-auto mb-1 w-40">
              <AppSelect
                value={techFilter}
                onValueChange={setTechFilter}
                aria-label="담당 기사"
                options={[
                  { value: "", label: "전체 기사" },
                  ...techProfiles.map((tech) => ({ value: tech.id, label: tech.name })),
                ]}
              />
            </div>
          )}
        </div>

        {}
        {showLegend && (
          <div className="flex flex-wrap items-center gap-3 mb-3 flex-shrink-0">
            {visibleLegendItems.map((li) => (
              <button
                key={li.category}
                type="button"
                onClick={() => toggleCategory(li.category)}
                className={`flex items-center gap-1.5 text-[13px] px-1.5 py-1 rounded-md cursor-pointer transition-all hover:bg-slate-100 ${
                  selectedCategories.has(li.category)
                    ? "bg-slate-100 text-slate-800 font-semibold"
                    : selectedCategories.size > 0
                      ? "text-slate-400 opacity-40 hover:opacity-70"
                      : "text-slate-500"
                }`}
              >
                <span className={`w-3 h-3 rounded-sm ${li.color}`} />
                {li.category}
              </button>
            ))}
            {selectedCategories.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedCategories(new Set())}
                className="text-[12px] text-blue-600 hover:underline"
              >
                전체 보기
              </button>
            )}
          </div>
        )}

        {}
        <div className={`grid grid-cols-7 flex-shrink-0 ${compact ? "mb-0.5" : "mb-1"}`}>
          {DAYS.map((d, i) => (
            <div
              key={d}
              className={`text-center font-semibold ${compact ? "text-[10px] py-1" : "text-xs py-2"} ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-slate-500"}`}
            >
              {d}
            </div>
          ))}
        </div>

        {}
        <div
          className="grid grid-cols-7 flex-1 min-h-0 border-t border-l border-slate-200 rounded-xl overflow-hidden"
          style={compact ? { gridTemplateRows: `repeat(${numRows}, minmax(0, 1fr))` } : undefined}
        >
          {cells.map((day, idx) => {
            if (!day)
              return (
                <div
                  key={`empty-${idx}`}
                  className={`border-b border-r border-slate-200 bg-slate-50/50 ${compact ? "" : "min-h-[90px]"}`}
                />
              );
            const ds = dateStr(day);
            const events = visibleEventMap[ds] ?? [];
            const isToday = ds === todayStr;
            const isSelected = ds === selectedDate;
            const dow = (firstDay + day - 1) % 7;
            return (
              <div
                key={ds}
                onClick={() => setSelectedDate(isSelected ? null : ds)}
                className={`border-b border-r border-slate-200 cursor-pointer transition-colors overflow-hidden ${compact ? "p-1" : "min-h-[90px] p-1.5"} ${
                  isSelected ? "bg-blue-50" : "hover:bg-slate-50"
                }`}
              >
                <div
                  className={`flex items-center justify-center rounded-full font-semibold ${compact ? "w-5 h-5 text-[10px] mb-0.5" : "w-7 h-7 text-sm mb-1"} ${
                    isToday
                      ? "bg-blue-600 text-white"
                      : dow === 0
                        ? "text-red-500"
                        : dow === 6
                          ? "text-blue-500"
                          : "text-slate-700"
                  }`}
                >
                  {day}
                </div>
                <div className="flex flex-col gap-0.5">
                  {events.slice(0, maxEventsPerCell).map((ev, i) => (
                    <div
                      key={i}
                      title={`${ev.label} ${ev.businessName}`}
                      onClick={(e) => openEvent(e, ev)}
                      className={`flex items-center gap-1 truncate rounded-sm border-l-2 ${chipClass(ev.color)} ${
                        compact ? "px-1 py-px text-[9px]" : "px-1.5 py-0.5 text-[10.5px]"
                      } ${ev.glow ? "ring-1 ring-amber-400" : ""} ${ev.href || ev.manualId ? "cursor-pointer hover:brightness-95" : ""}`}
                    >
                      <span className="shrink-0 font-medium opacity-70">{ev.label}</span>
                      <span className="truncate font-semibold">{ev.businessName}</span>
                    </div>
                  ))}
                  {events.length > maxEventsPerCell &&
                    (compact ? (
                      <div className="px-1 text-[9px] text-slate-400">
                        +{events.length - maxEventsPerCell}건
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-1 text-[10px] text-slate-500">
                        {summarizeOverflow(events.slice(maxEventsPerCell)).map((s) => (
                          <span
                            key={s.category}
                            className="flex items-center gap-0.5"
                            title={s.category}
                          >
                            <span className={`inline-block h-2 w-2 rounded-sm ${s.color}`} />
                            {s.count}
                          </span>
                        ))}
                      </div>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {}
      {!compact && (
        <div className="w-72 flex-shrink-0">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm h-fit">
            {selectedDate ? (
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <p className="font-semibold text-slate-900 text-sm">
                  {selectedDate.slice(5).replace("-", "/")} 일정
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAddForm((v) => !v)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors font-medium"
                  >
                    <Plus size={12} /> 일정 추가
                  </button>
                  <button
                    onClick={() => setSelectedDate(null)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="font-semibold text-slate-900 text-sm">오늘부터 7일</p>
              </div>
            )}

            {selectedDate && showAddForm && (
              <div className="px-4 py-3 border-b border-slate-100 flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {MANUAL_CATEGORY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setNewCategory(opt.value)}
                      className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border transition-colors ${
                        newCategory === opt.value
                          ? "border-slate-300 bg-slate-100 text-slate-800"
                          : "border-transparent text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-sm ${opt.color}`} />
                      {opt.value}
                    </button>
                  ))}
                </div>
                <input
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddEvent();
                  }}
                  placeholder="일정 제목"
                  className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-400"
                />
                <input
                  value={newMemo}
                  onChange={(e) => setNewMemo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddEvent();
                  }}
                  placeholder="메모 (선택)"
                  className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-400"
                />
                {(newCategory === "설치" || newCategory === "택배발송") && (
                  <AppSelect
                    value={newAssignedTo}
                    onValueChange={setNewAssignedTo}
                    aria-label="담당자"
                    options={[
                      { value: "", label: "담당자 미배정" },
                      ...techProfiles.map((tech) => ({ value: tech.id, label: tech.name })),
                    ]}
                  />
                )}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={resetAddForm}
                    className="text-xs px-2.5 py-1.5 rounded-lg text-slate-500 hover:bg-slate-50"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleAddEvent}
                    disabled={submitting || !newTitle.trim()}
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    등록
                  </button>
                </div>
              </div>
            )}

            {selectedDate ? (
              selectedEvents.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">일정 없음</p>
              ) : (
                <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto">
                  {selectedEvents.map((ev, i) => renderEvent(ev, String(i)))}
                </div>
              )
            ) : upcomingDates.every((d) => !visibleEventMap[d]?.length) ? (
              <p className="text-slate-400 text-sm text-center py-8">이번 주 일정 없음</p>
            ) : (
              <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto">
                {upcomingDates.map((date) => {
                  const events = visibleEventMap[date] ?? [];
                  if (events.length === 0) return null;
                  const [y, m, d] = date.split("-").map(Number);
                  const dow = new Date(y, m - 1, d).getDay();
                  return (
                    <div key={date}>
                      <button
                        type="button"
                        onClick={() => setSelectedDate(date)}
                        className={`w-full text-left px-4 py-2 text-xs font-semibold bg-slate-50 hover:bg-slate-100 ${
                          date === todayStr ? "text-blue-600" : "text-slate-500"
                        }`}
                      >
                        {m}/{d} ({DAYS[dow]}){date === todayStr ? " 오늘" : ""}
                      </button>
                      {events.map((ev, i) => renderEvent(ev, `${date}-${i}`))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
