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
}

export interface Merchant360Merchant {
  id: string;
  business_name: string;
  owner_name: string;
  phone: string;
  address: string | null;
  address_detail: string | null;
  created_at: string;
  franchise_application_id?: string | null;
}
