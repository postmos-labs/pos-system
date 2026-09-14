"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { kstWallClock } from "@/lib/date";
import { STATUS_LABEL, type TicketStatus } from "@/types";
import { ArrowRight } from "lucide-react";

interface Log {
  id: string;
  from_status?: string;
  to_status?: string;
  message?: string;
  photo_urls?: string[];
  created_at: string;
  user?: { name: string };
}

const PAGE_SIZE = 20;

export default function TicketLogs({ logs }: { logs: Log[] }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (logs.length === 0) return null;

  const visibleLogs = logs.slice(0, visibleCount);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">작업 이력</h2>
      <div className="space-y-3">
        {visibleLogs.map((log) => (
          <div key={log.id} className="flex gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-2 flex-shrink-0" />
            <div className="flex-1">
              {log.from_status && log.to_status && (
                <div className="flex items-center gap-1.5 text-xs text-gray-600 flex-wrap">
                  <span>{STATUS_LABEL[log.from_status as TicketStatus] ?? log.from_status}</span>
                  <ArrowRight size={11} />
                  <span className="font-medium">
                    {STATUS_LABEL[log.to_status as TicketStatus] ?? log.to_status}
                  </span>
                </div>
              )}
              {log.message && <p className="text-xs text-gray-700 mt-0.5">{log.message}</p>}
              {log.photo_urls && log.photo_urls.length > 0 && (
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {log.photo_urls.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={url}
                        alt="설치완료사진"
                        loading="lazy"
                        className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                      />
                    </a>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-0.5">
                {log.user?.name} ·{" "}
                {format(kstWallClock(log.created_at), "M/d HH:mm", { locale: ko })}
              </p>
            </div>
          </div>
        ))}
      </div>
      {visibleCount < logs.length && (
        <button
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="w-full mt-3 py-2 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          더보기 ({logs.length - visibleCount}건 더 있음)
        </button>
      )}
    </div>
  );
}
