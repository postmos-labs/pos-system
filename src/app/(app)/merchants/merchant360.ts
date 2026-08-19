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

export interface MerchantEquipmentItem {
  id: string;
  name: string;
  serial_number: string | null;
  status: MerchantEquipmentStatus;
  installed_date: string | null;
  notes: string | null;
  created_at: string;
}

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
}

export interface Merchant360Application {
  status: string;
  status_label: string;
  status_class: string;
  reception_channel: string | null;
  cs_name: string | null;
  tech_name: string | null;
  internet: string | null;
  van_company: string | null;
}
