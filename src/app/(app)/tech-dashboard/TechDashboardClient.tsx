"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  CalendarDays,
  CheckCircle2,
  Wrench,
  ArrowLeftRight,
  Clock4,
  X,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";
import CalendarClient from "../calendar/CalendarClient";
import { createClient } from "@/lib/supabase/client";
import { fetchTechStats, monthRange, type TechStats } from "./stats";
import { AppSelect } from "@/components/ui/AppSelect";
import { DatePickerField } from "@/components/ui/DatePickerField";

type InstallRow = {
  id: string;
  customer_name: string | null;
  contact_name: string | null;
  customer_phone: string | null;
  address: string | null;
  status: string;
  delivery_type: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  assigned_to: string | null;
  notes: string | null;
  franchise_application_id: string | null;
  created_at?: string;
  assignee: { name: string } | null;
};

type CalendarInstallRow = {
  id: string;
  customer_name?: string | null;
  status: string;
  scheduled_date?: string | null;
  assigned_to?: string | null;
  delivery_type?: string | null;
  assignee?: { name: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  received: "접수",
  preparing: "제품준비",
  scheduled: "일정확정",
  in_transit: "이동중",
  delivery_sent: "택배발송",
  completed: "완료",
  rejected: "반려",
};

function statusLabel(status: string, deliveryType: string | null) {
  if (status === "completed" && deliveryType === "as") return "AS완료";
  return STATUS_LABEL[status] ?? status;
}

function statusChipColor(status: string) {
  if (status === "completed") return "bg-emerald-50 text-emerald-600 border-emerald-200";
  if (status === "rejected") return "bg-red-50 text-red-600 border-red-200";
  if (status === "in_transit") return "bg-blue-50 text-blue-600 border-blue-200";
  return "bg-amber-50 text-amber-600 border-amber-200";
}

function Gauge({
  label,
  percent,
  sub,
  color,
}: {
  label: string;
  percent: number;
  sub: string;
  color: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const circumference = 130;
  return (
    <div className="flex-1 flex flex-col items-center gap-1.5">
      <svg width="112" height="70" viewBox="0 0 120 70">
        <path
          d="M10 65 A50 50 0 0 1 110 65"
          fill="none"
          stroke="currentColor"
          className="text-slate-100"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M10 65 A50 50 0 0 1 110 65"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
        />
        <text x="60" y="52" textAnchor="middle" fontSize="20" fontWeight="700" fill="#1e293b">
          {clamped}%
        </text>
      </svg>
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      <div className="text-[11px] text-slate-400">{sub}</div>
    </div>
  );
}

function todayYMD() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

function RecentTable({
  title,
  rows,
  onSelect,
}: {
  title: string;
  rows: InstallRow[];
  onSelect: (r: InstallRow) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-y-auto h-full">
      <div className="px-4 py-2 border-b border-slate-100 sticky top-0 bg-white flex items-baseline gap-2">
        <p className="text-xs font-bold text-slate-900">{title}</p>
        <p className="text-[10px] text-slate-400">최신 5건</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-xs text-slate-400 text-center">접수된 건이 없습니다</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] text-slate-400 border-b border-slate-100">
              <th className="px-4 py-1.5 font-medium">상호명</th>
              <th className="px-2 py-1.5 font-medium">담당 기사</th>
              <th className="px-2 py-1.5 font-medium">예정일</th>
              <th className="px-4 py-1.5 font-medium text-right">상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => onSelect(r)}
                className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer"
              >
                <td className="px-4 py-1.5 font-medium text-slate-900 truncate max-w-36">
                  {r.customer_name || "상호명 미입력"}
                </td>
                <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">
                  {r.assignee?.name ?? "미배정"}
                </td>
                <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">
                  {r.scheduled_date ?? "-"}
                </td>
                <td className="px-4 py-1.5 text-right">
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap ${statusChipColor(r.status)}`}
                  >
                    {statusLabel(r.status, r.delivery_type)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function TechDashboardClient({
  profileName,
  currentUserId,
  initialDateFrom,
  initialDateTo,
  initialStats,
  calendarInstallRows,
  techProfiles,
  searchRows,
}: {
  profileName: string;
  currentUserId: string;
  initialDateFrom: string;
  initialDateTo: string;
  initialStats: TechStats;
  calendarInstallRows: CalendarInstallRow[];
  techProfiles: { id: string; name: string }[];
  searchRows: InstallRow[];
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<InstallRow | null>(null);
  const [techFilter, setTechFilter] = useState("");

  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [appliedFrom, setAppliedFrom] = useState(initialDateFrom);
  const [appliedTo, setAppliedTo] = useState(initialDateTo);
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(false);

  async function applyRange(from: string, to: string) {
    if (!from || !to || from > to) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const next = await fetchTechStats(supabase, from, to);
      setStats(next);
      setDateFrom(from);
      setDateTo(to);
      setAppliedFrom(from);
      setAppliedTo(to);
    } finally {
      setLoading(false);
    }
  }

  function setThisMonth() {
    const today = new Date();
    const { start, end } = monthRange(today.getFullYear(), today.getMonth() + 1);
    applyRange(start, end);
  }

  function setLastMonth() {
    const today = new Date();
    const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const { start, end } = monthRange(d.getFullYear(), d.getMonth() + 1);
    applyRange(start, end);
  }

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return searchRows
      .filter((r) =>
        [r.customer_name, r.contact_name, r.customer_phone, r.address]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [search, searchRows]);

  const maxWeekly = Math.max(...stats.weeklyBars.map((w) => w.install + w.as), 1);
  const periodLabel = `${appliedFrom} ~ ${appliedTo}`;

  const filteredCalendarRows = useMemo(
    () =>
      techFilter
        ? calendarInstallRows.filter((r) => r.assigned_to === techFilter)
        : calendarInstallRows,
    [calendarInstallRows, techFilter],
  );

  const recentInstalls = useMemo(
    () => searchRows.filter((r) => r.delivery_type !== "as").slice(0, 5),
    [searchRows],
  );
  const recentAs = useMemo(
    () => searchRows.filter((r) => r.delivery_type === "as").slice(0, 5),
    [searchRows],
  );

  const summaryCards = [
    {
      label: "전체 일정",
      value: stats.cards.totalSchedule,
      sub: `설치 ${stats.cards.totalInstall}건 · AS ${stats.cards.totalAs}건`,
      icon: CalendarDays,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "설치 예정",
      value: stats.cards.pendingInstall,
      sub: periodLabel,
      icon: Clock4,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "설치 완료",
      value: stats.cards.completedInstall,
      sub: "기간 누적",
      icon: CheckCircle2,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "AS 접수",
      value: stats.cards.totalAs,
      sub: "기간 누적",
      icon: Wrench,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "AS 완료",
      value: stats.cards.completedAs,
      sub: `처리율 ${stats.asRate}%`,
      icon: CheckCircle2,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "이관 대기",
      value: stats.cards.pendingTransfer,
      sub: "CS → 설치관리 승인 대기",
      icon: ArrowLeftRight,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  return (
    <div className="h-screen flex flex-col p-3 gap-2.5 max-w-[1600px] mx-auto overflow-hidden">
      <div className="flex items-center justify-between flex-wrap gap-2 flex-shrink-0">
        <div>
          <h1 className="text-base font-bold text-slate-900">기술지원 대시보드</h1>
          <p className="text-xs text-slate-500">
            {profileName}님 · {periodLabel} 설치·A/S 현황
          </p>
        </div>

        {}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={setThisMonth}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
          >
            이번달
          </button>
          <button
            onClick={setLastMonth}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
          >
            지난달
          </button>
          <DatePickerField
            value={dateFrom}
            onChange={setDateFrom}
            maxDate={todayYMD()}
            ariaLabel="시작일"
            className="h-auto px-2 py-1.5 text-xs"
          />
          <span className="text-slate-400 text-xs">~</span>
          <DatePickerField
            value={dateTo}
            onChange={setDateTo}
            ariaLabel="종료일"
            className="h-auto px-2 py-1.5 text-xs"
          />
          <button
            onClick={() => applyRange(dateFrom, dateTo)}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            조회
          </button>
        </div>
      </div>

      {}
      <div className="relative bg-white rounded-xl border border-slate-200 shadow-sm p-2.5 flex items-center gap-2 flex-wrap flex-shrink-0">
        <div className="relative flex-1 min-w-56 max-w-md">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="상호명, 고객명, 전화번호, 주소 검색"
            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <AppSelect
          value={techFilter}
          onValueChange={setTechFilter}
          aria-label="담당 기사 필터"
          className="h-auto px-2.5 py-1.5 text-xs"
          options={[
            { value: "", label: "담당 기사 전체" },
            ...techProfiles.map((t) => ({ value: t.id, label: t.name })),
          ]}
        />
        {results.length > 0 && (
          <div className="absolute left-3 top-[calc(100%-2px)] w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-20">
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setSelected(r);
                  setSearch("");
                }}
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {r.customer_name || "상호명 미입력"}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {[r.address, r.customer_phone].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${statusChipColor(r.status)}`}
                >
                  {statusLabel(r.status, r.delivery_type)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 flex-shrink-0">
        {summaryCards.map((c) => (
          <div
            key={c.label}
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-2.5"
          >
            <div
              className={`w-7 h-7 rounded-lg ${c.bg} ${c.color} flex items-center justify-center mb-1.5`}
            >
              <c.icon size={14} />
            </div>
            <p className="text-xl font-bold text-slate-900 leading-tight">{c.value}</p>
            <p className="text-[11px] text-slate-500">{c.label}</p>
            <p className="text-[10px] text-slate-400">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-2.5 flex-1 min-h-0">
        {}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col min-h-0">
          <div className="px-3 py-1.5 border-b border-slate-100 flex-shrink-0">
            <p className="text-xs font-bold text-slate-900">설치 / AS 일정 캘린더</p>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden p-2">
            <CalendarClient
              tickets={[]}
              installRows={filteredCalendarRows}
              techProfiles={techProfiles}
              currentUserId={currentUserId}
              showLegend={false}
              compact
            />
          </div>
        </div>

        {}
        <div className="flex flex-col gap-2.5 h-full min-h-0">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex-shrink-0">
            <p className="text-xs font-bold text-slate-900 mb-1.5">설치 / AS 처리 현황</p>
            <div className="flex gap-2">
              <Gauge
                label="설치율"
                percent={stats.installRate}
                sub={`완료 ${stats.cards.completedInstall} / ${stats.cards.totalInstall}건`}
                color="#3652CC"
              />
              <Gauge
                label="AS 처리율"
                percent={stats.asRate}
                sub={`완료 ${stats.cards.completedAs} / ${stats.cards.totalAs}건`}
                color="#C77817"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <p className="text-xs font-bold text-slate-900">기간별 처리 현황</p>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-blue-600 inline-block" />
                  설치
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-amber-500 inline-block" />
                  A/S
                </span>
              </div>
            </div>
            <div className="flex items-end gap-2 flex-1 min-h-0 overflow-x-auto">
              {stats.weeklyBars.map((w) => (
                <div
                  key={w.label}
                  className="flex-1 flex flex-col items-center gap-1 h-full justify-end min-w-7"
                >
                  <div
                    className="w-full max-w-8 rounded-t-sm overflow-hidden flex flex-col-reverse"
                    style={{
                      height: `${((w.install + w.as) / maxWeekly) * 100}%`,
                      minHeight: w.install + w.as > 0 ? "4px" : "0",
                    }}
                  >
                    <div
                      className="bg-blue-600 w-full"
                      style={{
                        height: `${w.install + w.as > 0 ? (w.install / (w.install + w.as)) * 100 : 0}%`,
                      }}
                    />
                    <div
                      className="bg-amber-500 w-full"
                      style={{
                        height: `${w.install + w.as > 0 ? (w.as / (w.install + w.as)) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400">{w.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-2 gap-2.5 flex-shrink-0"
        style={{ height: "160px" }}
      >
        <RecentTable title="설치 접수 목록" rows={recentInstalls} onSelect={setSelected} />
        <RecentTable title="AS 접수 목록" rows={recentAs} onSelect={setSelected} />
      </div>

      {}
      {selected && (
        <div
          className="fixed inset-0 bg-black/40 z-40 flex justify-end"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-sm bg-white h-full shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
              <div>
                <p className="text-base font-bold text-slate-900">
                  {selected.customer_name || "상호명 미입력"}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{selected.address || "주소 미입력"}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 flex-shrink-0"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <span
                className={`inline-flex items-center text-xs font-bold px-3 py-1 rounded-full border ${statusChipColor(selected.status)}`}
              >
                {statusLabel(selected.status, selected.delivery_type)}
              </span>

              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">
                  작업 정보
                </p>
                <div className="grid grid-cols-[76px_1fr] gap-y-2.5 gap-x-2 text-sm">
                  <span className="text-slate-400">유형</span>
                  <span className="text-slate-900 font-medium">
                    {selected.delivery_type === "as" ? "A/S" : "설치"}
                  </span>
                  <span className="text-slate-400">담당 기사</span>
                  <span className="text-slate-900 font-medium">
                    {selected.assignee?.name ?? "미배정"}
                  </span>
                  <span className="text-slate-400">예정일</span>
                  <span className="text-slate-900 font-medium">
                    {selected.scheduled_date ?? "-"} {selected.scheduled_time ?? ""}
                  </span>
                  <span className="text-slate-400">연락처</span>
                  <span className="text-slate-900 font-medium">
                    {selected.customer_phone ?? "-"}
                  </span>
                  <span className="text-slate-400">비고</span>
                  <span className="text-slate-900 font-medium">{selected.notes || "-"}</span>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-100">
              <Link
                href={`/installs?id=${selected.id}`}
                className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                설치관리에서 열기
                <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
