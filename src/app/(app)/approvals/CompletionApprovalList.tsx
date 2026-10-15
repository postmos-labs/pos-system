"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
import {
  resolveChannel,
  CHANNEL_RANK,
  CHANNEL_KEYS,
  type ChannelKey,
} from "@/lib/franchiseChannel";
import ApprovalButton from "./ApprovalButton";
import type { ApprovalNote } from "@/lib/approvalNotes";

export type CompletionApprovalRow = {
  installationId: string;
  customerName: string | null;
  requesterName: string;
  stepLabel: string;
  isFinal: boolean;
  channel: string | null;
  receptionChannel: string | null;
  notes: ApprovalNote[];
};

// 설치 단계 승인 목록. 이관 승인 목록과 같은 인입경로 칩·강조·정렬·필터를 쓴다.
export default function CompletionApprovalList({ items }: { items: CompletionApprovalRow[] }) {
  const [filter, setFilter] = useState<ChannelKey | null>(null);

  const sortedItems = useMemo(
    () =>
      items
        .map((item, index) => ({
          item,
          index,
          tone: resolveChannel(item.channel, item.receptionChannel),
        }))
        .sort((a, b) => {
          const rankDiff = CHANNEL_RANK[a.tone.key] - CHANNEL_RANK[b.tone.key];
          return rankDiff !== 0 ? rankDiff : a.index - b.index;
        }),
    [items],
  );

  const counts = useMemo(() => {
    const result: Record<ChannelKey, number> = {
      toss_premium_lead: 0,
      toss_lead: 0,
      direct_sales: 0,
      none: 0,
    };
    for (const { tone } of sortedItems) result[tone.key] += 1;
    return result;
  }, [sortedItems]);

  const visibleItems = filter ? sortedItems.filter(({ tone }) => tone.key === filter) : sortedItems;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-6 py-3">
        {CHANNEL_KEYS.map((key) => {
          const tone = resolveChannel(key === "none" ? null : key);
          const active = filter === key;
          const count = counts[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter((current) => (current === key ? null : key))}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                active
                  ? `${tone.chip} ring-2 ring-slate-300 ring-offset-1`
                  : `border border-slate-200 bg-white ${tone.accentText}`
              } ${count === 0 ? "opacity-50" : ""}`}
            >
              {tone.label}
              <span
                className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] ${
                  active ? "bg-white/25" : "bg-slate-100"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
      {visibleItems.length > 0 ? (
        <div className="divide-y divide-slate-100">
          {visibleItems.map(({ item, tone }) => (
            <div
              key={item.installationId}
              className={`flex items-center gap-4 px-6 py-3.5 transition-colors ${tone.rowBg}`}
            >
              <Link
                href={`/installs?id=${item.installationId}`}
                className="flex min-w-0 flex-1 items-center gap-4"
              >
                <span
                  className={`inline-flex w-[104px] shrink-0 items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-extrabold ${tone.chip}`}
                >
                  {tone.star && <Star size={13} className="fill-current" />}
                  {tone.short}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-semibold text-slate-900 ${tone.star ? "font-bold text-violet-950" : ""}`}
                  >
                    {item.customerName ?? "설치 건"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {item.requesterName} · {item.stepLabel} {item.isFinal ? "최종 " : "1차 "}
                    승인요청
                  </p>
                </div>
                <ArrowRight size={16} className="text-slate-400" />
              </Link>
              <ApprovalButton
                type={item.isFinal ? "tech_final" : "completion"}
                id={item.installationId}
                notes={item.notes}
                approveLabel={tone.star ? "프리미엄 리드 승인" : "승인"}
                approveClassName={tone.button}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="px-6 py-4 text-sm text-slate-500">해당 경로의 대기 건이 없습니다.</div>
      )}
    </div>
  );
}
