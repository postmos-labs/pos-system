"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { AlertTriangle, ChevronRight, Search } from "lucide-react";
import {
  deleteTickets,
  requestTicketRevisionsBulk,
  cancelTicketRevisionsForTickets,
  cancelAllOpenTicketRevisions,
} from "./actions";
import { fetchExportTargets } from "./exportActions";
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
  openRequestTicketIds = [],
  openRequestTotal = 0,
}: {
  tickets: Ticket[];
  initialSearch?: string;
  quality?: Record<string, { issues: QualityIssue[]; hasOpenRequest: boolean }>;
  isMaster?: boolean;
  openRequestTicketIds?: string[];
  openRequestTotal?: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const openRequestSet = new Set(openRequestTicketIds);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [revisionConfirmOpen, setRevisionConfirmOpen] = useState(false);
  const [sendingRevision, setSendingRevision] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelingRevision, setCancelingRevision] = useState(false);
  const [cancelAllConfirmOpen, setCancelAllConfirmOpen] = useState(false);
  const [cancelingAll, setCancelingAll] = useState(false);
  const [reviewAllLoading, setReviewAllLoading] = useState(false);
  const [reviewAllConfirmOpen, setReviewAllConfirmOpen] = useState(false);
  const [reviewAllSending, setReviewAllSending] = useState(false);
  const [reviewAllTargets, setReviewAllTargets] = useState<
    { id: string; label: string; detail: string }[]
  >([]);
  const [search, setSearch] = useState(initialSearch);

  const CHECK_MODE_KEY = "tickets:qualityCheck";
  // 마스터가 켜야만 품질 배지가 보인다. 규칙은 수정 요청을 돌릴 때만 쓰기로 했으므로
  // 평소 목록은 품질과 무관하게 깨끗해야 한다. 켜둔 상태는 브라우저에 남긴다.
  const [checkMode, setCheckMode] = useState(false);
  useEffect(() => {
    if (!isMaster) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 SSR에서 읽을 수 없어 마운트 후 동기화가 불가피함
      setCheckMode(localStorage.getItem(CHECK_MODE_KEY) === "1");
    } catch {
      /* 저장 불가 환경 */
    }
  }, [isMaster]);
  function toggleCheckMode() {
    setCheckMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(CHECK_MODE_KEY, next ? "1" : "0");
      } catch {
        /* 저장 불가 환경 */
      }
      return next;
    });
  }
  const showQuality = isMaster && checkMode;

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
    (t) => selected.has(t.id) && quality[t.id] && !openRequestSet.has(t.id),
  );

  // 발송 버튼은 건을 골라야 나타난다. 고르기 전에도 미달이 있다는 사실은 보여야 하므로
  // 목록 위에 상시 안내 줄을 둔다.
  const flaggedTickets = filteredTickets.filter((t) => quality[t.id]);
  const sendableFlagged = flaggedTickets.filter((t) => !openRequestSet.has(t.id));

  // 선택한 건 중 대기 중인 수정 요청이 걸린 것. 품질 점검을 켜지 않아도 마스터는 취소할 수 있어야 한다.
  const cancelTargets = filteredTickets.filter(
    (t) => selected.has(t.id) && openRequestSet.has(t.id),
  );

  function selectFlagged() {
    setSelected(new Set(sendableFlagged.map((t) => t.id)));
  }

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
    if (result.skipped.tooOld > 0) reasons.push(`30일 지남 ${result.skipped.tooOld}건`);
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

  async function confirmCancelRevisions() {
    setCancelingRevision(true);
    const result = await cancelTicketRevisionsForTickets(
      cancelTargets.map((t) => t.id),
      "",
    );
    setCancelingRevision(false);
    setCancelConfirmOpen(false);
    if (result.error) {
      toast.error(`수정 요청 취소 실패: ${result.error}`);
      return;
    }
    if (result.warning) toast.error(result.warning);
    else toast.success(`${result.canceled}건의 수정 요청을 취소했습니다.`);
    setSelected(new Set());
    startTransition(() => router.refresh());
  }

  async function confirmCancelAll() {
    setCancelingAll(true);
    const result = await cancelAllOpenTicketRevisions("");
    setCancelingAll(false);
    setCancelAllConfirmOpen(false);
    if (result.error) {
      toast.error(`수정 요청 전체 취소 실패: ${result.error}`);
      return;
    }
    if (result.warning) toast.error(result.warning);
    else toast.success(`대기 중이던 수정 요청 ${result.canceled}건을 모두 취소했습니다.`);
    setSelected(new Set());
    startTransition(() => router.refresh());
  }

  // 전체 검토: 페이지 범위가 아니라 해결 절차가 있는 전체 건을 판정해 미달 건을 한 번에 보낸다.
  // 판정과 대기 중 요청 여부는 CSV 내보내기와 같은 조회(fetchExportTargets)를 그대로 쓴다.
  async function openReviewAll() {
    setReviewAllLoading(true);
    const result = await fetchExportTargets(true);
    setReviewAllLoading(false);
    if (result.error) {
      toast.error(`전체 검토 실패: ${result.error}`);
      return;
    }
    const inquiryById = new Map(result.rows.map((row) => [row.id, row.inquiry]));
    const targets = result.quality
      .filter((q) => q.issues.length > 0 && q.hasAssignee && !q.hasOpenRequest)
      .map((q) => ({
        id: q.id,
        label: inquiryById.get(q.id) || "(제목 없음)",
        detail: q.issues.map((issue) => issue.label).join(" · "),
      }));
    if (targets.length === 0) {
      toast.success("보낼 미달 건이 없습니다. 이미 요청 중이거나 담당자가 없는 건은 제외됩니다.");
      return;
    }
    setReviewAllTargets(targets);
    setReviewAllConfirmOpen(true);
  }

  async function confirmReviewAll() {
    setReviewAllSending(true);
    let sent = 0;
    let tooOld = 0;
    let errorMessage: string | null = null;
    for (let i = 0; i < reviewAllTargets.length; i += 200) {
      const ids = reviewAllTargets.slice(i, i + 200).map((t) => t.id);
      const result = await requestTicketRevisionsBulk(ids);
      sent += result.sent;
      tooOld += result.skipped.tooOld;
      if (result.error) {
        errorMessage = result.error;
        break;
      }
    }
    setReviewAllSending(false);
    setReviewAllConfirmOpen(false);
    if (errorMessage) {
      toast.error(`수정 요청 발송 실패: ${errorMessage}${sent ? ` (${sent}건은 발송됨)` : ""}`);
    } else {
      toast.success(
        `${sent}건에 수정 요청을 보냈습니다.${tooOld ? ` 30일 지난 ${tooOld}건은 제외했습니다.` : ""}`,
      );
    }
    setReviewAllTargets([]);
    setSelected(new Set());
    startTransition(() => router.refresh());
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {}
      <div className="px-6 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="가맹점명, 제목, 담당 기사로 검색"
              className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {isMaster && (
            <button
              type="button"
              onClick={openReviewAll}
              disabled={reviewAllLoading}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
            >
              <AlertTriangle size={13} />
              {reviewAllLoading ? "검토 중..." : "전체 검토"}
            </button>
          )}
          {isMaster && openRequestTotal > 0 && (
            <button
              type="button"
              onClick={() => setCancelAllConfirmOpen(true)}
              disabled={cancelingAll}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              수정 요청 전체 취소 {openRequestTotal}건
            </button>
          )}
          {isMaster && (
            <button
              type="button"
              onClick={toggleCheckMode}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                checkMode
                  ? "border-amber-300 bg-amber-50 text-amber-700"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              <AlertTriangle size={13} />
              품질 점검 {checkMode ? "켜짐" : "꺼짐"}
            </button>
          )}
        </div>
      </div>

      {showQuality && flaggedTickets.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-amber-100 bg-amber-50 px-6 py-2.5">
          <AlertTriangle size={14} className="flex-shrink-0 text-amber-600" />
          <span className="text-xs font-semibold text-amber-800">
            이 페이지에 품질 미달 {flaggedTickets.length}건
          </span>
          {isMaster && sendableFlagged.length > 0 && (
            <button
              type="button"
              onClick={selectFlagged}
              className="ml-auto rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100"
            >
              미달 {sendableFlagged.length}건 모두 선택
            </button>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <BulkDeleteActions
          count={selected.size}
          deleting={deleting}
          onDelete={handleDelete}
          onCancel={() => setSelected(new Set())}
        >
          {isMaster && cancelTargets.length > 0 && (
            <button
              type="button"
              onClick={() => setCancelConfirmOpen(true)}
              disabled={cancelingRevision}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              수정 요청 취소 {cancelTargets.length}건
            </button>
          )}
          {showQuality && revisionTargets.length > 0 && (
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
                  {showQuality && quality[ticket.id] && (
                    <span title={quality[ticket.id].issues.map((i) => i.label).join(", ")}>
                      <Badge colorClass="bg-amber-100 text-amber-800">
                        {`품질 미달 ${quality[ticket.id].issues.length}`}
                      </Badge>
                    </span>
                  )}
                  {isMaster && openRequestSet.has(ticket.id) && (
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

      <BulkConfirmDialog
        open={cancelConfirmOpen}
        title="수정 요청 취소"
        subtitle="선택한 건에 걸린 대기 중 수정 요청을 취소하고 담당자에게 알림을 보냅니다."
        busy={cancelingRevision}
        confirmText="취소하기"
        confirmColor="blue"
        confirmQuestion="선택한 건의 수정 요청을 취소합니다."
        items={cancelTargets.map((t) => ({ id: t.id, label: t.title }))}
        onCancel={() => setCancelConfirmOpen(false)}
        onConfirm={confirmCancelRevisions}
      />

      <BulkConfirmDialog
        open={cancelAllConfirmOpen}
        title="수정 요청 전체 취소"
        subtitle="이 페이지뿐 아니라 대기 중인 수정 요청 전부를 취소하고 담당자에게 알림을 보냅니다."
        busy={cancelingAll}
        confirmText="전체 취소"
        confirmColor="red"
        confirmQuestion={`대기 중인 수정 요청 ${openRequestTotal}건을 모두 취소합니다.`}
        items={[{ id: "all", label: `대기 중인 수정 요청 ${openRequestTotal}건 전체` }]}
        onCancel={() => setCancelAllConfirmOpen(false)}
        onConfirm={confirmCancelAll}
      />

      <BulkConfirmDialog
        open={reviewAllConfirmOpen}
        title="전체 검토 · 수정 요청 보내기"
        subtitle="해결 절차가 있는 전체 건을 점검했습니다. 사유는 각 건의 점검 결과로 자동 작성되고 담당자에게 알림이 갑니다."
        busy={reviewAllSending}
        confirmText={`${reviewAllTargets.length}건 보내기`}
        confirmColor="blue"
        confirmQuestion={`미달 ${reviewAllTargets.length}건의 담당자에게 수정 요청을 보냅니다.`}
        items={reviewAllTargets}
        onCancel={() => setReviewAllConfirmOpen(false)}
        onConfirm={confirmReviewAll}
      />
    </div>
  );
}
