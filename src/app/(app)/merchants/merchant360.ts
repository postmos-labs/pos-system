export type WorkHistoryCategory = "reception" | "install" | "as" | "change" | "post";

export type MerchantMemoStage = "before_transfer" | "after_transfer" | "after_completion";

export interface WorkHistoryItem {
  id: string;
  date: string;
  title: string;
  summary: string;
  category: WorkHistoryCategory;
  status: string;
  statusClass: string;
  href: string;
  actorName?: string | null;
}

// CS 이력 집계용 분류. 월간 보고서(장애 유형별 건수, 원격 해결률, 출장 건수, 반복 장애)를
// 뽑기 위한 값이라 자유 텍스트가 아니라 고정 목록으로 받는다.
export type MemoIssueCategory = "payment" | "pos" | "device" | "install" | "usage" | "etc";

export const MEMO_ISSUE_CATEGORY_LABEL: Record<MemoIssueCategory, string> = {
  payment: "결제 문제",
  pos: "포스 문제",
  device: "장비 문제",
  install: "설치 문제",
  // 고장이 아니라 물어보는 건이라 "문제"가 아닌 "문의"로 둔다.
  usage: "사용법 문의",
  etc: "기타",
};

export const MEMO_ISSUE_CATEGORIES = Object.keys(MEMO_ISSUE_CATEGORY_LABEL) as MemoIssueCategory[];

export type MemoResolution = "phone" | "guide" | "remote" | "onsite" | "unresolved";

export const MEMO_RESOLUTION_LABEL: Record<MemoResolution, string> = {
  phone: "전화 안내",
  guide: "가이드 발송",
  remote: "원격 지원",
  onsite: "현장 출장",
  unresolved: "미해결",
};

export const MEMO_RESOLUTIONS = Object.keys(MEMO_RESOLUTION_LABEL) as MemoResolution[];

// "원격 해결률"에 포함하는 값 — 현장 출동 없이 끝난 건.
export const REMOTE_RESOLUTIONS: MemoResolution[] = ["phone", "guide", "remote"];

export interface MerchantMemoEntry {
  id: string;
  content: string;
  created_at: string;
  created_by: string | null;
  author_name: string | null;
  stage: MerchantMemoStage;
  entry_type: "as" | "claim" | "general" | "etc";
  checklist: Record<string, boolean> | null;
  // 117번 마이그레이션 적용 전에는 select에서 빠질 수 있어 옵셔널로 둔다.
  issue_category?: MemoIssueCategory | null;
  resolution?: MemoResolution | null;
  is_repeat?: boolean | null;
}

export type MerchantEquipmentStatus = "installed" | "as" | "removed";

export const MERCHANT_EQUIPMENT_STATUS_LABEL: Record<MerchantEquipmentStatus, string> = {
  installed: "설치됨",
  as: "AS 중",
  removed: "철거",
};

export type MerchantEquipmentCategory = "main_pos" | "kiosk" | "table_order" | "etc";

export const MERCHANT_EQUIPMENT_CATEGORY_LABEL: Record<MerchantEquipmentCategory, string> = {
  main_pos: "메인포스",
  kiosk: "키오스크",
  table_order: "테이블오더",
  etc: "기타",
};

export type MerchantEquipmentSource = "manual" | "application";

export interface MerchantEquipmentItem {
  id: string;
  name: string;
  serial_number: string | null;
  status: MerchantEquipmentStatus;
  installed_date: string | null;
  notes: string | null;
  created_at: string;
  // 114번 마이그레이션 적용 전에는 select에서 이 컬럼들이 빠질 수 있어 옵셔널로 둔다.
  category?: MerchantEquipmentCategory;
  quantity?: number;
  components?: string | null;
  manufacturer?: string | null;
  supplier?: string | null;
  location?: string | null;
  source?: MerchantEquipmentSource;
}

export type MerchantOperationStatus = "active" | "paused" | "terminated";

export const MERCHANT_OPERATION_STATUS_LABEL: Record<MerchantOperationStatus, string> = {
  active: "정상운영",
  paused: "일시중지",
  terminated: "해지",
};

export const MERCHANT_OPERATION_STATUS_CLASS: Record<MerchantOperationStatus, string> = {
  active: "bg-emerald-50 text-emerald-600",
  paused: "bg-amber-50 text-amber-600",
  terminated: "bg-slate-100 text-slate-500",
};

export interface Merchant360Merchant {
  id: string;
  business_name: string;
  owner_name: string;
  phone: string;
  address: string | null;
  address_detail: string | null;
  business_number?: string | null;
  open_date?: string | null;
  toss_merchant_no?: string | null;
  contract_expires_at?: string | null;
  brand?: string | null;
  created_at: string;
  franchise_application_id?: string | null;
  // 목록 화면 전용 파생 필드 — 연결된 가맹접수의 channel 라벨 (merchants/page.tsx에서 채움)
  channel_label?: string | null;
  // 113번 마이그레이션 적용 전에는 select에서 이 컬럼들이 빠질 수 있어 옵셔널로 둔다.
  operation_status?: MerchantOperationStatus;
  contract_started_at?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  install_note?: string | null;
  // 117번 마이그레이션 적용 전에는 select에서 빠질 수 있어 옵셔널로 둔다.
  van_company?: string | null;
}

export interface Merchant360Application {
  status: string;
  status_label: string;
  status_class: string;
  channel_label: string | null;
  cs_name: string | null;
  tech_name: string | null;
  internet: string | null;
  van_company: string | null;
  program: string | null;
  case_type: string | null;
}

/** 요약 헤더/설치정보 카드에 표시할, 여러 테이블에서 계산한 파생값 모음. */
export interface MerchantDerivedSummary {
  /** 설치 완료(installation_activity_logs.to_status IN completed/delivery_sent) 최초 시각 */
  firstInstalledAt: string | null;
  /** 완료 시각이 2건 이상일 때만 값을 가진다. 1건 이하면 null. */
  lastReinstalledAt: string | null;
  /** 계약 시작일~만료일 개월수. 둘 중 하나라도 없으면 null. */
  contractMonths: number | null;
  /** 제거되지 않은 장비의 총 세트 수 (merchant_equipment.quantity 합계) */
  totalEquipmentSets: number;
  /** installations(AS) / tickets(AS) / merchant_memo_entries(AS) 중 가장 최근 시각 */
  lastAsAt: string | null;
  /** 가장 최근 install/transfer installation */
  latestInstallation: {
    status: string;
    statusLabel: string;
    statusClass: string;
    assigneeName: string | null;
    deliveryType: string | null;
  } | null;
}

export interface MerchantEquipmentCategorySummary {
  category: MerchantEquipmentCategory;
  totalQuantity: number;
  componentsSummary: string;
}

export const MERCHANT_EQUIPMENT_SUMMARY_CATEGORIES: MerchantEquipmentCategory[] = [
  "main_pos",
  "kiosk",
  "table_order",
];

/**
 * merchant_equipment 행을 카테고리별로 묶어 [B] 설치 구성 요약 카드에 쓸 합계를 만든다.
 * 순수 함수라 서버 로더(loadMerchant360.ts)와 클라이언트 컴포넌트(InstallsClient.tsx)가
 * 모두 import해서 쓴다 — 서버 전용 import(@/lib/supabase/server)에 의존하지 않기 위해
 * 이 파일(merchant360.ts)에 둔다.
 */
export function computeEquipmentCategorySummaries(
  equipment: MerchantEquipmentItem[],
): MerchantEquipmentCategorySummary[] {
  const active = equipment.filter((item) => item.status !== "removed");
  return MERCHANT_EQUIPMENT_SUMMARY_CATEGORIES.map((category) => {
    const rows = active.filter((item) => (item.category ?? "etc") === category);
    const totalQuantity = rows.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
    const componentsSummary = rows
      .map((item) => item.components || item.name)
      .filter(Boolean)
      .join(" + ");
    return { category, totalQuantity, componentsSummary };
  });
}
