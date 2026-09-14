// 자체리드 — 대표님·자체영업으로 들어온 건을 가맹접수 전에 담아 두고, CS가 확인해 접수 여부를 판단하는 단계.
// 상태값은 DB CHECK(supabase/149)와 같이 간다. 한쪽만 바꾸면 저장이 실패한다.

import { kstDate } from "@/lib/date";

export const LEAD_SOURCES = ["대표님", "자체영업", "지인소개", "기타"] as const;

export const CONTACT_STATUSES = ["미연락", "연락완료", "부재"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const DOC_STATUSES = ["미확인", "요청", "완료"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export const DECISIONS = ["미정", "접수대상", "상담", "보류", "접수아님"] as const;
export type LeadDecision = (typeof DECISIONS)[number];

export const CONTACT_STATUS_STYLE: Record<ContactStatus, string> = {
  미연락: "bg-red-100 text-red-700 border-red-300",
  연락완료: "bg-green-100 text-green-700 border-green-300",
  부재: "bg-amber-100 text-amber-700 border-amber-300",
};

export const DOC_STATUS_STYLE: Record<DocStatus, string> = {
  미확인: "bg-slate-100 text-slate-600 border-slate-200",
  요청: "bg-amber-100 text-amber-700 border-amber-300",
  완료: "bg-green-100 text-green-700 border-green-300",
};

export const DECISION_STYLE: Record<LeadDecision, string> = {
  미정: "bg-slate-100 text-slate-600 border-slate-200",
  접수대상: "bg-blue-100 text-blue-700 border-blue-300",
  상담: "bg-purple-100 text-purple-700 border-purple-300",
  보류: "bg-amber-100 text-amber-700 border-amber-300",
  접수아님: "bg-red-100 text-red-700 border-red-300",
};

/** 접수판단 선택값 옆에 보여 줄 기준 문구 — 직원마다 다르게 판단하지 않도록 화면에 고정 */
export const DECISION_GUIDE: Record<LeadDecision, string> = {
  미정: "아직 고객 확인 전 또는 내용 파악 중",
  접수대상: "실제 POS·가맹 진행 의사 확인 → 가맹접수로 전환",
  상담: "문의·견적 등 상담 목적 → 상담 후 종결",
  보류: "추후 진행 예정 → 재연락 예정일 필수",
  접수아님: "취소·중복·진행 의사 없음 → 사유 입력 후 종결",
};

export interface OwnLead {
  id: string;
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  region: string | null;
  /** 유입경로 — LEAD_SOURCES 중 하나이거나 직접 입력 */
  source: string;
  assignee_id: string | null;
  assignee_name: string | null;
  contact_status: ContactStatus;
  doc_status: DocStatus;
  decision: LeadDecision;
  /** YYYY-MM-DD. 보류면 재연락 예정일, 그 외에는 다음 조치일 */
  next_action_date: string | null;
  note: string | null;
  /** 접수대상으로 판단해 가맹접수로 넘긴 건. 채워지면 종결로 본다 */
  converted_franchise_id: string | null;
  /** 상담 종료·접수아님 등으로 닫은 시각. null이면 진행 중 */
  closed_at: string | null;
  close_reason: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface OwnLeadInput {
  business_name: string;
  owner_name: string;
  phone: string;
  region: string;
  source: string;
  assignee_id: string;
  note: string;
}

/** 표에서 한 칸씩 바로 고칠 수 있는 열 */
export type LeadEditableField =
  | "assignee_id"
  | "contact_status"
  | "doc_status"
  | "decision"
  | "next_action_date"
  | "note"
  | "owner_name"
  | "phone"
  | "region"
  | "source";

export function isLeadClosed(lead: OwnLead): boolean {
  return !!lead.closed_at || !!lead.converted_franchise_id;
}

/** 등록 후 며칠 지났는지 (KST 날짜 기준). 종결 건은 닫힌 날까지로 센다 */
export function leadAgeDays(lead: OwnLead, today: string): number {
  // created_at은 UTC ISO라 날짜만 자르면 KST 새벽(00~09시) 등록 건이 바로 D+1이 된다.
  const start = kstDate(new Date(lead.created_at));
  const end = lead.closed_at ? kstDate(new Date(lead.closed_at)) : today;
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

export const LEAD_FLAG_LABELS = {
  no_assignee: "담당자 미지정",
  uncontacted: "미연락 D+1",
  undecided: "연락 후 판단 미정",
  unconverted: "접수대상 미전환",
  hold_no_date: "보류 재연락일 없음",
} as const;
export type LeadFlag = keyof typeof LEAD_FLAG_LABELS;

/**
 * 자동 "확인 필요" 판정 — 도입안의 누락방지 규칙 다섯 가지. 진행 중인 건에만 붙는다.
 * today는 YYYY-MM-DD(KST).
 */
export function leadFlags(lead: OwnLead, today: string): LeadFlag[] {
  if (isLeadClosed(lead)) return [];
  const flags: LeadFlag[] = [];
  if (!lead.assignee_id) flags.push("no_assignee");
  if (lead.contact_status === "미연락" && leadAgeDays(lead, today) >= 1) flags.push("uncontacted");
  if (lead.contact_status === "연락완료" && lead.decision === "미정") flags.push("undecided");
  if (lead.decision === "접수대상" && !lead.converted_franchise_id) flags.push("unconverted");
  if (lead.decision === "보류" && !lead.next_action_date) flags.push("hold_no_date");
  return flags;
}

/** 상단 KPI 카드 키 — 누르면 같은 이름의 필터가 걸린다 */
export type LeadKpiKey =
  "all" | "pending" | "uncontacted" | "doc_requested" | "target" | "hold" | "closed" | "flagged";

export function leadKpiCounts(rows: OwnLead[], today: string): Record<LeadKpiKey, number> {
  const open = rows.filter((r) => !isLeadClosed(r));
  return {
    all: open.length,
    pending: open.filter((r) => r.decision === "미정").length,
    uncontacted: open.filter((r) => r.contact_status === "미연락").length,
    doc_requested: open.filter((r) => r.doc_status === "요청").length,
    target: open.filter((r) => r.decision === "접수대상").length,
    hold: open.filter((r) => r.decision === "보류").length,
    closed: rows.length - open.length,
    flagged: open.filter((r) => leadFlags(r, today).length > 0).length,
  };
}

export function matchesLeadKpi(lead: OwnLead, key: LeadKpiKey, today: string): boolean {
  const closed = isLeadClosed(lead);
  switch (key) {
    case "all":
      return !closed;
    case "pending":
      return !closed && lead.decision === "미정";
    case "uncontacted":
      return !closed && lead.contact_status === "미연락";
    case "doc_requested":
      return !closed && lead.doc_status === "요청";
    case "target":
      return !closed && lead.decision === "접수대상";
    case "hold":
      return !closed && lead.decision === "보류";
    case "closed":
      return closed;
    case "flagged":
      return !closed && leadFlags(lead, today).length > 0;
  }
}
