export type WorkHistoryCategory = "reception" | "install" | "as" | "change" | "post";

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

export interface Merchant360Merchant {
  id: string;
  business_name: string;
  owner_name: string;
  phone: string;
  address: string | null;
  address_detail: string | null;
  memo: string | null;
  created_at: string;
  franchise_application_id?: string | null;
}
