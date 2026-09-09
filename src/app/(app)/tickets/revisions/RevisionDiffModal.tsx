"use client";

import { X } from "lucide-react";
import { diffLines } from "@/lib/lineDiff";
import { formatDateTime, type RevisionRow } from "./RevisionsClient";

function DiffSection({
  title,
  before,
  after,
}: {
  title: string;
  before: string | null;
  after: string | null;
}) {
  if (before === null) {
    return (
      <div>
        <p className="mb-1.5 text-sm font-semibold text-slate-900">{title}</p>
        <p className="mb-2 text-xs text-slate-400">
          변경 전 기록 없음 (요청 당시 절차가 비어 있었거나 스냅샷 기능 이전에 보낸 요청입니다)
        </p>
        <div className="rounded-lg border border-slate-200 p-3 text-[13px] whitespace-pre-wrap text-slate-700">
          {after ?? ""}
        </div>
      </div>
    );
  }

  const lines = diffLines(before, after ?? "");
  const changed = lines.some((line) => line.kind !== "same");

  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-slate-900">{title}</p>
      {!changed && <p className="mb-1.5 text-xs text-slate-400">변경 없음</p>}
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {lines.map((line, idx) => (
          <div
            key={idx}
            className={`whitespace-pre-wrap px-2 py-1 text-[13px] ${
              line.kind === "removed"
                ? "bg-red-50 text-red-700 line-through"
                : line.kind === "added"
                  ? "bg-green-50 text-green-700"
                  : ""
            }`}
          >
            <span className="mr-1.5 inline-block w-3 select-none text-slate-400">
              {line.kind === "removed" ? "−" : line.kind === "added" ? "+" : " "}
            </span>
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RevisionDiffModal({
  row,
  onClose,
}: {
  row: RevisionRow;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4">
      <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
          <p className="text-base font-bold text-slate-900">변경 내용</p>
          <button type="button" onClick={onClose} aria-label="닫기">
            <X size={18} className="text-slate-400 hover:text-slate-600" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
            <span>
              요청 {row.requested_by_name ?? "알 수 없음"} · {formatDateTime(row.requested_at)}
            </span>
            {row.edited_at ? (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                수정됨 {formatDateTime(row.edited_at)}
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                아직 안 고침
              </span>
            )}
          </div>

          <div className="flex flex-col gap-5">
            <DiffSection title="문의 내용" before={row.before_title} after={row.current_title} />
            <DiffSection title="해결 절차" before={row.before_steps} after={row.current_steps} />
          </div>

          <details className="mt-5 rounded-lg border border-slate-200 p-3 text-sm">
            <summary className="cursor-pointer font-semibold text-slate-700">요청 사유</summary>
            <p className="mt-2 whitespace-pre-wrap text-slate-700">{row.message}</p>
          </details>
        </div>

        <div className="flex flex-shrink-0 justify-end border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-50"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
