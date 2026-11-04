"use client";

import { useEffect, useState } from "react";
import { Pencil, Pin, Trash2, X } from "lucide-react";
import HistoryIcon from "@/components/ui/HistoryIcon";
import { formatKst } from "@/lib/date";
import { useApprovalNoteHistory } from "@/lib/useApprovalNoteHistory";
import { APPROVAL_NOTE_STAGE_LABEL, type ApprovalNote } from "@/lib/approvalNotes";
import { createClient } from "@/lib/supabase/client";
import { LinkedMemoItem, memoDedupeKey, parseMemoEntries } from "@/components/ui/MemoHistoryPanel";
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
  onEdit: (index: number, content: string) => void | Promise<void>;
}

function formatEntryDate(value: string) {
  return formatKst(value);
}

type TimelineItem =
  | {
      kind: "memo";
      at: string;
      pinned: boolean;
      pinnedAt: string | null;
      entry: FranchiseMemoEntry;
    }
  | { kind: "approval"; at: string; pinned: false; pinnedAt: null; note: ApprovalNote }
  | {
      kind: "linked";
      at: string;
      pinned: false;
      pinnedAt: null;
      key: string;
      user: string;
      text: string;
    };

export default function FranchiseMemoDrawer({
  row,
  entries,
  onClose,
  onAdd,
  onTogglePin,
  onDelete,
  onEdit,
}: Props) {
  const [draft, setDraft] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const approvalNotes = useApprovalNoteHistory(row.id);
  // 기술지원(설치·택배) 탭에서 쓴 설치건 히스토리도 같이 보여 준다. 보기 전용.
  const [installMemos, setInstallMemos] = useState<
    { id: string; notes: string | null; created_at: string }[]
  >([]);
  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("installations")
      .select("id, notes, created_at")
      .eq("franchise_application_id", row.id)
      .then(({ data }) => {
        if (!cancelled) setInstallMemos(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [row.id]);
  // 이관·연결 때 가맹접수 비고가 설치건 비고로 복사되므로, 이미 여기 있는 항목은 다시 보이지 않게 한다.
  const ownMemoKeys = new Set(entries.map((entry) => memoDedupeKey(entry.text)));
  const installItems: TimelineItem[] = installMemos.flatMap((install) =>
    parseMemoEntries(install.notes, install.created_at)
      .filter((entry) => !ownMemoKeys.has(memoDedupeKey(entry.text)))
      .map((entry, i): TimelineItem => ({
        kind: "linked",
        at: entry.at,
        pinned: false,
        pinnedAt: null,
        key: `${install.id}-${i}`,
        user: entry.user,
        text: entry.text,
      })),
  );
  const timelineItems: TimelineItem[] = [
    ...installItems,
    ...entries.map((entry): TimelineItem => ({
      kind: "memo",
      at: entry.at,
      pinned: entry.pinned,
      pinnedAt: entry.pinnedAt,
      entry,
    })),
    ...approvalNotes.map((note): TimelineItem => ({
      kind: "approval",
      at: note.created_at,
      pinned: false,
      pinnedAt: null,
      note,
    })),
  ];
  const sortedEntries = timelineItems.sort((a, b) => {
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

  function saveEdit(entry: FranchiseMemoEntry) {
    const next = editDraft.trim();
    if (next && next !== entry.text) void onEdit(entry.index, next);
    setEditingIndex(null);
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
            {sortedEntries.map((item) => {
              if (item.kind === "linked") {
                return (
                  <LinkedMemoItem
                    key={`install-memo-${item.key}`}
                    at={item.at}
                    user={item.user}
                    text={item.text}
                    source="기술지원"
                  />
                );
              }
              if (item.kind === "approval") {
                return (
                  <li key={`approval-note-${item.note.id}`} className="text-[15pt] text-amber-300">
                    <div className="text-slate-400">
                      {formatEntryDate(item.note.created_at)}
                      {" · "}
                      <span className="font-semibold text-blue-300">{item.note.author_name}</span>
                      {" · 이관승인 "}
                      {APPROVAL_NOTE_STAGE_LABEL[item.note.stage]}
                    </div>
                    <div className="whitespace-pre-wrap break-words">{item.note.content}</div>
                  </li>
                );
              }
              const entry = item.entry;
              return (
                <li
                  key={`${entry.index}-${entry.at}`}
                  className={`text-[15pt] group ${entry.pinned ? "text-amber-200" : "text-slate-200"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-slate-400">
                      {formatEntryDate(entry.at)}
                      {" · "}
                      <span className="font-semibold text-blue-300">{entry.user || "-"}</span>
                      {/* 고정한 항목은 날짜와 관계없이 맨 위에 온다 — 왜 위에 있는지 보이게 표시 */}
                      {entry.pinned && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-amber-900/60 px-1.5 py-0.5 text-xs font-semibold text-amber-300">
                          <Pin size={11} className="fill-current" />
                          고정
                        </span>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setEditingIndex(entry.index);
                          setEditDraft(entry.text);
                        }}
                        aria-label="히스토리 수정"
                        className="text-slate-500 hover:text-blue-300"
                      >
                        <Pencil size={14} />
                      </button>
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
                        onClick={() => {
                          setEditingIndex(null);
                          void onDelete(entry.index);
                        }}
                        aria-label="히스토리 삭제"
                        className="text-slate-500 hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {editingIndex === entry.index ? (
                    <div>
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            saveEdit(entry);
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            setEditingIndex(null);
                          }
                        }}
                        rows={3}
                        autoFocus
                        className="w-full mt-1 bg-slate-800 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-2 py-1.5 text-sm resize-y text-white"
                      />
                      <div className="mt-1 flex justify-end gap-1.5">
                        <button
                          onClick={() => saveEdit(entry)}
                          className="rounded bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-500"
                        >
                          저장
                        </button>
                        <button
                          onClick={() => setEditingIndex(null)}
                          className="rounded bg-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-600"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap break-words">{entry.text}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
