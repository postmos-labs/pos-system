"use client";

import { useMemo, useState } from "react";
import {
  resolveChannel,
  CHANNEL_RANK,
  CHANNEL_KEYS,
  type ChannelKey,
} from "@/lib/franchiseChannel";
import { vanGroupOf } from "@/lib/vanGroup";
import { VAN_GROUP_LABEL, type VanGroup } from "@/types";
import TransferApprovalItem from "./TransferApprovalItem";
import ApprovalButton from "./ApprovalButton";
import type { ApprovalNote } from "@/lib/approvalNotes";

export type TransferApprovalRow = {
  id: string;
  businessName: string | null;
  ownerName: string | null;
  address: string | null;
  phone: string | null;
  channel: string | null;
  receptionChannel: string | null;
  receptionDate: string | null;
  vanCompany: string | null;
  requesterName: string;
  csApproverName: string | null;
  notes: ApprovalNote[];
};

type Props = {
  items: TransferApprovalRow[];
  approvalRole: "cs_responsible" | "team_lead";
};

const VAN_TABS: { key: "all" | VanGroup; label: string; active: string; idle: string }[] = [
  { key: "all", label: "전체", active: "bg-slate-800 text-white", idle: "text-slate-600" },
  {
    key: "toss",
    label: VAN_GROUP_LABEL.toss,
    active: "bg-blue-600 text-white",
    idle: "text-blue-600",
  },
  {
    key: "kicc",
    label: VAN_GROUP_LABEL.kicc,
    active: "bg-emerald-600 text-white",
    idle: "text-emerald-600",
  },
];

export default function TransferApprovalList({ items, approvalRole }: Props) {
  const [filter, setFilter] = useState<ChannelKey | null>(null);
  const [vanFilter, setVanFilter] = useState<VanGroup | "">("");

  const sortedItems = useMemo(() => {
    return items
      .map((item, index) => ({
        item,
        index,
        tone: resolveChannel(item.channel, item.receptionChannel),
        van: vanGroupOf(item.vanCompany),
      }))
      .sort((a, b) => {
        const rankDiff = CHANNEL_RANK[a.tone.key] - CHANNEL_RANK[b.tone.key];
        if (rankDiff !== 0) return rankDiff;
        return a.index - b.index;
      });
  }, [items]);

  const counts = useMemo(() => {
    const result: Record<ChannelKey, number> = {
      toss_premium_lead: 0,
      toss_lead: 0,
      direct_sales: 0,
      none: 0,
    };
    for (const { tone, van } of sortedItems) {
      if (vanFilter && van !== vanFilter) continue;
      result[tone.key] += 1;
    }
    return result;
  }, [sortedItems, vanFilter]);

  const vanCounts = useMemo(() => {
    const result: Record<"all" | VanGroup, number> = { all: 0, toss: 0, kicc: 0 };
    for (const { tone, van } of sortedItems) {
      if (filter && tone.key !== filter) continue;
      result.all += 1;
      if (van) result[van] += 1;
    }
    return result;
  }, [sortedItems, filter]);

  const visibleItems = sortedItems.filter(
    ({ tone, van }) => (!filter || tone.key === filter) && (!vanFilter || van === vanFilter),
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-6 py-3">
        {VAN_TABS.map((tab) => {
          const active = tab.key === "all" ? vanFilter === "" : vanFilter === tab.key;
          const count = vanCounts[tab.key];
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() =>
                setVanFilter((current) => (tab.key === "all" || current === tab.key ? "" : tab.key))
              }
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                active
                  ? `${tab.active} ring-2 ring-slate-300 ring-offset-1`
                  : `border border-slate-200 bg-white ${tab.idle}`
              } ${count === 0 ? "opacity-50" : ""}`}
            >
              {tab.label}
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
              key={item.id}
              className={`flex items-center gap-4 px-6 py-3.5 transition-colors ${tone.rowBg}`}
            >
              <TransferApprovalItem
                id={item.id}
                businessName={item.businessName}
                ownerName={item.ownerName}
                address={item.address}
                phone={item.phone}
                receptionChannel={item.receptionChannel}
                receptionDate={item.receptionDate}
                vanCompany={item.vanCompany}
                requesterName={item.requesterName}
                csApproverName={item.csApproverName}
                approvalRole={approvalRole}
                notes={item.notes}
                tone={tone}
              />
              <ApprovalButton
                type={approvalRole === "cs_responsible" ? "cs_transfer" : "transfer"}
                id={item.id}
                notes={item.notes}
                approveLabel={tone.star ? "프리미엄 리드 승인" : "승인"}
                approveClassName={tone.button}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="px-6 py-4 text-sm text-slate-500">해당 조건의 대기 건이 없습니다.</div>
      )}
    </div>
  );
}
