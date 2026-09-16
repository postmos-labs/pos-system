// 가맹접수 인입경로(channel) 표시 규칙. 승인함·가맹접수 드로어가 같은 색과 문구를 쓰도록 한곳에 둔다.
// 채널(channel)이 비어 있으면 자유 입력인 접수채널(reception_channel) 글자에서 추정한다 —
// 옛 접수 건은 channel 없이 접수채널만 "토스프리미엄"·"토스리드건"으로 적혀 있는 경우가 많다.

import { FRANCHISE_CHANNEL_LABEL, type FranchiseChannel } from "@/types";

export type ChannelKey = FranchiseChannel | "none";

export interface ChannelTone {
  key: ChannelKey;
  /** 배지·머리에 쓰는 이름. 미지정이면 "경로 미지정" */
  label: string;
  /** 목록 행 맨 앞 라벨용 짧은 이름 (프리미엄 / 토스 리드 / 직접 영업 / 경로 미지정) */
  short: string;
  /** 채워진 라벨 (행 맨 앞·요약 칩 활성) */
  chip: string;
  /** 연한 배지 (드로어 헤더 등) */
  soft: string;
  /** 상세 창 머리 배경 + 글자 */
  header: string;
  /** 승인 버튼 배경 (hover 포함) */
  button: string;
  /** 목록 행 배경. 프리미엄만 물들이고 나머지는 흰색 */
  rowBg: string;
  /** 강조 글자색 (인입경로 요약 칸) */
  accentText: string;
  /** 프리미엄이면 별 아이콘을 붙인다 */
  star: boolean;
  /** channel이 비어 접수채널 글자로 추정했으면 true — 행에 "접수채널 '…'"을 덧붙여 근거를 보여 준다 */
  inferred: boolean;
}

const TONES: Record<ChannelKey, Omit<ChannelTone, "inferred">> = {
  toss_premium_lead: {
    key: "toss_premium_lead",
    label: FRANCHISE_CHANNEL_LABEL.toss_premium_lead,
    short: "프리미엄",
    chip: "bg-violet-700 text-white",
    soft: "border-violet-300 bg-violet-100 text-violet-700",
    header: "bg-violet-700 text-white",
    button: "bg-violet-700 hover:bg-violet-800",
    rowBg: "bg-violet-50 hover:bg-violet-100/70",
    accentText: "text-violet-700",
    star: true,
  },
  toss_lead: {
    key: "toss_lead",
    label: FRANCHISE_CHANNEL_LABEL.toss_lead,
    short: "토스 리드",
    chip: "bg-blue-600 text-white",
    soft: "border-blue-300 bg-blue-100 text-blue-700",
    header: "bg-blue-600 text-white",
    button: "bg-blue-600 hover:bg-blue-700",
    rowBg: "hover:bg-slate-50",
    accentText: "text-blue-700",
    star: false,
  },
  direct_sales: {
    key: "direct_sales",
    label: FRANCHISE_CHANNEL_LABEL.direct_sales,
    short: "직접 영업",
    chip: "bg-green-700 text-white",
    soft: "border-green-300 bg-green-100 text-green-700",
    header: "bg-green-700 text-white",
    button: "bg-green-700 hover:bg-green-800",
    rowBg: "hover:bg-slate-50",
    accentText: "text-green-700",
    star: false,
  },
  none: {
    key: "none",
    label: "경로 미지정",
    short: "경로 미지정",
    chip: "border border-dashed border-slate-300 bg-white text-slate-500",
    soft: "border-slate-200 bg-slate-100 text-slate-600",
    header: "bg-slate-700 text-white",
    button: "bg-emerald-600 hover:bg-emerald-700",
    rowBg: "hover:bg-slate-50",
    accentText: "text-slate-700",
    star: false,
  },
};

function isChannel(value: string | null | undefined): value is FranchiseChannel {
  return !!value && value in FRANCHISE_CHANNEL_LABEL;
}

/** 접수채널 자유 문구에서 채널을 추정한다. 못 찾으면 null */
export function inferChannelFromReception(
  receptionChannel: string | null | undefined,
): FranchiseChannel | null {
  const text = (receptionChannel ?? "").replace(/\s+/g, "");
  if (!text) return null;
  if (text.includes("프리미엄")) return "toss_premium_lead";
  if (text.includes("리드")) return "toss_lead";
  if (text.includes("직접")) return "direct_sales";
  return null;
}

export function resolveChannel(
  channel: string | null | undefined,
  receptionChannel?: string | null,
): ChannelTone {
  if (isChannel(channel)) return { ...TONES[channel], inferred: false };
  const inferred = inferChannelFromReception(receptionChannel);
  if (inferred) return { ...TONES[inferred], inferred: true };
  return { ...TONES.none, inferred: false };
}

/** 정렬 순서 — 프리미엄 리드가 맨 위, 미지정이 맨 아래 */
export const CHANNEL_RANK: Record<ChannelKey, number> = {
  toss_premium_lead: 0,
  toss_lead: 1,
  direct_sales: 2,
  none: 3,
};

/** 요약 칩·필터 순서 */
export const CHANNEL_KEYS: ChannelKey[] = [
  "toss_premium_lead",
  "toss_lead",
  "direct_sales",
  "none",
];
