"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { resolveTicketRevision } from "../actions";

export interface RevisionRow {
  id: string;
  ticket_id: string;
  ticket_title: string | null;
  message: string;
  status: "open" | "resolved";
  requested_by_name: string | null;
  requested_at: string;
  resolved_by_name: string | null;
  resolved_at: string | null;
  resolved_note: string | null;
}

const TABS: { key: "open" | "resolved" | "all"; label: (openCount: number) => string }[] = [
  { key: "open", label: (n) => `대기 ${n}` },
  { key: "resolved", label: () => "완료" },
  { key: "all", label: () => "전체" },
];

// KST 기준 M/d HH:mm — 목록에서 날짜와 시각을 함께 봐야 한다.
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

export default function RevisionsClient({
  rows,
  status,
  openCount,
}: {
  rows: RevisionRow[];
  status: "open" | "resolved" | "all";
  openCount: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [target, setTarget] = useState<RevisionRow | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  function changeTab(key: string) {
    router.replace(`/tickets/revisions?status=${key}`);
  }

  function openResolveModal(row: RevisionRow) {
    setNote("");
    setTarget(row);
  }

  async function confirmResolve() {
    if (!target) return;
    setSaving(true);
    const result = await resolveTicketRevision(target.id, note);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("확인 처리했습니다.");
    setTarget(null);
    router.refresh();
  }

  return (
    <>
      <div className="mb-5 flex w-fit gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => changeTab(tab.key)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              status === tab.key
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-black/5"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label(openCount)}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          {status === "open" ? "대기 중인 수정 요청이 없습니다." : "표시할 요청이 없습니다."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
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
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {row.status === "open" ? "대기" : "완료"}
                </span>
              </div>

              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{row.message}</p>

              <p className="mt-2 text-xs text-slate-400">
                {row.requested_by_name ?? "알 수 없음"} · {formatDateTime(row.requested_at)}
              </p>

              {row.status === "open" ? (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => openResolveModal(row)}
                    className="rounded-lg border border-green-300 px-3 py-1.5 text-xs font-semibold text-green-700 transition-colors hover:bg-green-50"
                  >
                    확인 완료
                  </button>
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-400">
                  {row.resolved_by_name ?? "알 수 없음"} ·{" "}
                  {row.resolved_at ? formatDateTime(row.resolved_at) : ""} 확인
                  {row.resolved_note && <span> · {row.resolved_note}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {target && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4">
          <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
              <p className="text-base font-bold text-slate-900">수정 요청 확인 완료</p>
              <button type="button" onClick={() => setTarget(null)} aria-label="닫기">
                <X size={18} className="text-slate-400 hover:text-slate-600" />
              </button>
            </div>

            {/* 본문에 min-h-0가 없으면 내용이 길어질 때 아래 버튼이 화면 밖으로 밀린다. */}
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
              <p className="text-sm text-slate-500">
                담당자가 고친 내용을 확인했으면 완료 처리합니다. 메모는 선택 입력입니다.
              </p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={5}
                placeholder="확인 메모 (선택)"
                className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-green-400"
              />
              <p className="text-right text-xs text-slate-400">{note.trim().length}/500</p>
            </div>

            <div className="flex flex-shrink-0 justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setTarget(null)}
                className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmResolve}
                disabled={saving}
                className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? "처리 중..." : "확인 완료"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
