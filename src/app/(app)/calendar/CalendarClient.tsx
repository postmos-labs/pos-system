"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
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
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CalendarTab>("all");
  const toast = useToast();

  const toggleCategory = useCallback((category: string) => {
    setSelectedCategory((prev) => (prev === category ? null : category));
  }, []);

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
    if (!selectedCategory) return tabFilteredEventMap;
    const map: Record<string, CalendarEvent[]> = {};
    for (const [date, events] of Object.entries(tabFilteredEventMap)) {
      const filtered = events.filter((ev) => ev.category === selectedCategory);
      if (filtered.length) map[date] = filtered;
    }
    return map;
  }, [tabFilteredEventMap, selectedCategory]);

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

  return (
    <div className="flex gap-4 h-full">
      {}
      <div className="flex-1 flex flex-col min-w-0">
        {}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ChevronLeft size={18} className="text-slate-500" />
          </button>
          <h2 className="text-lg font-bold text-slate-900 min-w-[120px] text-center">
            {year}년 {month + 1}월
          </h2>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ChevronRight size={18} className="text-slate-500" />
          </button>
          <button
            onClick={goToday}
            className="ml-2 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors font-medium"
          >
            오늘
          </button>
          <span className="ml-auto text-sm text-slate-400">이번달 일정 {monthTotal}건</span>
        </div>

        {}
        <div className="flex gap-1 mb-3 border-b border-slate-200">
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
                setSelectedCategory(null);
                setSelectedDate(null);
              }}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {}
        {showLegend && (
          <div className="flex flex-wrap gap-3 mb-3">
            {visibleLegendItems.map((li) => (
              <button
                key={li.category}
                type="button"
                onClick={() => toggleCategory(li.category)}
                className={`flex items-center gap-1.5 text-[13px] px-1.5 py-1 rounded-md cursor-pointer transition-all hover:bg-slate-100 ${
                  selectedCategory === li.category
                    ? "bg-slate-100 text-slate-800 font-semibold"
                    : selectedCategory
                      ? "text-slate-400 opacity-40 hover:opacity-70"
                      : "text-slate-500"
                }`}
              >
                <span className={`w-3 h-3 rounded-sm ${li.color}`} />
                {li.category}
              </button>
            ))}
          </div>
        )}

        {}
        <div className="grid grid-cols-7 mb-1">
          {DAYS.map((d, i) => (
            <div
              key={d}
              className={`text-center text-xs font-semibold py-2 ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-slate-500"}`}
            >
              {d}
            </div>
          ))}
        </div>

        {}
        <div className="grid grid-cols-7 flex-1 border-t border-l border-slate-200 rounded-xl overflow-hidden">
          {cells.map((day, idx) => {
            if (!day)
              return (
                <div
                  key={`empty-${idx}`}
                  className="border-b border-r border-slate-200 bg-slate-50/50 min-h-[90px]"
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
                className={`border-b border-r border-slate-200 min-h-[90px] p-1.5 cursor-pointer transition-colors ${
                  isSelected ? "bg-blue-50" : "hover:bg-slate-50"
                }`}
              >
                <div
                  className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold mb-1 ${
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
                  {events.slice(0, 3).map((ev, i) => (
                    <div
                      key={i}
                      title={`${ev.label} ${ev.businessName}`}
                      className={`text-white text-[10px] font-bold px-1.5 py-0.5 rounded truncate ${ev.color} ${
                        ev.glow
                          ? "ring-2 ring-amber-300 shadow-[0_0_8px_2px_rgba(245,158,11,0.75)] animate-pulse"
                          : ""
                      }`}
                    >
                      {ev.label} {ev.businessName}
                    </div>
                  ))}
                  {events.length > 3 && (
                    <div className="text-[10px] text-slate-400 px-1">+{events.length - 3}건</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {}
      <div
        className={`w-72 flex-shrink-0 transition-all ${selectedDate ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        {selectedDate && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm h-fit">
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

            {showAddForm && (
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
                  <select
                    value={newAssignedTo}
                    onChange={(e) => setNewAssignedTo(e.target.value)}
                    className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-400"
                  >
                    <option value="">담당자 미배정</option>
                    {techProfiles.map((tech) => (
                      <option key={tech.id} value={tech.id}>
                        {tech.name}
                      </option>
                    ))}
                  </select>
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

            {selectedEvents.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">일정 없음</p>
            ) : (
              <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto">
                {selectedEvents.map((ev, i) => {
                  const content = (
                    <>
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-white text-[10px] font-bold px-1.5 py-0.5 rounded ${ev.color} ${
                            ev.glow
                              ? "ring-2 ring-amber-300 shadow-[0_0_8px_2px_rgba(245,158,11,0.75)] animate-pulse"
                              : ""
                          }`}
                        >
                          {ev.label}
                        </span>
                        {ev.statusLabel && ev.statusColor && (
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${ev.statusColor}`}
                          >
                            {ev.statusLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-slate-900 break-words">
                        {ev.businessName}
                      </p>
                      {ev.subtitle && (
                        <p className="text-xs text-slate-500 break-words mt-0.5">{ev.subtitle}</p>
                      )}
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
                        key={i}
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
                      key={i}
                      href={ev.href}
                      {...(ev.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="block px-4 py-3 hover:bg-slate-50 transition-colors"
                    >
                      {content}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
