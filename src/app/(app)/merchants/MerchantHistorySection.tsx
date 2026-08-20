"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ExternalLink } from "lucide-react";
import type { WorkHistoryCategory, WorkHistoryItem } from "./merchant360";

const HISTORY_TABS: Array<{ key: "all" | WorkHistoryCategory; label: string }> = [
  { key: "all", label: "전체" },
  { key: "reception", label: "접수" },
  { key: "install", label: "설치" },
  { key: "as", label: "AS" },
  { key: "change", label: "변경" },
  { key: "post", label: "설치·배송 이후" },
];

const HISTORY_CATEGORY_LABEL: Record<WorkHistoryCategory, string> = {
  reception: "접수",
  install: "설치",
  as: "AS",
  change: "변경",
  post: "설치·배송 이후",
};

function formatDate(value: string) {
  return format(new Date(value), "yyyy.M.d HH:mm", { locale: ko });
}

export default function MerchantHistorySection({ history }: { history: WorkHistoryItem[] }) {
  const [tab, setTab] = useState<"all" | WorkHistoryCategory>("all");

  const filteredHistory = useMemo(
    () => (tab === "all" ? history : history.filter((item) => item.category === tab)),
    [history, tab],
  );

  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white px-5 py-5 md:px-6">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-900">관련 업무 이력</h3>
        <span className="text-xs text-slate-400">{filteredHistory.length}건</span>
      </div>
      <div className="mb-4 flex shrink-0 gap-1 overflow-x-auto border-b border-slate-100 pb-px">
        {HISTORY_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`whitespace-nowrap border-b-2 px-2.5 py-2 text-xs font-semibold transition-colors ${tab === item.key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-700"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {filteredHistory.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-400">관련 업무 이력이 없습니다.</p>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {filteredHistory.map((item) => (
            <article key={`${item.category}-${item.id}`} className="px-3.5 py-3.5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{item.title}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-500">
                    {item.summary}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${item.statusClass}`}
                >
                  {item.status}
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-slate-400">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-slate-500">
                    {HISTORY_CATEGORY_LABEL[item.category]}
                  </span>
                  <time dateTime={item.date}>{formatDate(item.date)}</time>
                  {item.actorName && (
                    <span className="font-semibold text-blue-500">{item.actorName}</span>
                  )}
                </span>
                <Link
                  href={item.href}
                  className="inline-flex shrink-0 items-center gap-1 font-medium text-blue-600 hover:text-blue-700"
                >
                  관련 화면 열기 <ExternalLink size={12} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
