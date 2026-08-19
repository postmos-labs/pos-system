"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ArrowRight, Search, Store, X } from "lucide-react";
import { DatePickerField } from "@/components/ui/DatePickerField";
import {
  FRANCHISE_STATUS_LABEL,
  STATUS_LABEL,
  type FranchiseStatus,
  type TicketStatus,
} from "@/types";
import {
  INSTALLATION_DELIVERY_TYPE_LABEL,
  isInstallationDeliveryType,
} from "@/lib/installationDeliveryType";

export type ActivitySource =
  | "franchise"
  | "call"
  | "installation"
  | "ticket"
  | "change"
  | "memo"
  | "alimtalk"
  | "inventory"
  | "deletion";

export interface EmployeeActivityLog {
  id: string;
  source: ActivitySource;
  sourceLabel: string;
  actorName: string;
  subject: string;
  fromStatus: string | null;
  toStatus: string | null;
  details: Record<string, unknown> | null;
  description: string | null;
  createdAt: string;
}

const INSTALLATION_STATUS_LABEL: Record<string, string> = {
  received: "접수",
  preparing: "제품준비",
  scheduled: "일정확정",
  in_transit: "이동중",
  delivery_sent: "택배발송",
  completed: "설치완료",
  rejected: "반려",
};

const CHANGE_STATUS_LABEL_LOCAL: Record<string, string> = {
  pending: "접수",
  processing: "처리중",
  done: "완료",
};

const FRANCHISE_ACTIVITY_LABEL: Record<string, string> = {
  transfer_approval_requested: "이관 승인 요청",
  transfer_cs_responsible_approved: "CS책임 승인",
  transfer_cs_responsible_rejected: "CS책임 반려",
  transfer_team_lead_approved: "팀장 최종 승인",
  transfer_team_lead_rejected: "팀장 반려",
  install_transfer: "기술지원 이관",
  install_retransfer: "기술지원 재이관",
  install_rejected: "기술지원 반려",
};

const ALIMTALK_LABEL: Record<string, string> = {
  doc_request: "서류 안내",
  doc_incomplete: "서류미비",
  card_apply_done: "카드접수완료",
  card_done: "카드가맹완료",
  internet_apply_done: "인터넷접수완료",
  internet_done: "인터넷개통완료",
  toss_review_apply_done: "토스심사접수완료",
  toss_review_done: "토스심사완료",
  preparing: "제품준비 안내",
  scheduled: "일정확정 안내",
  in_transit: "이동중 안내",
  delivery_sent: "택배발송 안내",
  completed: "설치완료 안내",
  sign_request: "서명 요청",
  sign_complete: "서명 완료",
};

const INSTALLATION_ACTION_LABEL: Record<string, string> = {
  created: "설치건 생성",
  status_changed: "상태 변경",
  assignment_changed: "담당자 변경",
  completion_requested: "완료 승인 요청",
  completion_approved: "완료 승인",
  completion_rejected: "완료 반려",
  step_approval_requested: "단계 승인 요청",
  step_responsible_approved: "책임자 승인",
  step_final_approved: "팀장 승인",
  step_approval_rejected: "단계 승인 반려",
};

const SOURCE_TONE: Record<ActivitySource, string> = {
  franchise: "bg-blue-50 text-blue-700",
  call: "bg-cyan-50 text-cyan-700",
  installation: "bg-orange-50 text-orange-700",
  ticket: "bg-purple-50 text-purple-700",
  change: "bg-indigo-50 text-indigo-700",
  memo: "bg-slate-100 text-slate-700",
  alimtalk: "bg-teal-50 text-teal-700",
  inventory: "bg-emerald-50 text-emerald-700",
  deletion: "bg-red-50 text-red-700",
};

const SOURCE_FILTERS: { key: ActivitySource; label: string }[] = [
  { key: "franchise", label: "가맹접수" },
  { key: "call", label: "통화" },
  { key: "installation", label: "설치" },
  { key: "ticket", label: "작업" },
  { key: "change", label: "변경접수" },
  { key: "memo", label: "메모" },
  { key: "alimtalk", label: "알림톡" },
  { key: "inventory", label: "재고" },
  { key: "deletion", label: "삭제" },
];

function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

function statusLabel(source: ActivitySource, status: string | null) {
  if (!status) return "-";
  if (source === "franchise") {
    if (status.startsWith("alimtalk:")) {
      const key = status.replace("alimtalk:", "");
      return `알림톡 발송 (${ALIMTALK_LABEL[key] ?? key})`;
    }
    return (
      FRANCHISE_ACTIVITY_LABEL[status] ??
      FRANCHISE_STATUS_LABEL[status as FranchiseStatus] ??
      "기타"
    );
  }
  if (source === "installation") return INSTALLATION_STATUS_LABEL[status] ?? "기타";
  if (source === "ticket") return STATUS_LABEL[status as TicketStatus] ?? "기타";
  if (source === "change") return CHANGE_STATUS_LABEL_LOCAL[status] ?? "기타";
  return status;
}

/** 알림톡 소스의 description은 `template_key` 또는 `template_key · 발송실패: ...` 형태다. */
function alimtalkDescription(description: string) {
  const [key, ...rest] = description.split(" · ");
  const label = ALIMTALK_LABEL[key] ?? key;
  return [label, ...rest].join(" · ");
}

export default function LogsClient({
  logs,
  fromDate,
  toDate,
  merchantQuery,
  nextCursor,
  isOlderPage,
}: {
  logs: EmployeeActivityLog[];
  fromDate: string | null;
  toDate: string | null;
  merchantQuery: string;
  nextCursor: string | null;
  isOlderPage: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<ActivitySource | "all">("all");
  const [actor, setActor] = useState<string | null>(null);
  const [merchantInput, setMerchantInput] = useState(merchantQuery);

  function navigate(
    nextFrom: string | null,
    nextTo: string | null,
    nextMerchant: string = merchantQuery,
  ) {
    const search = new URLSearchParams();
    if (nextFrom) search.set("from", nextFrom);
    if (nextTo) search.set("to", nextTo);
    if (nextMerchant.trim()) search.set("q", nextMerchant.trim());
    const qs = search.toString();
    router.push(qs ? `/admin/logs?${qs}` : "/admin/logs");
  }

  function applyRange(nextFrom: string | null, nextTo: string | null) {
    navigate(nextFrom, nextTo);
  }

  function applyMerchantSearch(value: string) {
    navigate(fromDate, toDate, value);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((log) => {
      if (source !== "all" && log.source !== source) return false;
      if (actor && log.actorName !== actor) return false;
      if (!q) return true;
      return (
        log.actorName.toLowerCase().includes(q) ||
        log.subject.toLowerCase().includes(q) ||
        (log.description ?? "").toLowerCase().includes(q) ||
        log.sourceLabel.toLowerCase().includes(q)
      );
    });
  }, [logs, query, source, actor]);

  // 담당자별 건수는 소스 필터까지만 반영한다 (담당자를 골라도 다른 사람 건수가 사라지지 않도록)
  const userCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of logs) {
      if (source !== "all" && log.source !== source) continue;
      counts.set(log.actorName, (counts.get(log.actorName) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [logs, source]);

  const sourceCounts = useMemo(() => {
    const counts = new Map<ActivitySource, number>();
    for (const log of logs) counts.set(log.source, (counts.get(log.source) ?? 0) + 1);
    return counts;
  }, [logs]);

  const hasDateFilter = Boolean(fromDate || toDate);

  return (
    <>
      <div className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Store size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={merchantInput}
              onChange={(event) => setMerchantInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyMerchantSearch(merchantInput);
              }}
              placeholder="가맹점 상호명으로 전체 기간 검색 (Enter)"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => applyMerchantSearch(merchantInput)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            검색
          </button>
          {merchantQuery && (
            <button
              onClick={() => {
                setMerchantInput("");
                applyMerchantSearch("");
              }}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              <X size={13} /> 검색 해제
            </button>
          )}
        </div>
        {merchantQuery && (
          <p className="mt-2 text-xs text-slate-500">
            <span className="font-semibold text-blue-600">{merchantQuery}</span> 가맹점의 전체 기간
            이력입니다. 재고는 가맹점 개념이 없어 제외됩니다.
          </p>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DatePickerField
          value={fromDate ?? ""}
          onChange={(value) => applyRange(value || null, toDate)}
          ariaLabel="조회 시작일"
          placeholder="시작일"
        />
        <span className="text-xs text-slate-400">~</span>
        <DatePickerField
          value={toDate ?? ""}
          onChange={(value) => applyRange(fromDate, value || null)}
          ariaLabel="조회 종료일"
          placeholder="종료일"
        />
        <button
          onClick={() => applyRange(todayStr(), todayStr())}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          오늘
        </button>
        <button
          onClick={() => {
            const to = new Date();
            const from = new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000);
            applyRange(format(from, "yyyy-MM-dd"), format(to, "yyyy-MM-dd"));
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          최근 7일
        </button>
        <button
          onClick={() => {
            const now = new Date();
            const first = new Date(now.getFullYear(), now.getMonth(), 1);
            applyRange(format(first, "yyyy-MM-dd"), format(now, "yyyy-MM-dd"));
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          이번 달
        </button>
        {hasDateFilter && (
          <button
            onClick={() => applyRange(null, null)}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            <X size={13} /> 초기화
          </button>
        )}
        {isOlderPage && (
          <button
            onClick={() => router.push("/admin/logs")}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            최신 로그로
          </button>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <SourceButton
          label="전체"
          count={logs.length}
          active={source === "all"}
          onClick={() => setSource("all")}
        />
        {SOURCE_FILTERS.map((item) => (
          <SourceButton
            key={item.key}
            label={item.label}
            count={sourceCounts.get(item.key) ?? 0}
            active={source === item.key}
            onClick={() => setSource(item.key)}
          />
        ))}
      </div>

      {userCounts.length > 0 && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-500">담당자별 처리 건수</p>
            {actor && (
              <button
                onClick={() => setActor(null)}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <X size={12} /> {actor} 필터 해제
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {userCounts.map(([name, count]) => (
              <button
                key={name}
                type="button"
                onClick={() => setActor(actor === name ? null : name)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  actor === name
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {name}{" "}
                <span className={actor === name ? "font-semibold" : "font-semibold text-blue-600"}>
                  {count}건
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="현재 목록에서 빠른 검색 (담당자·상호명·처리 내용)"
          className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="divide-y divide-slate-50">
          {filtered.map((log) => {
            const deliveryType =
              typeof log.details?.delivery_type === "string" ? log.details.delivery_type : null;
            return (
              <div key={log.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold ${SOURCE_TONE[log.source]}`}
                  >
                    {log.sourceLabel}
                  </span>
                  <span className="font-semibold text-slate-900">{log.actorName}</span>
                  <span className="text-slate-400">·</span>
                  <span>{log.subject}</span>
                </div>
                {(log.fromStatus || log.toStatus) && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <span>{statusLabel(log.source, log.fromStatus)}</span>
                    <ArrowRight size={11} />
                    <span className="font-medium text-slate-700">
                      {statusLabel(log.source, log.toStatus)}
                    </span>
                    {deliveryType && isInstallationDeliveryType(deliveryType) && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">
                        구분: {INSTALLATION_DELIVERY_TYPE_LABEL[deliveryType]}
                      </span>
                    )}
                  </div>
                )}
                {log.description && (
                  <p
                    className={`mt-1 whitespace-pre-wrap break-words text-xs ${
                      log.source === "deletion" ? "font-semibold text-red-600" : "text-slate-600"
                    }`}
                  >
                    {log.source === "installation"
                      ? (INSTALLATION_ACTION_LABEL[log.description] ?? log.description)
                      : log.source === "alimtalk"
                        ? alimtalkDescription(log.description)
                        : log.description}
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-400">
                  {format(new Date(log.createdAt), "yyyy-MM-dd HH:mm", { locale: ko })}
                </p>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">로그가 없습니다.</p>
          )}
        </div>
      </div>
      {nextCursor && (
        <button
          type="button"
          onClick={() => router.push(`/admin/logs?before=${encodeURIComponent(nextCursor)}`)}
          className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          이전 로그 300건 더 보기
        </button>
      )}
    </>
  );
}

function SourceButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${active ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
    >
      {label} <span className="ml-1 text-xs opacity-70">{count}</span>
    </button>
  );
}
