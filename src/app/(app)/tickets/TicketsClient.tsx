"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { AlertTriangle, ChevronRight, Search } from "lucide-react";
import { deleteTickets, requestTicketRevisionsBulk } from "./actions";
import { type QualityIssue } from "@/lib/resolutionQuality";
import { useToast } from "@/components/ui/Toast";
import {
  STATUS_LABEL,
  STATUS_COLOR,
  TYPE_LABEL,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  TEAM_LABEL,
  TEAM_COLOR,
  type TicketStatus,
  type TicketType,
  type Priority,
  type TicketTeam,
} from "@/types";
import {
  MEMO_ISSUE_CATEGORY_LABEL,
  MEMO_RESOLUTION_LABEL,
  type MemoIssueCategory,
  type MemoResolution,
} from "@/app/(app)/merchants/merchant360";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import BulkDeleteActions from "@/components/ui/BulkDeleteActions";
import BulkConfirmDialog from "@/components/ui/BulkConfirmDialog";

interface Ticket {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  team?: TicketTeam | null;
  reception_channel?: string | null;
  issue_category?: string | null;
  resolution?: string | null;
  is_repeat?: boolean | null;
  scheduled_at?: string;
  created_at: string;
  merchant?: { business_name: string; phone: string } | null;
  tech?: { name: string } | null;
}

export default function TicketsClient({
  tickets,
  initialSearch = "",
  quality = {},
  isMaster = false,
}: {
  tickets: Ticket[];
  initialSearch?: string;
  quality?: Record<string, { issues: QualityIssue[]; hasOpenRequest: boolean }>;
  isMaster?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [revisionConfirmOpen, setRevisionConfirmOpen] = useState(false);
  const [sendingRevision, setSendingRevision] = useState(false);
  const [search, setSearch] = useState(initialSearch);

  // 검색은 서버가 전체 범위에서 수행한다(현재 페이지 50건만 걸러지는 문제 방지).
  // 입력 후 400ms 지나면 q 파라미터로 반영하고 1페이지부터 다시 본다.
  useEffect(() => {
    const current = (searchParams.get("q") ?? "").trim();
    if (search.trim() === current) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      if (search.trim()) next.set("q", search.trim());
      else next.delete("q");
      next.delete("page");
      router.replace(`/tickets?${next.toString()}`);
    }, 400);
    return () => clearTimeout(timer);
  }, [search, searchParams, router]);

  const filteredTickets = search.trim()
    ? tickets.filter((t) => {
        const q = search.trim().toLowerCase();
        // 서버(q 파라미터)가 거르는 필드와 같은 범위여야 한다 — 전화번호가 빠지면
        // 서버가 찾아준 행을 여기서 도로 숨긴다.
        return (
          t.title?.toLowerCase().includes(q) ||
          t.merchant?.business_name?.toLowerCase().includes(q) ||
          t.merchant?.phone?.toLowerCase().includes(q) ||
          t.tech?.name?.toLowerCase().includes(q)
        );
      })
    : tickets;

  const allChecked = filteredTickets.length > 0 && filteredTickets.every((t) => selected.has(t.id));

  // 미달이면서 아직 대기 중인 수정 요청이 없는 건만 일괄 발송 대상이 된다.
  const revisionTargets = filteredTickets.filter(
    (t) => selected.has(t.id) && quality[t.id] && !quality[t.id].hasOpenRequest,
  );

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(filteredTickets.map((t) => t.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleDelete() {
    if (selected.size === 0) return;
    setDeleteConfirmOpen(true);
  }

  async function confirmDelete() {
    setDeleting(true);
    const { error } = await deleteTickets([...selected]);
    setDeleting(false);
    setDeleteConfirmOpen(false);
    if (error) {
      alert("삭제 실패: " + error);
      return;
    }
    setSelected(new Set());
    startTransition(() => router.refresh());
  }

  async function confirmRevisionRequests() {
    setSendingRevision(true);
    const result = await requestTicketRevisionsBulk(revisionTargets.map((t) => t.id));
    setSendingRevision(false);
    setRevisionConfirmOpen(false);
    if (result.error) {
      toast.error(`수정 요청 실패: ${result.error}`);
      return;
    }
    // 건너뛴 건수만 알려주면 왜 빠졌는지 알 수 없다. 사유를 함께 붙인다.
    const reasons: string[] = [];
    if (result.skipped.noAssignee > 0) reasons.push(`담당자 없음 ${result.skipped.noAssignee}건`);
    if (result.skipped.alreadyOpen > 0)
      reasons.push(`이미 요청 중 ${result.skipped.alreadyOpen}건`);
    if (result.skipped.noIssue > 0) reasons.push(`미달 아님 ${result.skipped.noIssue}건`);
    toast.success(
      reasons.length > 0
        ? `${result.sent}건을 보냈습니다. 건너뜀 — ${reasons.join(" · ")}`
        : `${result.sent}건을 보냈습니다.`,
    );
    setSelected(new Set());
    startTransition(() => router.refresh());
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {}
      <div className="px-6 py-3 border-b border-slate-100">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="가맹점명, 제목, 담당 기사로 검색"
            className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {selected.size > 0 && (
        <BulkDeleteActions
          count={selected.size}
          deleting={deleting}
          onDelete={handleDelete}
          onCancel={() => setSelected(new Set())}
        >
          {isMaster && revisionTargets.length > 0 && (
            <button
              type="button"
              onClick={() => setRevisionConfirmOpen(true)}
              disabled={sendingRevision}
              className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
            >
              <AlertTriangle size={14} />
              수정 요청 {revisionTargets.length}건
            </button>
          )}
        </BulkDeleteActions>
      )}

      {filteredTickets.length === 0 && (
        <EmptyState message={search.trim() ? "검색 결과가 없습니다" : "인입내역이 없습니다"} />
      )}

      <div className="divide-y divide-slate-50">
        {filteredTickets.length > 0 && (
          <div className="flex items-center gap-3 px-6 py-2.5 bg-slate-50 border-b border-slate-100">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={toggleAll}
              className="w-4 h-4 accent-blue-600 cursor-pointer"
            />
            <span className="text-xs text-slate-400 font-medium">전체 선택</span>
          </div>
        )}
        {filteredTickets.map((ticket) => (
          <div
            key={ticket.id}
            className="flex items-center gap-3 px-6 py-4 hover:bg-slate-50 transition-colors group"
          >
            <input
              type="checkbox"
              checked={selected.has(ticket.id)}
              onChange={() => toggleOne(ticket.id)}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 accent-blue-600 cursor-pointer flex-shrink-0"
            />
            <Link href={`/tickets/${ticket.id}`} className="flex items-center gap-4 flex-1 min-w-0">
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge colorClass={STATUS_COLOR[ticket.status as TicketStatus]}>
                    {STATUS_LABEL[ticket.status as TicketStatus]}
                  </Badge>
                  <Badge colorClass={PRIORITY_COLOR[ticket.priority as Priority]}>
                    {PRIORITY_LABEL[ticket.priority as Priority]}
                  </Badge>
                  {ticket.team && TEAM_LABEL[ticket.team] && (
                    <Badge colorClass={TEAM_COLOR[ticket.team]}>{TEAM_LABEL[ticket.team]}</Badge>
                  )}
                  <span className="text-xs text-slate-600 font-medium">
                    {TYPE_LABEL[ticket.type as TicketType]}
                  </span>
                  {ticket.reception_channel && (
                    <span className="text-xs text-slate-500">{ticket.reception_channel}</span>
                  )}
                  {ticket.issue_category &&
                    MEMO_ISSUE_CATEGORY_LABEL[ticket.issue_category as MemoIssueCategory] && (
                      <span className="text-xs text-slate-500">
                        {MEMO_ISSUE_CATEGORY_LABEL[ticket.issue_category as MemoIssueCategory]}
                      </span>
                    )}
                  {ticket.resolution &&
                    MEMO_RESOLUTION_LABEL[ticket.resolution as MemoResolution] && (
                      <span className="text-xs text-slate-500">
                        {MEMO_RESOLUTION_LABEL[ticket.resolution as MemoResolution]}
                      </span>
                    )}
                  {ticket.is_repeat === true && (
                    <Badge colorClass="bg-red-100 text-red-700">또 그럼</Badge>
                  )}
                  {quality[ticket.id] && (
                    <span title={quality[ticket.id].issues.map((i) => i.label).join(", ")}>
                      <Badge colorClass="bg-amber-100 text-amber-800">
                        {`해결 절차 미달 ${quality[ticket.id].issues.length}`}
                      </Badge>
                    </span>
                  )}
                  {quality[ticket.id]?.hasOpenRequest && (
                    <Badge colorClass="bg-slate-100 text-slate-500">수정 요청 대기</Badge>
                  )}
                </div>
                <p className="text-sm font-semibold text-slate-900 break-words">{ticket.title}</p>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="font-medium">
                    {ticket.merchant?.business_name || <span className="text-slate-400">-</span>}
                  </span>
                  {ticket.scheduled_at && (
                    <span>
                      {format(new Date(ticket.scheduled_at), "M/d HH:mm", { locale: ko })}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0 flex items-center gap-2">
                <div>
                  <p className="text-xs text-slate-500">
                    {format(new Date(ticket.created_at), "M/d", { locale: ko })}
                  </p>
                  {ticket.tech?.name && (
                    <p className="text-xs text-slate-600 mt-1 font-medium">{ticket.tech.name}</p>
                  )}
                </div>
                <ChevronRight
                  size={16}
                  className="text-slate-300 group-hover:text-slate-400 transition-colors"
                />
              </div>
            </Link>
          </div>
        ))}
      </div>

      <BulkConfirmDialog
        open={deleteConfirmOpen}
        title="선택 항목 삭제"
        busy={deleting}
        confirmText="삭제"
        confirmColor="red"
        items={tickets.filter((t) => selected.has(t.id)).map((t) => ({ id: t.id, label: t.title }))}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={confirmDelete}
      />

      <BulkConfirmDialog
        open={revisionConfirmOpen}
        title="수정 요청 보내기"
        subtitle="사유는 각 건의 품질 점검 결과로 자동 작성됩니다. 담당자에게 알림이 갑니다."
        busy={sendingRevision}
        confirmText="보내기"
        confirmColor="blue"
        confirmQuestion="선택한 건의 담당자에게 수정 요청을 보냅니다."
        items={revisionTargets.map((t) => ({
          id: t.id,
          label: t.title,
          detail: quality[t.id].issues.map((i) => i.label).join(" · "),
        }))}
        onCancel={() => setRevisionConfirmOpen(false)}
        onConfirm={confirmRevisionRequests}
      />
    </div>
  );
}
