"use client";

import { useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Loader2, MessageSquarePlus, X } from "lucide-react";
import {
  addInstallationPostHistory,
  getInstallationPostHistory,
  type InstallationPostHistoryRecord,
} from "@/app/(app)/installs/actions";
import { useToast } from "@/components/ui/Toast";

interface Props {
  installationId: string;
  title: string;
  onClose: () => void;
}

function creatorName(creator: InstallationPostHistoryRecord["creator"]) {
  return Array.isArray(creator)
    ? (creator[0]?.name ?? "알 수 없음")
    : (creator?.name ?? "알 수 없음");
}

export default function InstallationPostHistoryPanel({ installationId, title, onClose }: Props) {
  const toast = useToast();
  const [history, setHistory] = useState<InstallationPostHistoryRecord[]>([]);
  const [available, setAvailable] = useState(true);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getInstallationPostHistory(installationId).then((result) => {
      if (cancelled) return;
      setHistory(result.data);
      setAvailable(result.available);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [installationId]);

  function addMemo() {
    const trimmed = content.trim();
    if (!trimmed || isPending || !available) return;
    startTransition(async () => {
      const result = await addInstallationPostHistory({ installationId, content: trimmed });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.skipped) {
        setAvailable(false);
        return;
      }
      if (result.history) setHistory((previous) => [result.history!, ...previous]);
      setContent("");
      toast.success("완료 이후 메모를 추가했습니다.");
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <section className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <MessageSquarePlus size={16} className="text-blue-600" />
              완료 이후 메모
            </p>
            <p className="mt-1 text-xs text-slate-500">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!available && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-700">
              설치 후 히스토리 테이블이 아직 적용되지 않아 메모를 사용할 수 없습니다. 담당자가
              `supabase/100_installation_post_history.sql`을 검토 후 적용하면 활성화됩니다.
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-slate-400">
              <Loader2 size={16} className="mr-2 animate-spin" /> 불러오는 중...
            </div>
          ) : history.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">등록된 메모가 없습니다.</p>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {history.map((item) => (
                <article key={item.id} className="px-3.5 py-3">
                  <div className="mb-1 flex items-center justify-between gap-3 text-[11px] text-slate-400">
                    <span>{creatorName(item.creator)}</span>
                    <time dateTime={item.created_at}>
                      {format(new Date(item.created_at), "yyyy.M.d HH:mm", { locale: ko })}
                    </time>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {item.content}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>

        <footer className="border-t border-slate-100 px-5 py-4">
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            disabled={!available || isPending}
            rows={3}
            maxLength={2000}
            placeholder="설치·배송 완료 이후의 후속 메모를 입력하세요."
            className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">{content.length}/2,000</span>
            <button
              type="button"
              onClick={addMemo}
              disabled={!available || !content.trim() || isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending && <Loader2 size={14} className="animate-spin" />}
              메모 추가
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
