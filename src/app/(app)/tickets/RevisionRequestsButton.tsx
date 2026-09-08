"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClipboardList, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { fetchRevisionRows, resolveTicketRevision } from "./actions";
import type { RevisionRow } from "./revisions/RevisionsClient";
import type { RevisionStatusFilter } from "./revisionRows";

const TABS: { key: RevisionStatusFilter; label: (openCount: number) => string }[] = [
  { key: "open", label: (n) => `대기 ${n}` },
  { key: "resolved", label: () => "완료" },
  { key: "canceled", label: () => "취소" },
  { key: "all", label: () => "전체" },
];

// KST 기준 M/d HH:mm — revisions/RevisionsClient.tsx의 포맷과 동일하게 맞춘다.
const DATETIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDateTime(value: string) {
  const parts = DATETIME_FORMATTER.formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = get("hour").padStart(2, "0").replace("24", "00");
  return `${get("month")}/${get("day")} ${hour}:${get("minute")}`;
}

export default function RevisionRequestsButton({ openCount }: { openCount: number }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<RevisionStatusFilter>("open");
  const [loading, setLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [rows, setRows] = useState<RevisionRow[]>([]);
  const [schemaReady, setSchemaReady] = useState(true);
  const [count, setCount] = useState(openCount);

  useEffect(() => {
    if (!open) return;
    void load(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, status]);

  async function load(nextStatus: RevisionStatusFilter) {
    setLoading(true);
    const result = await fetchRevisionRows(nextStatus);
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setRows(result.rows);
    setSchemaReady(result.schemaReady);
    setCount(result.openCount);
  }

  async function handleResolve(row: RevisionRow) {
    setResolvingId(row.id);
    const result = await resolveTicketRevision(row.id, "");
    setResolvingId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("확인 처리했습니다.");
    await load(status);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm text-slate-500 px-3 py-2.5 rounded-xl hover:bg-slate-100 transition-colors font-medium"
      >
        <ClipboardList size={14} />
        수정 요청 내역{count > 0 ? ` ${count}` : ""}
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4">
          <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
              <p className="text-base font-bold text-slate-900">수정 요청 내역</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="닫기">
                <X size={18} className="text-slate-400 hover:text-slate-600" />
              </button>
            </div>

            <div className="flex flex-shrink-0 gap-1 border-b border-slate-100 px-5 pt-3">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatus(tab.key)}
                  className={`rounded-t-lg px-3 py-2 text-sm font-semibold transition-colors ${
                    status === tab.key
                      ? "border-b-2 border-blue-600 text-blue-700"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab.label(count)}
                </button>
              ))}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
              {!schemaReady && (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-700">
                  수정 요청 마이그레이션(supabase/139)이 아직 적용되지 않았습니다.
                </div>
              )}

              {loading ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
                  불러오는 중...
                </div>
              ) : rows.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
                  {status === "open"
                    ? "대기 중인 수정 요청이 없습니다."
                    : status === "canceled"
                      ? "취소한 요청이 없습니다."
                      : "표시할 요청이 없습니다."}
                </div>
              ) : (
                rows.map((row) => (
                  <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/tickets/${row.ticket_id}`}
                        className="text-sm font-semibold text-blue-600 hover:underline"
                      >
                        {row.ticket_title ?? "제목 없음"}
                      </Link>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.status === "open"
                            ? "bg-amber-100 text-amber-700"
                            : row.status === "resolved"
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {row.status === "open"
                          ? "대기"
                          : row.status === "resolved"
                            ? "완료"
                            : "취소"}
                      </span>
                    </div>

                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">
                      {row.message}
                    </p>

                    {row.status === "open" && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {row.edited_at ? (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                            수정됨 {formatDateTime(row.edited_at)}
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                            아직 안 고침
                          </span>
                        )}
                        {row.current_quality === "pass" && (
                          <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                            지금 통과
                          </span>
                        )}
                        {row.current_quality === "fail" && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                            지금 미달 {row.current_issue_labels.length} ·{" "}
                            {row.current_issue_labels.join(" · ")}
                          </span>
                        )}
                        {row.current_quality === "empty" && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                            절차 없음
                          </span>
                        )}
                      </div>
                    )}

                    <p className="mt-2 text-xs text-slate-400">
                      {row.requested_by_name ?? "알 수 없음"} · {formatDateTime(row.requested_at)}
                    </p>

                    {row.status === "open" ? (
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleResolve(row)}
                          disabled={resolvingId === row.id}
                          className="rounded-lg border border-green-300 px-3 py-1.5 text-xs font-semibold text-green-700 transition-colors hover:bg-green-50 disabled:opacity-50"
                        >
                          {resolvingId === row.id ? "처리 중..." : "확인 완료"}
                        </button>
                      </div>
                    ) : row.status === "resolved" ? (
                      <div className="mt-2 text-xs text-slate-400">
                        {row.resolved_by_name ?? "알 수 없음"} ·{" "}
                        {row.resolved_at ? formatDateTime(row.resolved_at) : ""} 확인
                        {row.resolved_note && <span> · {row.resolved_note}</span>}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-slate-400">
                        {row.canceled_by_name ?? "알 수 없음"} ·{" "}
                        {row.canceled_at ? formatDateTime(row.canceled_at) : ""} 취소
                        {row.canceled_note && <span> · {row.canceled_note}</span>}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex flex-shrink-0 items-center justify-between border-t border-slate-100 px-5 py-3">
              <Link
                href="/tickets/revisions"
                className="text-sm font-semibold text-blue-600 hover:underline"
              >
                전체 화면에서 관리
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-50"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
