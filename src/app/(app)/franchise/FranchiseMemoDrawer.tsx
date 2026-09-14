"use client";

import { useState } from "react";
import { Pin, Trash2, X } from "lucide-react";
import HistoryIcon from "@/components/ui/HistoryIcon";
import { formatKst } from "@/lib/date";
import type { FranchiseApplication } from "@/types";
import { APPLICANT_TYPE_LABEL } from "@/types";

export interface FranchiseMemoEntry {
  index: number;
  at: string;
  user: string;
  text: string;
  pinned: boolean;
  pinnedAt: string | null;
}

interface Props {
  row: FranchiseApplication;
  entries: FranchiseMemoEntry[];
  onClose: () => void;
  onAdd: (content: string) => void | Promise<void>;
  onTogglePin: (index: number) => void | Promise<void>;
  onDelete: (index: number) => void | Promise<void>;
}

function formatEntryDate(value: string) {
  return formatKst(value);
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
  const sortedEntries = [...entries].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.pinned && b.pinned) {
      return new Date(b.pinnedAt ?? b.at).getTime() - new Date(a.pinnedAt ?? a.at).getTime();
    }
    return new Date(b.at).getTime() - new Date(a.at).getTime();
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
        {sortedEntries.length === 0 ? (
          <p className="text-[15pt] text-slate-400">이력이 없습니다.</p>
        ) : (
          <ul className="space-y-2.5">
            {sortedEntries.map((entry) => (
              <li
                key={`${entry.index}-${entry.at}`}
                className={`text-[15pt] group ${entry.pinned ? "text-amber-200" : "text-slate-200"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-slate-400">
                    {formatEntryDate(entry.at)}
                    {" · "}
                    <span className="font-semibold text-blue-300">{entry.user || "-"}</span>
                  </div>
                  <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onTogglePin(entry.index)}
                      aria-label={entry.pinned ? "고정 해제" : "상단 고정"}
                      className={
                        entry.pinned
                          ? "text-amber-300 hover:text-amber-200"
                          : "text-slate-500 hover:text-amber-300"
                      }
                    >
                      <Pin size={14} className={entry.pinned ? "fill-current" : ""} />
                    </button>
                    <button
                      onClick={() => onDelete(entry.index)}
                      aria-label="히스토리 삭제"
                      className="text-slate-500 hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="whitespace-pre-wrap break-words">{entry.text}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
