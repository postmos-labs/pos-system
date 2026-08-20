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

export interface MerchantMemoEntry {
  id: string;
  content: string;
  created_at: string;
  created_by: string | null;
  author_name: string | null;
  stage: MerchantMemoStage;
  entry_type: "as" | "claim" | "general" | "etc";
  checklist: Record<string, boolean> | null;
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
  // 113번 마이그레이션 적용 전에는 select에서 이 컬럼들이 빠질 수 있어 옵셔널로 둔다.
  operation_status?: MerchantOperationStatus;
  contract_started_at?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  install_note?: string | null;
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
