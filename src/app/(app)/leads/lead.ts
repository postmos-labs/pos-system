// 자체리드 — 대표님·자체영업으로 들어온 건을 접수부터 최종 완료까지 한 곳에서 관리하는 원본 대장.
// 가맹접수로 전환(이관)해도 이 건은 지워지지 않고, 이관일·가맹접수 진행상태·완료일을 계속 보여 준다.
// 상태값은 DB CHECK(supabase/149 · 152)와 같이 간다. 한쪽만 바꾸면 저장이 실패한다.

import { kstDate } from "@/lib/date";
import type { ApplicantType, EquipmentItem, FranchiseChannel } from "@/types";

export const LEAD_SOURCES = ["대표님", "자체영업", "지인소개", "기타"] as const;

/** 가맹접수 등록 폼과 같은 선택지. 가맹접수 쪽은 FranchiseCreateDialog 안에 로컬로 두고 있어 여기 다시 적는다 */
export const LEAD_INTERNET_PROVIDERS = ["3S", "백메가", "엑티브"] as const;
export const LEAD_EQUIPMENT_CATALOG = [
  "토스프론트",
  "토스단말기",
  "카드단말기",
  "포스기",
  "인터넷",
  "키오스크",
  "영수증프린터",
  "주방프린터기",
  "키오스크리더기",
  "무선단말기",
  "금전함",
  "태블릿",
  "테이블오더",
  "보조배터리",
  "원격",
] as const;

/** 리드 구분 — 무슨 건인지. 유입경로(누가 줬나)와는 다른 축이라 따로 둔다 */
export const LEAD_TYPES = ["인터넷", "지시건", "패키지", "기타"] as const;
export type LeadType = (typeof LEAD_TYPES)[number];

export const CONTACT_STATUSES = ["미연락", "연락완료", "부재"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const DOC_STATUSES = ["미확인", "요청", "완료"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export const VAN_STATUSES = ["미접수", "접수", "완료"] as const;
export type VanStatus = (typeof VAN_STATUSES)[number];

export const INTERNET_STATUSES = ["해당없음", "미진행", "진행중", "완료"] as const;
export type InternetStatus = (typeof INTERNET_STATUSES)[number];

export const DECISIONS = ["미정", "접수대상", "상담", "보류", "접수아님"] as const;
export type LeadDecision = (typeof DECISIONS)[number];

export const LEAD_TYPE_STYLE: Record<LeadType, string> = {
  인터넷: "bg-sky-100 text-sky-700 border-sky-300",
  지시건: "bg-violet-100 text-violet-700 border-violet-300",
  패키지: "bg-emerald-100 text-emerald-700 border-emerald-300",
  기타: "bg-slate-100 text-slate-600 border-slate-200",
};

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

export const VAN_STATUS_STYLE: Record<VanStatus, string> = {
  미접수: "bg-slate-100 text-slate-600 border-slate-200",
  접수: "bg-amber-100 text-amber-700 border-amber-300",
  완료: "bg-green-100 text-green-700 border-green-300",
};

export const INTERNET_STATUS_STYLE: Record<InternetStatus, string> = {
  해당없음: "bg-slate-100 text-slate-500 border-slate-200",
  미진행: "bg-red-100 text-red-700 border-red-300",
  진행중: "bg-amber-100 text-amber-700 border-amber-300",
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
  상담: "문의·견적 등 상담 목적 → 상담 후 완료",
  보류: "추후 진행 예정 → 재연락 예정일 필수",
  접수아님: "취소·중복·진행 의사 없음 → 사유 입력 후 완료",
};

export interface OwnLead {
  id: string;
  /** 원본번호. 152 마이그레이션 전 환경에서는 없을 수 있다 */
  lead_no: number | null;
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  region: string | null;
  /** 유입경로 — LEAD_SOURCES 중 하나이거나 직접 입력 */
  source: string;
  /** 리드 구분. 152 전 환경에서는 undefined일 수 있어 화면은 "기타"로 본다 */
  lead_type: LeadType;
  assignee_id: string | null;
  assignee_name: string | null;
  contact_status: ContactStatus;
  doc_status: DocStatus;
  van_status: VanStatus;
  internet_status: InternetStatus;
  decision: LeadDecision;
  /** YYYY-MM-DD. 보류면 재연락 예정일, 그 외에는 다음 조치일 */
  next_action_date: string | null;
  /** YYYY-MM-DD. 오픈 예정일 */
  open_date: string | null;
  note: string | null;
  // ── 가맹접수 등록 폼과 같은 항목 (supabase/153). 전환 시 그대로 가맹접수로 넘어간다. 153 전 환경에서는 undefined일 수 있다 ──
  applicant_type: ApplicantType;
  business_number: string | null;
  channel: FranchiseChannel | null;
  is_rental: boolean;
  is_installment: boolean;
  /** YYYY-MM-DD. 접수날짜 (기본은 등록일) */
  reception_date: string | null;
  card_apply_date: string | null;
  /** 인터넷 업체 (LEAD_INTERNET_PROVIDERS) */
  internet: string | null;
  program: string | null;
  equipment_items: EquipmentItem[];
  address: string | null;
  address_detail: string | null;
  /** YYYY-MM-DD. 설치 및 발송일 */
  install_date: string | null;
  /** VAN사. "코세스2, 코벤"처럼 쉼표로 여러 개 */
  van_company: string | null;
  /** 접수대상으로 판단해 가맹접수로 넘긴(이관한) 건. 리드는 지워지지 않고 계속 남는다 */
  converted_franchise_id: string | null;
  /** 이관일 */
  converted_at: string | null;
  /** 완료 처리 시각(완료일). 완료·상담 종료·접수아님 모두 여기로 닫힌다. null이면 아직 열려 있다 */
  closed_at: string | null;
  close_reason: string | null;
  /** 완료 처리한 사람 */
  completed_by: string | null;
  completed_by_name: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

/** 목록·상세에 붙는 가맹접수 쪽 정보. 이관된 건만 채워진다 */
export interface LinkedFranchiseInfo {
  status: string;
  status_label: string;
}

/** 등록 폼 입력. 가맹접수 등록 폼(FranchiseCreateInput)과 항목을 맞춘다 */
export interface OwnLeadInput {
  business_name: string;
  owner_name: string;
  phone: string;
  region: string;
  source: string;
  lead_type: string;
  assignee_id: string;
  open_date: string;
  note: string;
  applicant_type: ApplicantType;
  business_number: string;
  channel: FranchiseChannel | "";
  is_rental: boolean;
  is_installment: boolean;
  reception_date: string;
  card_apply_date: string;
  internet: string;
  program: string;
  equipment_items: EquipmentItem[];
  address: string;
  address_detail: string;
  install_date: string;
  van_company: string;
}

/**
 * 표·상세에서 바로 고칠 수 있는 열. 값은 전부 문자열로 넘긴다 —
 * is_rental·is_installment는 "true"/"false", 날짜는 YYYY-MM-DD 또는 "".
 * equipment_items는 배열이라 updateLeadEquipment로 따로 고친다.
 */
export type LeadEditableField =
  | "business_name"
  | "owner_name"
  | "phone"
  | "region"
  | "source"
  | "lead_type"
  | "assignee_id"
  | "contact_status"
  | "doc_status"
  | "van_status"
  | "internet_status"
  | "decision"
  | "next_action_date"
  | "open_date"
  | "note"
  | "applicant_type"
  | "business_number"
  | "channel"
  | "is_rental"
  | "is_installment"
  | "reception_date"
  | "card_apply_date"
  | "internet"
  | "program"
  | "address"
  | "address_detail"
  | "install_date"
  | "van_company";

/** 로그의 field에는 LeadEditableField 외에 equipment_items도 들어간다 */
export const LEAD_FIELD_LABELS: Record<LeadEditableField | "equipment_items", string> = {
  business_name: "상호명",
  owner_name: "대표자",
  phone: "연락처",
  region: "지역",
  source: "유입경로",
  lead_type: "리드 구분",
  assignee_id: "담당자",
  contact_status: "연락상태",
  doc_status: "서류상태",
  van_status: "VAN 접수",
  internet_status: "인터넷 진행",
  decision: "접수판단",
  next_action_date: "다음 조치일",
  open_date: "오픈 예정일",
  note: "비고",
  applicant_type: "사업자 유형",
  business_number: "사업자번호",
  channel: "채널",
  is_rental: "렌탈",
  is_installment: "할부",
  reception_date: "접수날짜",
  card_apply_date: "카드가맹접수일",
  internet: "인터넷 업체",
  program: "사용 프로그램",
  address: "주소",
  address_detail: "상세주소",
  install_date: "설치 및 발송일",
  van_company: "VAN사",
  equipment_items: "상품",
};

/** 처리 히스토리 한 줄. supabase/152의 own_lead_logs */
export type LeadLogAction = "create" | "update" | "close" | "reopen" | "convert";
export interface OwnLeadLog {
  id: string;
  lead_id: string;
  user_id: string | null;
  user_name: string | null;
  action: LeadLogAction;
  /** update일 때 바뀐 열 (LeadEditableField) */
  field: string | null;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
}

export const LEAD_LOG_ACTION_LABELS: Record<LeadLogAction, string> = {
  create: "등록",
  update: "수정",
  close: "완료 처리",
  reopen: "다시 열기",
  convert: "가맹접수 이관",
};

export function formatLeadNo(leadNo: number | null | undefined): string {
  return leadNo == null ? "-" : `L-${String(leadNo).padStart(4, "0")}`;
}

/**
 * 처리 단계. 셋 중 하나다.
 * open      진행중 — 리드 단계에서 확인·판단 중
 * converted 이관됨 — 가맹접수로 넘어가 후속 업무 진행 중. 리드는 그대로 남는다
 * closed    완료 — 완료 처리·상담 종료·접수아님으로 닫힘
 */
export type LeadStage = "open" | "converted" | "closed";

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  open: "진행중",
  converted: "이관됨",
  closed: "완료",
};

export const LEAD_STAGE_STYLE: Record<LeadStage, string> = {
  open: "bg-blue-100 text-blue-700 border-blue-300",
  converted: "bg-violet-100 text-violet-700 border-violet-300",
  closed: "bg-green-100 text-green-700 border-green-300",
};

export function leadStage(lead: OwnLead): LeadStage {
  if (lead.closed_at) return "closed";
  if (lead.converted_franchise_id) return "converted";
  return "open";
}

/** 완료(닫힘) 여부. 이관만 된 건은 닫힌 게 아니다 */
export function isLeadClosed(lead: OwnLead): boolean {
  return !!lead.closed_at;
}

/** 등록 후 며칠 지났는지 (KST 날짜 기준). 완료 건은 닫힌 날까지로 센다 */
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
 * 자동 "확인 필요" 판정 — 도입안의 누락방지 규칙 다섯 가지. 리드 단계(open)에만 붙는다.
 * 이관된 건은 가맹접수 쪽이 진행을 관리하므로 여기서 다시 잡지 않는다. today는 YYYY-MM-DD(KST).
 */
export function leadFlags(lead: OwnLead, today: string): LeadFlag[] {
  if (leadStage(lead) !== "open") return [];
  const flags: LeadFlag[] = [];
  if (!lead.assignee_id) flags.push("no_assignee");
  if (lead.contact_status === "미연락" && leadAgeDays(lead, today) >= 1) flags.push("uncontacted");
  if (lead.contact_status === "연락완료" && lead.decision === "미정") flags.push("undecided");
  if (lead.decision === "접수대상" && !lead.converted_franchise_id) flags.push("unconverted");
  if (lead.decision === "보류" && !lead.next_action_date) flags.push("hold_no_date");
  return flags;
}

/**
 * 상단 KPI 카드 키 — 누르면 같은 이름의 필터가 걸린다.
 * all·open·converted·closed는 처리 단계 필터, 나머지는 진행중(open) 건 안에서의 세부 상태.
 */
export type LeadKpiKey =
  | "all"
  | "open"
  | "converted"
  | "closed"
  | "pending"
  | "uncontacted"
  | "doc_requested"
  | "target"
  | "hold"
  | "flagged";

export function leadKpiCounts(rows: OwnLead[], today: string): Record<LeadKpiKey, number> {
  const open = rows.filter((r) => leadStage(r) === "open");
  return {
    all: rows.length,
    open: open.length,
    converted: rows.filter((r) => leadStage(r) === "converted").length,
    closed: rows.filter((r) => leadStage(r) === "closed").length,
    pending: open.filter((r) => r.decision === "미정").length,
    uncontacted: open.filter((r) => r.contact_status === "미연락").length,
    doc_requested: open.filter((r) => r.doc_status === "요청").length,
    target: open.filter((r) => r.decision === "접수대상").length,
    hold: open.filter((r) => r.decision === "보류").length,
    flagged: open.filter((r) => leadFlags(r, today).length > 0).length,
  };
}

export function matchesLeadKpi(lead: OwnLead, key: LeadKpiKey, today: string): boolean {
  const stage = leadStage(lead);
  const open = stage === "open";
  switch (key) {
    case "all":
      return true;
    case "open":
      return open;
    case "converted":
      return stage === "converted";
    case "closed":
      return stage === "closed";
    case "pending":
      return open && lead.decision === "미정";
    case "uncontacted":
      return open && lead.contact_status === "미연락";
    case "doc_requested":
      return open && lead.doc_status === "요청";
    case "target":
      return open && lead.decision === "접수대상";
    case "hold":
      return open && lead.decision === "보류";
    case "flagged":
      return open && leadFlags(lead, today).length > 0;
  }
}

/** 검색어 정규화 — 숫자만 남긴 검색어가 3자리 이상이면 번호(연락처)에서 하이픈 없이 찾는다 */
export function matchesLeadSearch(lead: OwnLead, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  const haystack =
    `${formatLeadNo(lead.lead_no)} ${lead.business_name} ${lead.owner_name ?? ""} ${lead.phone ?? ""} ${lead.business_number ?? ""} ${lead.assignee_name ?? ""} ${lead.region ?? ""}`.toLowerCase();
  if (haystack.includes(t)) return true;
  const digits = t.replace(/\D/g, "");
  if (digits.length < 3) return false;
  return (
    (lead.phone ?? "").replace(/\D/g, "").includes(digits) ||
    (lead.business_number ?? "").replace(/\D/g, "").includes(digits)
  );
}
