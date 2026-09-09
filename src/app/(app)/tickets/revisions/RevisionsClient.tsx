"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { resolveTicketRevision, cancelTicketRevision, cancelTicketRevisionsBulk } from "../actions";
import RevisionDiffModal from "./RevisionDiffModal";

export interface RevisionRow {
  id: string;
  ticket_id: string;
  ticket_title: string | null;
  message: string;
  status: "open" | "resolved" | "canceled";
  requested_by_name: string | null;
  requested_at: string;
  resolved_by_name: string | null;
  resolved_at: string | null;
  resolved_note: string | null;
  edited_at: string | null;
  current_quality: "pass" | "fail" | "empty";
  current_issue_labels: string[];
  canceled_by_name: string | null;
  canceled_at: string | null;
  canceled_note: string | null;
  before_title: string | null;
  before_steps: string | null;
  current_title: string | null;
  current_steps: string | null;
}

const TABS: {
  key: "open" | "resolved" | "canceled" | "all";
  label: (openCount: number) => string;
}[] = [
  { key: "open", label: (n) => `대기 ${n}` },
  { key: "resolved", label: () => "완료" },
  { key: "canceled", label: () => "취소" },
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

export function formatDateTime(value: string) {
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
  status: "open" | "resolved" | "canceled" | "all";
  openCount: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [target, setTarget] = useState<RevisionRow | null>(null);
  const [diffRow, setDiffRow] = useState<RevisionRow | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"resolve" | "cancel" | "cancelBulk">("resolve");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function changeTab(key: string) {
    setSelected(new Set());
    router.replace(`/tickets/revisions?status=${key}`);
  }

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openResolveModal(row: RevisionRow) {
    setNote("");
    setMode("resolve");
    setTarget(row);
  }

  function openCancelModal(row: RevisionRow) {
    setNote("");
    setMode("cancel");
    setTarget(row);
  }

  function openCancelBulkModal() {
    setNote("");
    setMode("cancelBulk");
    setTarget(rows.find((r) => selected.has(r.id)) ?? null);
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

  async function confirmCancel() {
    if (!target) return;
    setSaving(true);
    const result = await cancelTicketRevision(target.id, note);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.warning) toast.error(result.warning);
    else toast.success("취소했습니다.");
    setTarget(null);
    router.refresh();
  }

  async function confirmCancelBulk() {
    if (selected.size === 0) return;
    setSaving(true);
    const ids = [...selected];
    let canceled = 0;
    let notOpen = 0;
    let warning: string | undefined;
    let errorMessage: string | null = null;
    for (let i = 0; i < ids.length; i += 200) {
      const result = await cancelTicketRevisionsBulk(ids.slice(i, i + 200), note);
      canceled += result.canceled;
      notOpen += result.skipped.notOpen;
      if (result.warning && !warning) warning = result.warning;
      if (result.error) {
        errorMessage = result.error;
        break;
      }
    }
    setSaving(false);
    if (errorMessage) {
      toast.error(`${errorMessage}${canceled ? ` (${canceled}건은 취소됨)` : ""}`);
      return;
    }
    const skippedNote = notOpen > 0 ? ` 이미 처리된 ${notOpen}건은 건너뛰었습니다.` : "";
    if (warning) toast.error(warning);
    else toast.success(`${canceled}건을 취소했습니다.${skippedNote}`);
    setTarget(null);
    setSelected(new Set());
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

      {rows.length > 0 && status === "open" && (
        <div className="mb-2 flex items-center gap-3 px-1">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={toggleAll}
            className="h-4 w-4 cursor-pointer accent-blue-600"
          />
          <span className="text-xs font-medium text-slate-400">전체 선택</span>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          {status === "open"
            ? "대기 중인 수정 요청이 없습니다."
            : status === "canceled"
              ? "취소한 요청이 없습니다."
              : "표시할 요청이 없습니다."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  {row.status === "open" && (
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-blue-600"
                    />
                  )}
                  <Link
                    href={`/tickets/${row.ticket_id}`}
                    className="text-sm font-semibold text-blue-600 hover:underline"
                  >
                    {row.ticket_title ?? "제목 없음"}
                  </Link>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    row.status === "open"
                      ? "bg-amber-100 text-amber-700"
                      : row.status === "resolved"
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {row.status === "open" ? "대기" : row.status === "resolved" ? "완료" : "취소"}
                </span>
              </div>

              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{row.message}</p>

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
                <button
                  type="button"
                  onClick={() => setDiffRow(row)}
                  className="ml-2 font-semibold text-blue-600 hover:underline"
                >
                  변경 내용 보기
                </button>
              </p>

              {row.status === "open" ? (
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => openCancelModal(row)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => openResolveModal(row)}
                    className="rounded-lg border border-green-300 px-3 py-1.5 text-xs font-semibold text-green-700 transition-colors hover:bg-green-50"
                  >
                    확인 완료
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
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-lg">
          <span className="text-sm font-semibold text-blue-700">{selected.size}건 선택됨</span>
          <button
            type="button"
            onClick={openCancelBulkModal}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            선택 취소
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            선택 해제
          </button>
        </div>
      )}

      {target &&
        (() => {
          const modalTitle =
            mode === "resolve"
              ? "수정 요청 확인 완료"
              : mode === "cancelBulk"
                ? `수정 요청 ${selected.size}건 취소`
                : "수정 요청 취소";
          const modalDescription =
            mode === "resolve"
              ? "담당자가 고친 내용을 확인했으면 완료 처리합니다. 메모는 선택 입력입니다."
              : mode === "cancelBulk"
                ? "선택한 요청을 모두 취소하고 담당자마다 알림을 보냅니다. 사유는 선택 입력이며 전체에 같은 사유가 들어갑니다."
                : "담당자에게 취소 알림이 갑니다. 사유는 선택 입력입니다.";
          const placeholder = mode === "resolve" ? "확인 메모 (선택)" : "취소 사유 (선택)";
          const maxLength = mode === "resolve" ? 500 : 300;
          const confirmLabel =
            mode === "resolve"
              ? "확인 완료"
              : mode === "cancelBulk"
                ? `${selected.size}건 취소하기`
                : "취소하기";
          const confirmClassName =
            mode === "resolve"
              ? "rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
              : "rounded-lg bg-slate-700 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50";
          const onConfirm =
            mode === "resolve"
              ? confirmResolve
              : mode === "cancelBulk"
                ? confirmCancelBulk
                : confirmCancel;

          return (
            <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4">
              <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
                <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
                  <p className="text-base font-bold text-slate-900">{modalTitle}</p>
                  <button type="button" onClick={() => setTarget(null)} aria-label="닫기">
                    <X size={18} className="text-slate-400 hover:text-slate-600" />
                  </button>
                </div>

                {/* 본문에 min-h-0가 없으면 내용이 길어질 때 아래 버튼이 화면 밖으로 밀린다. */}
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
                  <p className="text-sm text-slate-500">{modalDescription}</p>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={5}
                    placeholder={placeholder}
                    className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-green-400"
                  />
                  <p className="text-right text-xs text-slate-400">
                    {note.trim().length}/{maxLength}
                  </p>
                </div>

                <div className="flex flex-shrink-0 justify-end gap-2 border-t border-slate-100 px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setTarget(null)}
                    className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-50"
                  >
                    닫기
                  </button>
                  <button
                    type="button"
                    onClick={onConfirm}
                    disabled={saving}
                    className={confirmClassName}
                  >
                    {saving ? "처리 중..." : confirmLabel}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {diffRow && <RevisionDiffModal row={diffRow} onClose={() => setDiffRow(null)} />}
    </>
  );
}
