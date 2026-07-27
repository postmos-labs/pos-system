"use client";

import { useState } from "react";
import { Pin, Trash2, X } from "lucide-react";
import HistoryIcon from "@/components/ui/HistoryIcon";
import type { FranchiseApplication, FranchiseApplicationMemo } from "@/types";
import { APPLICANT_TYPE_LABEL } from "@/types";

interface Props {
  row: FranchiseApplication;
  entries: FranchiseApplicationMemo[] | undefined;
  onClose: () => void;
  onAdd: (content: string) => void | Promise<void>;
  onTogglePin: (memo: FranchiseApplicationMemo) => void | Promise<void>;
  onDelete: (memo: FranchiseApplicationMemo) => void | Promise<void>;
}

function formatEntryDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("ko-KR");
}

export default function FranchiseMemoDrawer({
  row,
  entries,
  onClose,
  onAdd,
  onTogglePin,
  onDelete,
}: Props) {
  const [draft, setDraft] = useState("");
  const sortedEntries = [...(entries ?? [])].sort((a, b) => {
    const aPinned = !!a.pinned_at;
    const bPinned = !!b.pinned_at;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    if (aPinned && bPinned) {
      return new Date(b.pinned_at ?? b.created_at).getTime() - new Date(a.pinned_at ?? a.created_at).getTime();
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  function submit() {
    const content = draft.trim();
    if (!content) return;
    void onAdd(content);
    setDraft("");
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[36rem] max-w-[calc(100vw-3rem)] h-[85vh] max-h-[85vh] flex flex-col bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
        <p className="flex items-center gap-2 text-base font-semibold min-w-0">
          <HistoryIcon size={32} />
          <span className="truncate">
            히스토리 · {row.business_name || row.owner_name || "-"}
            <span className="text-slate-400 font-normal text-sm ml-2">
              {row.owner_name || "-"} · {APPLICANT_TYPE_LABEL[row.applicant_type]} ·{" "}
              {row.phone || "-"}
            </span>
          </span>
        </p>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded transition-colors shrink-0"
          aria-label="닫기"
        >
          <X size={20} />
        </button>
      </div>
      <div className="px-5 py-4 border-b border-slate-700">
        <label className="text-xs font-semibold text-slate-400">새 히스토리 추가</label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submit}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="새 히스토리 입력..."
          rows={2}
          className="w-full mt-1 bg-slate-800 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-2 py-1.5 text-sm resize-y text-white"
        />
      </div>
      <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">
        {entries === undefined ? (
          <p className="text-[15pt] text-slate-400">불러오는 중...</p>
        ) : sortedEntries.length === 0 ? (
          <p className="text-[15pt] text-slate-400">이력이 없습니다.</p>
        ) : (
          <ul className="space-y-2.5">
            {sortedEntries.map((entry) => {
              const pinned = !!entry.pinned_at;
              return (
                <li
                  key={entry.id}
                  className={`text-[15pt] group ${pinned ? "text-amber-200" : "text-slate-200"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-slate-400">
                      {formatEntryDate(entry.created_at)}
                      {" · "}
                      <span className="font-semibold text-blue-300">
                        {entry.user?.name || entry.author_name || "-"}
                      </span>
                    </div>
                    <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onTogglePin(entry)}
                        aria-label={pinned ? "고정 해제" : "상단 고정"}
                        className={
                          pinned
                            ? "text-amber-300 hover:text-amber-200"
                            : "text-slate-500 hover:text-amber-300"
                        }
                      >
                        <Pin size={14} className={pinned ? "fill-current" : ""} />
                      </button>
                      <button
                        onClick={() => onDelete(entry)}
                        aria-label="히스토리 삭제"
                        className="text-slate-500 hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="whitespace-pre-wrap break-words">{entry.content}</div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
