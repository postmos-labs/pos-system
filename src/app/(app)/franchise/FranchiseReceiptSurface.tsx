"use client";

import { useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleHelpIcon,
  ClockIcon,
  FileTextIcon,
  FileWarningIcon,
  ListFilterIcon,
  PercentIcon,
  PlusIcon,
  SearchIcon,
  StickyNoteIcon,
} from "lucide-react";
import type {
  ApplicantType,
  FranchiseApplication,
  FranchiseCaseType,
  FranchiseChannel,
  FranchiseStatus,
  Profile,
} from "@/types";
import {
  APPLICANT_TYPE_LABEL,
  FRANCHISE_CASE_TYPE_LABEL,
  FRANCHISE_CHANNEL_LABEL,
  FRANCHISE_STATUS_LABEL,
} from "@/types";
import RateBadge from "@/components/ui/RateBadge";

type TableView =
  | "all"
  | "mine"
  | "doc_incomplete"
  | "doc_waiting"
  | "approved"
  | "persistent_absence";
type KpiKey = "today_received" | "doc_waiting" | "doc_incomplete" | "reviewing" | "today_completed";
type SortBy = "updated_at" | "created_at" | "open_date" | "install_date" | "status" | "manual";

export type ColumnSortKey =
  | "reception_date"
  | "open_date"
  | "channel"
  | "case_type"
  | "business_name"
  | "owner_name"
  | "phone"
  | "cs"
  | "internet"
  | "status"
  | "next_check_date"
  | "next_check_color";

export type ColumnSortState = { key: ColumnSortKey; dir: "desc" | "asc" } | null;

const SORTABLE_HEADERS: { label: string; key: ColumnSortKey }[] = [
  { label: "접수일", key: "reception_date" },
  { label: "오픈 예정일", key: "open_date" },
  { label: "채널", key: "channel" },
  { label: "구분", key: "case_type" },
  { label: "상호명", key: "business_name" },
  { label: "대표자", key: "owner_name" },
  { label: "연락처", key: "phone" },
  { label: "담당자", key: "cs" },
  { label: "인터넷", key: "internet" },
  { label: "상태", key: "status" },
  { label: "확인일", key: "next_check_date" },
];

interface Props {
  rows: FranchiseApplication[];
  allRows: FranchiseApplication[];
  filteredCount: number;
  selected: Set<string>;
  allChecked: boolean;
  page: number;
  totalPages: number;
  kpiCounts: Record<KpiKey, number>;
  successRateStats: {
    day1: { rate: number | null; total: number };
    day30: { rate: number | null; total: number };
  };
  activeKpi: KpiKey | null;
  tableView: TableView;
  tableViewCounts: Record<TableView, number>;
  search: string;
  statusFilter: string;
  applicantTypeFilter: string;
  channelFilter: string;
  caseTypeFilter: string;
  dateFrom: string;
  dateTo: string;
  sortBy: SortBy;
  csProfiles: Pick<Profile, "id" | "name" | "role">[];
  linkedInstalls: Record<string, { id: string; status: string }>;
  linkedInternets: Record<string, { id: string; status: string | null; category: string | null }>;
  busyId: string | null;
  onHelp: () => void;
  onNew: () => void;
  onNewExisting: () => void;
  onKpiChange: (key: KpiKey) => void;
  onTableViewChange: (view: TableView, kpi?: KpiKey | null) => void;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onApplicantTypeFilterChange: (value: string) => void;
  onChannelFilterChange: (value: string) => void;
  onCaseTypeFilterChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onSortChange: (value: SortBy) => void;
  onToggleAll: () => void;
  onToggleRow: (id: string) => void;
  todayDate: string;
  columnSort: ColumnSortState;
  onColumnSortChange: (key: ColumnSortKey) => void;
  onSaveField: (
    row: FranchiseApplication,
    field: keyof FranchiseApplication,
    value: string,
  ) => void | Promise<void>;
  onSaveNextCheckDate: (row: FranchiseApplication, value: string) => void | Promise<void>;
  onApplicantTypeChange: (row: FranchiseApplication, value: ApplicantType) => void | Promise<void>;
  onCsChange: (row: FranchiseApplication, value: string) => void | Promise<void>;
  onStatusChange: (row: FranchiseApplication, value: FranchiseStatus) => void;
  onOpenDetail: (row: FranchiseApplication) => void;
  onOpenMemo: (id: string) => void;
  onPageChange: (page: number) => void;
  onSelectAllFiltered: () => void;
  onBulkStatus: () => void;
  onBulkAssign: () => void;
  onBulkDelete: () => void;
  onBulkTransfer: () => void;
}

const HIDDEN_STATUSES: FranchiseStatus[] = [
  "internet_apply_done",
  "internet_done",
  "card_internet_apply_done",
];
const STATUS_OPTIONS = (Object.keys(FRANCHISE_STATUS_LABEL) as FranchiseStatus[]).filter(
  (status) => !HIDDEN_STATUSES.includes(status),
);
const buttonBase =
  "focus-visible:ring-primary/30 inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border font-semibold transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50";
const secondaryButton = `${buttonBase} border-border bg-card text-foreground hover:bg-muted h-9 px-4 text-sm`;
const primaryButton = `${buttonBase} border-primary bg-primary text-primary-foreground hover:bg-primary-hover h-9 px-4 text-sm`;
const iconButton = `${buttonBase} border-border bg-card text-foreground hover:bg-muted size-9 p-0`;
const selectBase =
  "border-border bg-card text-foreground focus-visible:ring-primary/30 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50";

function statusTone(status: FranchiseStatus) {
  if (status === "doc_waiting")
    return {
      pill: "!bg-[#ff0000] !text-[#ffffff]",
      solid: "bg-[#ff0000]",
      border: "border-[#ff0000]",
      stage: 0,
    };
  if (status === "doc_incomplete")
    return {
      pill: "!bg-red-500/15 !text-red-500",
      solid: "bg-red-500",
      border: "border-red-500",
      stage: 0,
    };
  if (status === "card_apply_done")
    return {
      pill: "!bg-blue-500/15 !text-blue-500",
      solid: "bg-blue-500",
      border: "border-blue-500",
      stage: 1,
    };
  if (status === "toss_review_apply_done")
    return {
      pill: "!bg-violet-500/15 !text-violet-500",
      solid: "bg-violet-500",
      border: "border-violet-500",
      stage: 2,
    };
  if (status === "card_done")
    return {
      pill: "!bg-sky-500/15 !text-sky-500",
      solid: "bg-sky-500",
      border: "border-sky-500",
      stage: 2,
    };
  if (status === "toss_review_done")
    return {
      pill: "!bg-teal-500/15 !text-teal-500",
      solid: "bg-teal-500",
      border: "border-teal-500",
      stage: 2,
    };
  if (status === "completed" || status === "internet_done")
    return {
      pill: "!bg-green-500/15 !text-green-500",
      solid: "bg-green-500",
      border: "border-green-500",
      stage: 3,
    };
  if (status === "persistent_absence")
    return {
      pill: "!bg-orange-500/15 !text-orange-500",
      solid: "bg-orange-500",
      border: "border-orange-500",
      stage: 0,
    };
  return {
    pill: "!bg-zinc-500/15 !text-zinc-500",
    solid: "bg-zinc-500",
    border: "border-zinc-500",
    stage: 0,
  };
}

// 확인일 경과 정도: -1 = 미지정, 0 = 정상, 1 = 확인일이 오늘~내일(초록), 2 = 3일 이상 경과(노랑), 3 = 7일 이상 경과(빨강)
export function nextCheckSeverity(
  nextCheckDate: string | null | undefined,
  todayDate: string,
): -1 | 0 | 1 | 2 | 3 {
  if (!nextCheckDate) return -1;
  const nextMs = new Date(`${nextCheckDate}T00:00:00+09:00`).getTime();
  const todayMs = new Date(`${todayDate}T00:00:00+09:00`).getTime();
  const daysPast = Math.floor((todayMs - nextMs) / (24 * 60 * 60 * 1000));
  if (daysPast >= 7) return 3;
  if (daysPast >= 3) return 2;
  if (daysPast >= -1 && daysPast <= 0) return 1;
  return 0;
}

function nextCheckDotColor(nextCheckDate: string | null | undefined, todayDate: string): string {
  const severity = nextCheckSeverity(nextCheckDate, todayDate);
  if (severity === 3) return "!bg-gradient-to-br !from-red-400 !to-red-600";
  if (severity === 2) return "!bg-gradient-to-br !from-yellow-300 !to-yellow-500";
  if (severity === 1) return "!bg-gradient-to-br !from-green-300 !to-green-500";
  return "";
}

function columnSortIndicator(columnSort: ColumnSortState, key: ColumnSortKey) {
  const active = columnSort?.key === key;
  if (!active) return <ChevronDownIcon className="text-muted-foreground/35 size-3.5" />;
  return columnSort!.dir === "desc" ? (
    <ChevronDownIcon className="text-primary size-3.5" />
  ) : (
    <ChevronUpIcon className="text-primary size-3.5" />
  );
}

const MEMO_STAMP_RE = /\[(.+?) (\d{2})\. (\d{2})\. (\d{2}):(\d{2})\]/g;
const PIN_RE = /^PIN:(\d+):/;
const LEGACY_PIN_MARKER = "PIN::";

function hasPinMarker(text: string): boolean {
  return text.startsWith(LEGACY_PIN_MARKER) || PIN_RE.test(text);
}

// PIN 마커가 붙어 있으면 pinned=true와 함께 마커를 뗀 텍스트를 반환한다
function stripPinPrefix(text: string): { pinned: boolean; text: string } {
  if (text.startsWith(LEGACY_PIN_MARKER))
    return { pinned: true, text: text.slice(LEGACY_PIN_MARKER.length) };
  const m = text.match(PIN_RE);
  if (m) return { pinned: true, text: text.slice(m[0].length) };
  return { pinned: false, text };
}

// 메모 드로어에서 상단 고정(북마크)한 항목만 표에 노출하기 위해 항목별 pinned 여부를 함께 반환한다
function pinnedMemoEntries(memo: string | undefined | null): string[] {
  if (!memo?.trim()) return [];
  const matches = [...memo.matchAll(MEMO_STAMP_RE)];
  const entries: { text: string; pinned: boolean }[] = [];
  if (matches.length === 0) {
    const { pinned, text } = stripPinPrefix(memo.trim());
    entries.push({ text, pinned });
  } else {
    const leadingRaw = memo.slice(0, matches[0].index).trim();
    if (leadingRaw) {
      const { pinned, text } = stripPinPrefix(leadingRaw);
      entries.push({ text, pinned });
    }
    matches.forEach((m, i) => {
      const start = m.index! + m[0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index! : memo.length;
      const text = memo.slice(start, end).trim();
      if (text) entries.push({ text, pinned: hasPinMarker(m[1]) });
    });
  }
  return entries
    .filter((entry) => entry.pinned)
    .reverse()
    .map((entry) => entry.text);
}

function pageRange(current: number, total: number) {
  let start = Math.max(1, current - 2);
  const end = Math.min(total, start + 4);
  start = Math.max(1, end - 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export default function FranchiseReceiptSurface(props: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const tabs = [
    { key: "all", label: "전체", count: props.allRows.length, view: "all" as TableView },
    { key: "mine", label: "내 업무", count: props.tableViewCounts.mine, view: "mine" as TableView },
    {
      key: "docMissing",
      label: "서류 미비",
      count: props.tableViewCounts.doc_incomplete,
      view: "doc_incomplete" as TableView,
    },
    {
      key: "review",
      label: "심사 대기",
      count: props.kpiCounts.reviewing,
      view: "all" as TableView,
      kpi: "reviewing" as KpiKey,
    },
    {
      key: "techDone",
      label: "승인 완료",
      count: props.tableViewCounts.approved,
      view: "approved" as TableView,
    },
    {
      key: "persistentAbsence",
      label: "지속적 부재",
      count: props.tableViewCounts.persistent_absence,
      view: "persistent_absence" as TableView,
    },
  ];
  const activeTab =
    props.activeKpi === "reviewing"
      ? "review"
      : props.tableView === "doc_incomplete"
        ? "docMissing"
        : props.tableView === "approved"
          ? "techDone"
          : props.tableView === "persistent_absence"
            ? "persistentAbsence"
            : props.tableView;
  const kpis = [
    {
      key: "today_received" as KpiKey,
      label: "오늘 접수",
      icon: FileTextIcon,
      tone: "bg-blue-500/12 text-blue-600",
    },
    {
      key: "doc_waiting" as KpiKey,
      label: "서류 대기",
      icon: ClockIcon,
      tone: "bg-amber-500/12 text-amber-600",
    },
    {
      key: "doc_incomplete" as KpiKey,
      label: "서류 미비",
      icon: FileWarningIcon,
      tone: "bg-red-500/12 text-red-600",
    },
    {
      key: "reviewing" as KpiKey,
      label: "심사 중",
      icon: SearchIcon,
      tone: "bg-blue-500/12 text-blue-600",
    },
    {
      key: "today_completed" as KpiKey,
      label: "오늘 완료",
      icon: CheckIcon,
      tone: "bg-emerald-500/12 text-emerald-600",
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-foreground text-2xl font-bold tracking-tight">가맹 접수 관리</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            가맹 접수부터 기술지원 이관과 설치 완료까지 관리합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={props.onNewExisting} className={secondaryButton}>
            <PlusIcon className="size-3.5" />
            전환·승계·명변 접수
          </button>
          <button type="button" onClick={props.onNew} className={primaryButton}>
            <PlusIcon className="size-3.5" />
            신규 접수
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md">
        <RateBadge
          title="접수 성공률"
          description="접수 등록 건 중 카드가맹접수/토스심사접수완료 단계 이상에 도달한 비율"
          icon={PercentIcon}
          tone="fuchsia"
          stats={[
            { rate: props.successRateStats.day1.rate, label: "1일" },
            { rate: props.successRateStats.day30.rate, label: "30일" },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <button
              key={kpi.key}
              type="button"
              onClick={() => props.onKpiChange(kpi.key)}
              className="border-border bg-card shadow-card hover:border-primary/40 focus-visible:border-primary focus-visible:ring-primary/30 flex min-h-24 items-center gap-3 rounded-xl border px-5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <span
                className={`flex size-11 shrink-0 items-center justify-center rounded-full ${kpi.tone}`}
              >
                <Icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="text-muted-foreground block truncate text-xs">{kpi.label}</span>
                <span className="text-foreground mt-1 block text-2xl font-bold">
                  {props.kpiCounts[kpi.key]}
                  <small className="text-muted-foreground ml-1 text-xs font-medium">건</small>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-border bg-card flex flex-col gap-2.5 rounded-xl border p-3.5">
        <div className="flex items-center gap-2">
          <div className="relative w-full max-w-80">
            <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <input
              aria-label="통합 검색"
              placeholder="상호명, 대표자, 연락처, 사업자번호 통합 검색"
              value={props.search}
              onChange={(event) => props.onSearchChange(event.target.value)}
              className="border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/30 h-9 w-full rounded-lg border pr-3 pl-8 text-sm outline-none focus-visible:ring-2"
            />
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setAdvancedOpen((value) => !value)}
            className={`${secondaryButton} h-8 px-3 text-xs`}
          >
            <ListFilterIcon className="size-3.5" />
            고급 필터
            <ChevronDownIcon
              className={`size-3 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
            />
          </button>
        </div>
        {advancedOpen && (
          <div className="border-border flex flex-wrap items-center gap-2 border-t pt-2.5">
            <div className="w-40">
              <select
                aria-label="상태"
                value={props.statusFilter}
                onChange={(event) => props.onStatusFilterChange(event.target.value)}
                className={selectBase}
              >
                <option value="">전체</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {FRANCHISE_STATUS_LABEL[status]}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-40">
              <select
                aria-label="사업자 유형"
                value={props.applicantTypeFilter}
                onChange={(event) => props.onApplicantTypeFilterChange(event.target.value)}
                className={selectBase}
              >
                <option value="">사업자 유형 전체</option>
                {(Object.keys(APPLICANT_TYPE_LABEL) as ApplicantType[]).map((type) => (
                  <option key={type} value={type}>
                    {APPLICANT_TYPE_LABEL[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-32">
              <select
                aria-label="채널"
                value={props.channelFilter}
                onChange={(event) => props.onChannelFilterChange(event.target.value)}
                className={selectBase}
              >
                <option value="">채널 전체</option>
                {(Object.keys(FRANCHISE_CHANNEL_LABEL) as FranchiseChannel[]).map((c) => (
                  <option key={c} value={c}>
                    {FRANCHISE_CHANNEL_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-32">
              <select
                aria-label="구분"
                value={props.caseTypeFilter}
                onChange={(event) => props.onCaseTypeFilterChange(event.target.value)}
                className={selectBase}
              >
                <option value="">구분 전체</option>
                {(Object.keys(FRANCHISE_CASE_TYPE_LABEL) as FranchiseCaseType[]).map((c) => (
                  <option key={c} value={c}>
                    {FRANCHISE_CASE_TYPE_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-32" title="인터넷 필터 기능 추가 필요">
              <select aria-label="인터넷" value="all" disabled className={selectBase}>
                <option value="all">인터넷 전체</option>
                <option value="3S">3S</option>
                <option value="백메가">백메가</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <input
                aria-label="접수일 시작"
                type="date"
                value={props.dateFrom}
                onChange={(event) => props.onDateFromChange(event.target.value)}
                className={`${selectBase} w-[130px]`}
              />
              <span className="text-muted-foreground text-xs">~</span>
              <input
                aria-label="접수일 종료"
                type="date"
                value={props.dateTo}
                onChange={(event) => props.onDateToChange(event.target.value)}
                className={`${selectBase} w-[130px]`}
              />
            </div>
            <div className="w-32">
              <select
                aria-label="정렬"
                value={props.sortBy === "created_at" ? "latest" : props.sortBy}
                onChange={(event) => {
                  if (event.target.value !== "oldest")
                    props.onSortChange(event.target.value as SortBy);
                }}
                className={selectBase}
              >
                <option value="latest">등록일순</option>
                <option value="oldest" disabled>
                  오래된순
                </option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="border-border flex items-center justify-between border-b">
        <div role="tablist" aria-label="가맹 접수 상태 필터" className="flex items-center gap-1">
          {tabs.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => tab.view && props.onTableViewChange(tab.view, tab.kpi)}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-sm whitespace-nowrap disabled:opacity-50 ${active ? "border-primary text-primary font-bold" : "text-muted-foreground border-transparent font-medium"}`}
              >
                <span>{tab.label}</span>
                <span
                  className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11.5px] leading-none font-bold ${active ? "bg-primary-muted text-primary" : "bg-muted text-muted-foreground"}`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-1 pb-2.5">
          <span className="text-foreground text-sm font-semibold">
            전체 {props.filteredCount}건
          </span>
          <button type="button" title="도움말" onClick={props.onHelp} className={iconButton}>
            <CircleHelpIcon className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="border-border bg-card shrink-0 overflow-hidden rounded-xl border">
        <div className="overflow-x-auto rounded-t-xl">
          <table className="w-full min-w-[1610px] border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-surface-subtle border-border border-b">
                <th className="w-10 px-3 py-2.5 text-left">
                  <input
                    aria-label="전체 선택"
                    type="checkbox"
                    checked={props.allChecked}
                    onChange={props.onToggleAll}
                    className="accent-primary size-[15px] cursor-pointer"
                  />
                </th>
                <th className="w-11 px-1 py-2.5 text-left">
                  <button
                    type="button"
                    aria-label="확인일 색상 정렬"
                    onClick={() => props.onColumnSortChange("next_check_color")}
                    className="text-muted-foreground hover:text-foreground inline-flex items-center"
                  >
                    {columnSortIndicator(props.columnSort, "next_check_color")}
                  </button>
                </th>
                {SORTABLE_HEADERS.map(({ label, key }) => (
                  <th
                    key={key}
                    className="text-muted-foreground px-2.5 py-2.5 text-left font-semibold whitespace-nowrap"
                  >
                    <button
                      type="button"
                      onClick={() => props.onColumnSortChange(key)}
                      className="hover:text-foreground inline-flex items-center gap-0.5"
                    >
                      {label}
                      {columnSortIndicator(props.columnSort, key)}
                    </button>
                  </th>
                ))}
                {["비고", "메모"].map((label) => (
                  <th
                    key={label}
                    className="text-muted-foreground px-2.5 py-2.5 text-left font-semibold whitespace-nowrap"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {props.rows.length === 0 && (
                <tr className="border-border border-b">
                  <td
                    colSpan={15}
                    style={{ height: 50 * 49 }}
                    className="text-muted-foreground text-center text-sm"
                  >
                    조건에 맞는 접수 건이 없습니다.
                  </td>
                </tr>
              )}
              {props.rows.map((row) => {
                const tone = statusTone(row.status);
                const memos = pinnedMemoEntries(row.memo);
                return (
                  <tr
                    key={row.id}
                    className={`border-border border-b ${props.selected.has(row.id) ? "bg-primary-muted" : ""}`}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        aria-label={`${row.business_name || row.owner_name || "접수"} 선택`}
                        type="checkbox"
                        checked={props.selected.has(row.id)}
                        onChange={() => props.onToggleRow(row.id)}
                        className="accent-primary size-[15px] cursor-pointer"
                      />
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      {(() => {
                        const dot = nextCheckDotColor(row.next_check_date, props.todayDate);
                        return dot ? (
                          <span
                            className="relative mx-auto flex size-8 items-center justify-center"
                            title="확인일 경과"
                          >
                            <span className={`relative inline-block size-5 rounded-full ${dot}`} />
                          </span>
                        ) : null;
                      })()}
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <input
                        aria-label="접수일"
                        type="date"
                        value={row.reception_date ?? ""}
                        onChange={(event) =>
                          props.onSaveField(row, "reception_date", event.target.value)
                        }
                        className="h-auto border-none bg-transparent px-0 text-[12.5px] outline-none"
                      />
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <input
                        aria-label="오픈 예정일"
                        type="date"
                        value={row.open_date ?? ""}
                        onChange={(event) =>
                          props.onSaveField(row, "open_date", event.target.value)
                        }
                        className="h-auto border-none bg-transparent px-0 text-[12.5px] outline-none"
                      />
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <select
                        aria-label="채널"
                        value={row.channel ?? ""}
                        onChange={(event) => props.onSaveField(row, "channel", event.target.value)}
                        className="text-foreground h-auto border-none bg-transparent py-0 pr-6 pl-0 text-[12.5px] outline-none"
                      >
                        <option value="">미지정</option>
                        {(Object.keys(FRANCHISE_CHANNEL_LABEL) as FranchiseChannel[]).map((c) => (
                          <option key={c} value={c}>
                            {FRANCHISE_CHANNEL_LABEL[c]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <span className="text-foreground text-[12.5px]">
                        {row.case_type ? FRANCHISE_CASE_TYPE_LABEL[row.case_type] : "미지정"}
                      </span>
                      {(row.is_rental || row.is_installment) && (
                        <span className="text-muted-foreground ml-1 text-[11px]">
                          {[row.is_rental && "렌탈", row.is_installment && "할부"]
                            .filter(Boolean)
                            .join("·")}
                        </span>
                      )}
                    </td>
                    <td className="max-w-[200px] px-2.5 py-2.5 font-semibold">
                      <button
                        type="button"
                        onClick={() => props.onOpenDetail(row)}
                        className="text-foreground hover:text-primary block w-full truncate text-left"
                      >
                        {row.business_name || "-"}
                      </button>
                    </td>
                    <td className="text-foreground px-2.5 py-2.5 whitespace-nowrap">
                      {row.owner_name || "-"}
                    </td>
                    <td
                      className="text-foreground cursor-pointer px-2.5 py-2.5 whitespace-nowrap"
                      onClick={() => row.phone && navigator.clipboard?.writeText(row.phone)}
                      title="클릭하여 복사"
                    >
                      {row.phone || "-"}
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <select
                        aria-label="담당자"
                        value={row.cs_id ?? ""}
                        onChange={(event) => props.onCsChange(row, event.target.value)}
                        className="text-foreground h-auto border-none bg-transparent py-0 pr-6 pl-0 text-[12.5px] outline-none"
                      >
                        <option value="">미배정</option>
                        {props.csProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td
                      className={`px-2.5 py-2.5 font-semibold whitespace-nowrap ${props.linkedInternets[row.id] ? "text-green-500" : "text-muted-foreground"}`}
                    >
                      {props.linkedInternets[row.id]?.category || row.internet || "-"}
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <select
                        aria-label="상태"
                        value={row.status}
                        disabled={props.busyId === row.id}
                        onChange={(event) =>
                          props.onStatusChange(row, event.target.value as FranchiseStatus)
                        }
                        className={`h-auto rounded-md border-none px-2.5 py-1.5 text-[11.5px] font-semibold outline-none ${tone.pill}`}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {FRANCHISE_STATUS_LABEL[status]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <input
                        aria-label="확인일"
                        type="date"
                        value={row.next_check_date ?? ""}
                        onChange={(event) => props.onSaveNextCheckDate(row, event.target.value)}
                        className="h-auto border-none bg-transparent px-0 text-[12.5px] outline-none"
                      />
                    </td>
                    <td className="text-foreground min-w-[140px] px-2.5 py-2.5">
                      {memos.length > 0 ? (
                        <ul className="list-disc space-y-0.5 pl-4">
                          {memos.map((entry, index) => (
                            <li key={index} className="break-words whitespace-pre-wrap">
                              {entry}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-2.5 py-2.5 align-middle" title={row.memo || "메모 없음"}>
                      <button
                        type="button"
                        onClick={() => props.onOpenMemo(row.id)}
                        aria-label={`${row.business_name || row.owner_name || "접수"} 메모`}
                        className="mx-auto block"
                      >
                        <StickyNoteIcon
                          className={`size-4 ${row.memo ? "text-muted-foreground" : "text-border"}`}
                        />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {props.rows.length > 0 &&
                Array.from({ length: Math.max(0, 50 - props.rows.length) }).map((_, index) => (
                  <tr key={`filler-${index}`} aria-hidden="true" className="border-border border-b">
                    <td colSpan={14} style={{ height: 49 }} />
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="relative flex min-h-14 items-center justify-between gap-3.5 px-4 py-2.5">
          {props.selected.size > 0 ? (
            <div className="border-border bg-card shadow-card flex flex-wrap items-center gap-3 rounded-lg border px-3.5 py-2">
              <span className="text-foreground text-sm font-semibold">
                {props.selected.size}건 선택됨
              </span>
              {props.selected.size < props.filteredCount && (
                <button
                  type="button"
                  onClick={props.onSelectAllFiltered}
                  className="text-primary text-xs font-semibold hover:underline"
                >
                  필터링된 전체 {props.filteredCount}건 선택
                </button>
              )}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={props.onBulkStatus}
                  className={`${secondaryButton} h-8 px-3 text-xs`}
                >
                  일괄 상태 변경
                </button>
                <button
                  type="button"
                  onClick={props.onBulkAssign}
                  className={`${secondaryButton} h-8 px-3 text-xs`}
                >
                  일괄 배정
                </button>
                <button
                  type="button"
                  onClick={props.onBulkDelete}
                  className="border-error/30 bg-error/10 text-error hover:bg-error/20 h-8 rounded-lg border px-3 text-xs font-semibold"
                >
                  선택 삭제
                </button>
                <button
                  type="button"
                  onClick={props.onBulkTransfer}
                  className={`${primaryButton} h-8 px-3 text-xs`}
                >
                  기술지원 이관
                </button>
              </div>
            </div>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-3.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="이전 페이지"
                disabled={props.page <= 1}
                onClick={() => props.onPageChange(Math.max(1, props.page - 1))}
                className={`${buttonBase} border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground size-9 p-0`}
              >
                <ChevronLeftIcon className="size-3.5" />
              </button>
              {pageRange(props.page, props.totalPages).map((page) => (
                <button
                  key={page}
                  type="button"
                  aria-current={page === props.page ? "page" : undefined}
                  onClick={() => props.onPageChange(page)}
                  className={`flex size-7 items-center justify-center rounded-md border text-xs font-semibold ${page === props.page ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-muted"}`}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                aria-label="다음 페이지"
                disabled={props.page >= props.totalPages}
                onClick={() => props.onPageChange(Math.min(props.totalPages, props.page + 1))}
                className={`${buttonBase} border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground size-9 p-0`}
              >
                <ChevronRightIcon className="size-3.5" />
              </button>
            </div>
            <select
              aria-label="페이지당 표시 개수"
              value="50"
              disabled
              title="페이지 크기 변경 기능 추가 필요"
              className={`${selectBase} h-8 w-auto py-0 text-xs`}
            >
              <option value="10">10개씩 보기</option>
              <option value="20">20개씩 보기</option>
              <option value="50">50개씩 보기</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
