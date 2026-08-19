"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ArrowRight, Search, X } from "lucide-react";
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

export interface EmployeeActivityLog {
  id: string;
  source: "franchise" | "installation" | "ticket" | "inventory";
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

const SOURCE_TONE: Record<EmployeeActivityLog["source"], string> = {
  franchise: "bg-blue-50 text-blue-700",
  installation: "bg-orange-50 text-orange-700",
  ticket: "bg-purple-50 text-purple-700",
  inventory: "bg-emerald-50 text-emerald-700",
};

function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

function statusLabel(source: EmployeeActivityLog["source"], status: string | null) {
  if (!status) return "-";
  if (source === "franchise") {
    if (status.startsWith("alimtalk:")) {
      const key = status.replace("alimtalk:", "");
      return `알림톡 발송 (${ALIMTALK_LABEL[key] ?? key})`;
    }
    return (
      FRANCHISE_ACTIVITY_LABEL[status] ??
      FRANCHISE_STATUS_LABEL[status as FranchiseStatus] ??
      status
    );
  }
  if (source === "installation") return INSTALLATION_STATUS_LABEL[status] ?? status;
  if (source === "ticket") return STATUS_LABEL[status as TicketStatus] ?? status;
  return status;
}

export default function LogsClient({
  logs,
  selectedDate,
  nextCursor,
  isOlderPage,
}: {
  logs: EmployeeActivityLog[];
  selectedDate: string | null;
  nextCursor: string | null;
  isOlderPage: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<EmployeeActivityLog["source"] | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((log) => {
      if (source !== "all" && log.source !== source) return false;
      if (!q) return true;
      return (
        log.actorName.toLowerCase().includes(q) ||
        log.subject.toLowerCase().includes(q) ||
        (log.description ?? "").toLowerCase().includes(q) ||
        log.sourceLabel.toLowerCase().includes(q)
      );
    });
  }, [logs, query, source]);

  const userCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of logs) counts.set(log.actorName, (counts.get(log.actorName) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [logs]);

  const sourceCounts = useMemo(() => {
    const counts = new Map<EmployeeActivityLog["source"], number>();
    for (const log of logs) counts.set(log.source, (counts.get(log.source) ?? 0) + 1);
    return counts;
  }, [logs]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DatePickerField
          value={selectedDate ?? ""}
          onChange={(value) => value && router.push(`/admin/logs?date=${value}`)}
          ariaLabel="조회 날짜"
        />
        <button
          onClick={() => router.push(`/admin/logs?date=${todayStr()}`)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          오늘
        </button>
        {selectedDate && (
          <button
            onClick={() => router.push("/admin/logs")}
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
        {(["franchise", "installation", "ticket", "inventory"] as const).map((item) => (
          <SourceButton
            key={item}
            label={
              { franchise: "가맹접수", installation: "설치", ticket: "작업", inventory: "재고" }[
                item
              ]
            }
            count={sourceCounts.get(item) ?? 0}
            active={source === item}
            onClick={() => setSource(item)}
          />
        ))}
      </div>

      {userCounts.length > 0 && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold text-slate-500">
            {selectedDate ? `${selectedDate} 담당자별 처리 건수` : "담당자별 처리 건수"}
          </p>
          <div className="flex flex-wrap gap-2">
            {userCounts.map(([name, count]) => (
              <span
                key={name}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
              >
                {name} <span className="font-semibold text-blue-600">{count}건</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="담당자, 상호명, 고객명 또는 처리 내용 검색"
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
                  <p className="mt-1 text-xs text-slate-600">
                    {log.source === "installation"
                      ? (INSTALLATION_ACTION_LABEL[log.description] ?? log.description)
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
