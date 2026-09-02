"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import type { Profile } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { thumbUrl } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import BulkConfirmDialog from "@/components/ui/BulkConfirmDialog";
import HistoryButton from "@/components/ui/HistoryButton";
import MemoHistoryPanel from "@/components/ui/MemoHistoryPanel";

interface Install {
  id: string;
  customer_name: string;
  delivery_type?: string;
  // 승인이 끝나기 전 사진도 함께 보여주므로 상태를 구분해 표시한다.
  status?: string;
  completion_photo_urls: string[];
  notes?: string | null;
  created_at: string;
  assignee?: { name: string } | null;
}

interface Props {
  profile: Profile;
  installs: Install[];
}

const TABS = [
  ["all", "전체"],
  ["install", "설치"],
  ["as", "AS"],
] as const;

const STATUS_LABELS: Record<string, string> = {
  received: "접수",
  preparing: "제품준비",
  scheduled: "일정확정",
  in_transit: "이동중",
  delivery_sent: "택배발송",
  completed: "설치완료",
  rejected: "반려",
};

export default function PhotosClient({ profile, installs: initialInstalls }: Props) {
  const [installs, setInstalls] = useState(initialInstalls);
  const [tab, setTab] = useState<"all" | "install" | "as">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const supabase = createClient();
  const toast = useToast();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return installs.filter((i) => {
      if (tab !== "all" && (i.delivery_type ?? "install") !== tab) return false;
      if (q && !i.customer_name?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [installs, tab, search]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (filtered.length > 0 && filtered.every((i) => prev.has(i.id))) {
        const next = new Set(prev);
        filtered.forEach((i) => next.delete(i.id));
        return next;
      }
      return new Set([...prev, ...filtered.map((i) => i.id)]);
    });
  }

  function handleBulkDelete() {
    if (selected.size === 0) return;
    setBulkDeleteConfirmOpen(true);
  }

  async function saveNotes(id: string, notes: string, raw?: boolean) {
    const prev = installs.find((i) => i.id === id);
    const prevNotes = (prev?.notes ?? "").trim();
    let saveValue: string | null = notes || null;
    if (raw) {
      // 메모 삭제 등 이미 완성된 원본 텍스트를 그대로 저장할 때는 스탬프 로직을 건너뛴다
    } else if (notes && prevNotes) {
      if (notes.startsWith(prevNotes)) {
        const added = notes.slice(prevNotes.length).replace(/^\n+/, "");
        if (!added.trim()) {
          saveValue = prevNotes;
        } else {
          const stamp = `[${profile.name} ${new Date().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}]`;
          saveValue = `${prevNotes}\n${stamp} ${added}`;
        }
      }
    } else if (notes && !prevNotes) {
      const stamp = `[${profile.name} ${new Date().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}]`;
      saveValue = `${stamp} ${notes}`;
    }
    const { error } = await supabase
      .from("installations")
      .update({ notes: saveValue })
      .eq("id", id);
    if (error) {
      toast.error("저장 실패: " + error.message);
      return;
    }
    setInstalls((prev) => prev.map((i) => (i.id === id ? { ...i, notes: saveValue } : i)));
  }

  async function confirmBulkDelete() {
    setDeletingSelected(true);
    const ids = [...selected];
    const { error } = await supabase
      .from("installations")
      .update({ completion_photo_urls: [] })
      .in("id", ids);
    setDeletingSelected(false);
    setBulkDeleteConfirmOpen(false);
    if (error) {
      toast.error("삭제 실패: " + error.message);
      return;
    }
    setInstalls((prev) =>
      prev.map((i) => (selected.has(i.id) ? { ...i, completion_photo_urls: [] } : i)),
    );
    setSelected(new Set());
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">완료사진</h1>
        <p className="text-slate-500 text-sm mt-1">
          설치/AS 완료 시 등록된 사진 모음 (총 {installs.length}건)
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${tab === key ? "bg-white text-slate-900 shadow-sm ring-1 ring-black/5" : "text-slate-500 hover:text-slate-700"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {filtered.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-slate-500 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={filtered.every((i) => selected.has(i.id))}
                onChange={toggleAll}
                className="rounded border-slate-300"
              />
              전체선택
            </label>
          )}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="상호명 검색"
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
          />
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
          <span className="text-sm font-semibold text-blue-700">{selected.size}건 선택됨</span>
          <button
            onClick={handleBulkDelete}
            disabled={deletingSelected}
            className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50 ml-auto"
          >
            {deletingSelected ? "삭제 중..." : "선택 삭제"}
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400 text-sm">완료사진이 없습니다</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((inst) => (
            <div
              key={inst.id}
              className={`bg-white rounded-2xl border p-4 ${selected.has(inst.id) ? "border-blue-400 ring-1 ring-blue-200" : "border-slate-200"}`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(inst.id)}
                    onChange={() => toggleOne(inst.id)}
                    className="rounded border-slate-300 shrink-0"
                  />
                  <span className="font-semibold text-slate-900 break-words">
                    {inst.customer_name}
                  </span>
                  {inst.status && inst.status !== "completed" && (
                    <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      승인 대기
                    </span>
                  )}
                </label>
                <span
                  className={`text-xs font-medium rounded-lg border px-2 py-0.5 shrink-0 ${(inst.delivery_type ?? "install") === "as" ? "bg-purple-50 text-purple-600 border-purple-200" : "bg-blue-50 text-blue-600 border-blue-200"}`}
                >
                  {(inst.delivery_type ?? "install") === "as" ? "AS" : "설치"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                {inst.assignee?.name ?? "미배정"} ·{" "}
                {format(new Date(inst.created_at), "yyyy.M.d HH:mm", { locale: ko })}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {inst.completion_photo_urls.map((url, idx) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={`${inst.customer_name} ${idx + 1}.jpg`}
                  >
                    <img
                      src={thumbUrl(url, 240)}
                      alt={inst.customer_name}
                      className="w-full aspect-square object-cover rounded-lg border border-slate-200"
                    />
                  </a>
                ))}
              </div>
              <div className="flex justify-end mt-3">
                <HistoryButton onClick={() => setHistoryOpenId(inst.id)} size="small" />
              </div>
            </div>
          ))}
        </div>
      )}

      <BulkConfirmDialog
        open={bulkDeleteConfirmOpen}
        title="선택 사진 삭제"
        busy={deletingSelected}
        confirmText="삭제"
        confirmColor="red"
        items={installs
          .filter((i) => selected.has(i.id))
          .map((i) => ({ id: i.id, label: i.customer_name || i.id }))}
        onCancel={() => setBulkDeleteConfirmOpen(false)}
        onConfirm={confirmBulkDelete}
      />

      {historyOpenId &&
        (() => {
          const row = installs.find((i) => i.id === historyOpenId);
          if (!row) return null;
          return (
            <MemoHistoryPanel
              title={row.customer_name}
              memo={row.notes}
              createdAt={row.created_at}
              entityType="install"
              entityId={row.id}
              labelMap={STATUS_LABELS}
              onAddMemo={(value) =>
                saveNotes(
                  row.id,
                  `${(row.notes ?? "").trim()}${(row.notes ?? "").trim() ? "\n" : ""}${value}`,
                )
              }
              onDeleteMemo={(newMemo) => saveNotes(row.id, newMemo, true)}
              onClose={() => setHistoryOpenId(null)}
            />
          );
        })()}
    </div>
  );
}
