"use client";

import { useEffect, useState } from "react";
import { X, Trash2 } from "lucide-react";
import HistoryIcon from "./HistoryIcon";
import { createClient } from "@/lib/supabase/client";
import {
  INSTALLATION_DELIVERY_TYPE_LABEL,
  isInstallationDeliveryType,
} from "@/lib/installationDeliveryType";
import {
  FRANCHISE_ALIMTALK_LOG_LABEL,
  FRANCHISE_INSTALL_LOG_LABEL,
  FRANCHISE_TRANSFER_LOG_LABEL,
} from "@/types";

type NotificationLog = {
  id: string;
  template_key: string;
  status: string;
  error: string | null;
  created_at: string;
  user_name: string | null;
  user: { name: string } | null;
};

type FranchiseLog = {
  id: string;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
  user_name: string | null;
  user: { name: string } | null;
  details: { delivery_type?: string } | null;
};

// 스탬프(`[이름 YYYY. MM. DD. HH:mm]`, 연도 도입 전 옛 형식은 `[이름 MM. DD. HH:mm]`)가 붙은 항목뿐
// 아니라, 스탬프 도입 전에 저장된 맨 텍스트도 하나의 항목으로 살려서 반환한다
const MEMO_STAMP_RE = /\[(.+?) (?:(\d{4})\. )?(\d{2})\. (\d{2})\. (\d{2}):(\d{2})\]/g;

// 옛 형식(연도 없음) 스탬프의 연도를 추정한다. 일단 올해로 채워보고, 그 결과가 오늘보다
// 미래면 작년으로 본다 (예: 작년 12월에 쓴 메모를 올해 1월에 볼 때 올해 12월로 잘못 읽히는 것을 방지).
function resolveLegacyYear(month: number, day: number, hour: number, minute: number): number {
  const now = new Date();
  const guess = new Date(now.getFullYear(), month - 1, day, hour, minute);
  return guess.getTime() > now.getTime() ? now.getFullYear() - 1 : now.getFullYear();
}

export function parseMemoEntries(
  memo: string | undefined | null,
  fallbackAt: string,
): { at: string; user: string; text: string }[] {
  if (!memo?.trim()) return [];
  const re = MEMO_STAMP_RE;
  const matches = [...memo.matchAll(re)];
  if (matches.length === 0) {
    return [{ at: fallbackAt, user: "-", text: memo.trim() }];
  }
  const entries: { at: string; user: string; text: string }[] = [];
  const leading = memo.slice(0, matches[0].index).trim();
  if (leading) entries.push({ at: fallbackAt, user: "-", text: leading });
  matches.forEach((m, i) => {
    const [, user, yearStr, month, day, hour, minute] = m;
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : memo.length;
    const text = memo.slice(start, end).trim();
    if (!text) return;
    const year = yearStr
      ? Number(yearStr)
      : resolveLegacyYear(Number(month), Number(day), Number(hour), Number(minute));
    const at = new Date(
      year,
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    ).toISOString();
    entries.push({ at, user, text });
  });
  return entries;
}

// parseMemoEntries와 동일한 순서로 원본 텍스트(스탬프 포함)를 블록 단위로 쪼갠다.
// 특정 인덱스를 제외하고 다시 합치면 해당 메모 항목만 삭제된 원본 메모 문자열을 얻을 수 있다.
function splitMemoBlocks(memo: string | undefined | null): string[] {
  if (!memo?.trim()) return [];
  const re = MEMO_STAMP_RE;
  const matches = [...memo.matchAll(re)];
  if (matches.length === 0) return [memo.trim()];
  const blocks: string[] = [];
  const leading = memo.slice(0, matches[0].index).trim();
  if (leading) blocks.push(leading);
  matches.forEach((m, i) => {
    const start = m.index!;
    const end = i + 1 < matches.length ? matches[i + 1].index! : memo.length;
    const block = memo.slice(start, end).trim();
    if (block) blocks.push(block);
  });
  return blocks;
}

export function removeMemoEntry(memo: string | undefined | null, index: number): string {
  const blocks = splitMemoBlocks(memo);
  return blocks.filter((_, i) => i !== index).join("\n");
}

interface Props {
  title: string;
  memo: string | undefined | null;
  createdAt: string;
  onAddMemo: (value: string) => void;
  onDeleteMemo?: (newMemo: string) => void;
  onClose: () => void;
  entityType?: string;
  entityId?: string;
  labelMap?: Record<string, string>;
  franchiseApplicationId?: string;
  franchiseStatusLabelMap?: Record<string, string>;
}

export default function MemoHistoryPanel({
  title,
  memo,
  createdAt,
  onAddMemo,
  onDeleteMemo,
  onClose,
  entityType,
  entityId,
  labelMap,
  franchiseApplicationId,
  franchiseStatusLabelMap,
}: Props) {
  const [value, setValue] = useState("");
  const [notifLogs, setNotifLogs] = useState<NotificationLog[]>([]);
  const [franchiseLogs, setFranchiseLogs] = useState<FranchiseLog[]>([]);

  useEffect(() => {
    if (!entityType || !entityId) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("notification_logs")
      .select("id, template_key, status, error, created_at, user_name, user:profiles(name)")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setNotifLogs((data as unknown as NotificationLog[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  useEffect(() => {
    if (!franchiseApplicationId) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("franchise_application_logs")
      .select("id, from_status, to_status, details, created_at, user_name, user:profiles(name)")
      .eq("franchise_application_id", franchiseApplicationId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setFranchiseLogs((data as unknown as FranchiseLog[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [franchiseApplicationId]);

  function deleteMemoEntry(index: number) {
    if (!onDeleteMemo) return;
    if (!confirm("이 메모를 삭제하시겠습니까?")) return;
    onDeleteMemo(removeMemoEntry(memo, index));
  }

  const timeline = [
    ...parseMemoEntries(memo, createdAt).map((entry, i) => ({
      at: entry.at,
      node: (
        <li key={`memo-${entry.at}-${entry.text}`} className="text-[15pt] text-slate-200 group">
          <div className="flex items-start justify-between gap-2">
            <div className="text-slate-400">
              {new Date(entry.at).toLocaleString("ko-KR")}
              {" · "}
              <span className="font-semibold text-blue-300">{entry.user}</span>
            </div>
            {onDeleteMemo && (
              <button
                onClick={() => deleteMemoEntry(i)}
                aria-label="메모 삭제"
                className="shrink-0 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
          <div>{entry.text}</div>
        </li>
      ),
    })),
    ...notifLogs.map((log) => ({
      at: log.created_at,
      node: (
        <li key={`notif-${log.id}`} className="text-[15pt] text-blue-400">
          <div className="text-slate-400">
            {new Date(log.created_at).toLocaleString("ko-KR")}
            {" · "}
            <span className="font-semibold text-blue-300">
              {log.user_name ?? log.user?.name ?? "알수없음"}
            </span>
          </div>
          <div>
            알림톡 발송 ({labelMap?.[log.template_key] ?? log.template_key})
            {log.status === "failed" ? ` (실패${log.error ? `: ${log.error}` : ""})` : ""}
          </div>
        </li>
      ),
    })),
    ...franchiseLogs.map((log) => {
      const actor = (
        <span className="font-semibold text-blue-300">
          {log.user_name ?? log.user?.name ?? "알수없음"}
        </span>
      );
      const isAlimtalk = log.to_status?.startsWith("alimtalk:");
      if (isAlimtalk) {
        const key = log.to_status!.replace("alimtalk:", "");
        return {
          at: log.created_at,
          node: (
            <li key={`franchise-${log.id}`} className="text-[15pt] text-blue-400">
              <div className="text-slate-400">
                {new Date(log.created_at).toLocaleString("ko-KR")} · {actor}
              </div>
              <div>알림톡 발송 ({FRANCHISE_ALIMTALK_LOG_LABEL[key] ?? key})</div>
            </li>
          ),
        };
      }
      const installLabel = log.to_status ? FRANCHISE_INSTALL_LOG_LABEL[log.to_status] : undefined;
      const transferLabel = log.to_status ? FRANCHISE_TRANSFER_LOG_LABEL[log.to_status] : undefined;
      if (installLabel || transferLabel) {
        return {
          at: log.created_at,
          node: (
            <li
              key={`franchise-${log.id}`}
              className={`text-[15pt] font-medium ${installLabel ? "text-purple-400" : "text-amber-400"}`}
            >
              <div className="text-slate-400 font-normal">
                {new Date(log.created_at).toLocaleString("ko-KR")} · {actor}
              </div>
              <div>{installLabel ?? transferLabel}</div>
            </li>
          ),
        };
      }
      return {
        at: log.created_at,
        node: (
          <li key={`franchise-${log.id}`} className="text-[15pt] text-purple-300">
            <div className="text-slate-400">
              {new Date(log.created_at).toLocaleString("ko-KR")}
              {" · "}
              {actor}
              {" · 가맹접수"}
            </div>
            <div>
              {log.from_status ? (franchiseStatusLabelMap?.[log.from_status] ?? "기타") : "-"} →{" "}
              {log.to_status ? (franchiseStatusLabelMap?.[log.to_status] ?? "기타") : "-"}
              {log.details?.delivery_type && isInstallationDeliveryType(log.details.delivery_type)
                ? ` · 구분: ${INSTALLATION_DELIVERY_TYPE_LABEL[log.details.delivery_type]}`
                : ""}
            </div>
          </li>
        ),
      };
    }),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  function submit() {
    if (!value.trim()) return;
    onAddMemo(value);
    setValue("");
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[36rem] max-w-[calc(100vw-3rem)] h-[85vh] max-h-[85vh] flex flex-col bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
        <p className="flex items-center gap-2 text-base font-semibold">
          <HistoryIcon size={32} />
          히스토리 · {title}
        </p>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded transition-colors"
          aria-label="닫기"
        >
          <X size={20} />
        </button>
      </div>
      <div className="px-5 py-4 border-b border-slate-700">
        <label className="text-xs font-semibold text-slate-400">새 메모 추가</label>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={submit}
          placeholder="새 메모 입력..."
          rows={2}
          className="w-full mt-1 bg-slate-800 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-2 py-1.5 text-sm resize-y text-white"
        />
      </div>
      <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">
        {timeline.length === 0 ? (
          <p className="text-[15pt] text-slate-400">이력이 없습니다.</p>
        ) : (
          <ul className="space-y-2.5">{timeline.map((entry) => entry.node)}</ul>
        )}
      </div>
    </div>
  );
}
