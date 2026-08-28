"use client";

import { useRouter } from "next/navigation";
import { VAN_GROUP_LABEL, type VanGroup } from "@/types";

const VAN_TONE = {
  all: {
    activeBox: "border-slate-900 bg-white",
    idleBox: "border-slate-200 bg-white hover:border-slate-300",
    activeLabel: "text-slate-900",
    idleLabel: "text-slate-500",
    activeValue: "text-slate-900",
    idleValue: "text-slate-500",
    dot: "",
  },
  toss: {
    activeBox: "border-blue-600 bg-blue-50",
    idleBox: "border-slate-200 bg-white hover:border-blue-300",
    activeLabel: "text-blue-700",
    idleLabel: "text-blue-600",
    activeValue: "text-blue-700",
    idleValue: "text-slate-500",
    dot: "bg-blue-600",
  },
  kicc: {
    activeBox: "border-emerald-600 bg-emerald-50",
    idleBox: "border-slate-200 bg-white hover:border-emerald-300",
    activeLabel: "text-emerald-700",
    idleLabel: "text-emerald-600",
    activeValue: "text-emerald-700",
    idleValue: "text-slate-500",
    dot: "bg-emerald-600",
  },
} as const;

interface Props {
  van: VanGroup | "";
  counts: { all: number; toss: number; kicc: number };
}

export default function VanGroupTabs({ van, counts }: Props) {
  const router = useRouter();

  return (
    <div className="grid grid-cols-3 gap-2.5">
      {(
        [
          { value: "" as const, label: "전체", count: counts.all, tone: "all" as const },
          {
            value: "toss" as const,
            label: VAN_GROUP_LABEL.toss,
            count: counts.toss,
            tone: "toss" as const,
          },
          {
            value: "kicc" as const,
            label: VAN_GROUP_LABEL.kicc,
            count: counts.kicc,
            tone: "kicc" as const,
          },
        ] satisfies {
          value: VanGroup | "";
          label: string;
          count: number;
          tone: keyof typeof VAN_TONE;
        }[]
      ).map(({ value, label, count, tone }) => {
        const active = van === value;
        return (
          <button
            key={value || "all"}
            type="button"
            onClick={() => router.push(value ? `/dashboard?van=${value}` : "/dashboard")}
            className={`flex flex-col gap-1 rounded-xl border-2 px-4 py-3 text-left transition-colors ${VAN_TONE[tone][active ? "activeBox" : "idleBox"]}`}
          >
            <span
              className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${VAN_TONE[tone][active ? "activeLabel" : "idleLabel"]}`}
            >
              {tone !== "all" && (
                <span className={`size-2 shrink-0 rounded-full ${VAN_TONE[tone].dot}`} />
              )}
              {label}
            </span>
            <span
              className={`text-[26px] leading-none font-bold tabular-nums ${VAN_TONE[tone][active ? "activeValue" : "idleValue"]}`}
            >
              {count.toLocaleString()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
