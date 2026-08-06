export type Role = "master" | "admin" | "sales" | "cs" | "tech" | "developer";
export type ApprovalRole =
  | "cs_manager"
  | "cs_responsible"
  | "tech_manager"
  | "tech_responsible"
  | "team_lead"
  | "developer"
  | "test_account";
export type Team = "sales" | "cs" | "tech" | "dev";

export type TicketStatus =
  | "sales"
  | "cs_pending"
  | "cs_progress"
  | "scheduled"
  | "tech_pending"
  | "in_progress"
  | "done"
  | "canceled";

export type TicketType = "install" | "as" | "consult" | "other";
export type Priority = "low" | "normal" | "high" | "urgent";

export type FranchiseStatus =
  | "info_input"
  | "doc_waiting"
  | "doc_incomplete"
  | "card_apply_done"
  | "internet_apply_done"
  | "card_internet_apply_done"
  | "card_done"
  | "internet_done"
  | "toss_review_apply_done"
  | "toss_review_done"
  | "completed"
  | "hold"
  | "persistent_absence"
  | "canceled";
export type ApplicantType = "corporate" | "individual" | "giga_corporate" | "giga_individual";

export interface Profile {
  id: string;
  name: string;
  phone?: string;
  role: Role;
  team?: Team;
  approval_role?: ApprovalRole | null;
  can_delete?: boolean;
  created_at: string;
}

export type MerchantOpenStatus = "preparing" | "operating";

export interface Merchant {
  id: string;
  business_name: string;
  owner_name: string;
  business_number?: string;
  phone: string;
  address?: string;
  address_detail?: string;
  pos_model?: string;
  open_date?: string;
  service_type?: string;
  memo?: string;
  sales_id?: string;
  franchise_application_id?: string;
  created_at: string;
  updated_at: string;
  sales?: Profile;
}

export interface Ticket {
  id: string;
  merchant_id: string;
  title: string;
  type: TicketType;
  status: TicketStatus;
  priority: Priority;
  scheduled_at?: string;
  sales_id?: string;
  cs_id?: string;
  tech_id?: string;
  memo?: string;

  business_type?: string;
  reception_channel?: string;
  progress_note?: string;
  document_status?: string;
  open_date?: string;
  install_date?: string;
  internet?: string;
  product?: string;
  card_apply_date?: string;
  van_company?: string;
  baemin_apply?: boolean;
  simple_payment?: string;
  created_at: string;
  updated_at: string;
  merchant?: Merchant;
  sales?: Profile;
  cs?: Profile;
  tech?: Profile;
}

export interface TicketLog {
  id: string;
  ticket_id: string;
  user_id?: string;
  from_status?: string;
  to_status?: string;
  message?: string;
  created_at: string;
  user?: Profile;
}

export interface ContactLog {
  id: string;
  ticket_id?: string;
  merchant_id?: string;
  user_id?: string;
  method?: "call" | "kakao" | "visit" | "other";
  content: string;
  created_at: string;
  user?: Profile;
}

export interface EquipmentItem {
  name: string;
  quantity: number;
}

export type FranchiseChannel = "direct_sales" | "toss_lead";
export type FranchiseCaseType = "new" | "conversion" | "succession" | "name_change";

export interface FranchisePreviousSnapshot {
  business_name?: string;
  owner_name?: string;
  business_number?: string;
  phone?: string;
  address?: string;
  address_detail?: string;
  applicant_type?: ApplicantType;
  title?: string;
  van_company?: string;
  internet?: string;
  equipment_items?: EquipmentItem[];
  sales_id?: string;
  cs_id?: string;
}

export interface FranchiseApplication {
  id: string;
  business_name?: string;
  owner_name?: string;
  phone?: string;
  business_number?: string;
  equipment?: string;
  equipment_items?: EquipmentItem[];
  address?: string;
  address_detail?: string;
  title?: string;
  reception_channel?: string;
  channel?: FranchiseChannel;
  case_type?: FranchiseCaseType;
  is_rental?: boolean;
  is_installment?: boolean;
  is_large_franchise?: boolean;
  merchant_id?: string | null;
  previous_snapshot?: FranchisePreviousSnapshot | null;
  reception_date?: string;
  card_apply_date?: string;
  open_date?: string;
  install_date?: string;
  van_company?: string;
  internet?: string;
  program?: string;
  sales_id?: string;
  cs_id?: string;
  tech_id?: string;
  created_by?: string;
  status: FranchiseStatus;
  applicant_type: ApplicantType;
  change_type?: string;
  doc_template?: string;
  memo?: string;
  next_check_date?: string | null;
  sort_order?: number | null;
  equipment_select_token?: string;
  selected_equipment?: string[];
  equipment_selected_at?: string;
  created_at: string;
  updated_at: string;
  sales?: Profile;
  cs?: Profile;
  tech?: Profile;
  creator?: Profile;
}

export interface WooCustomer {
  id: string;
  received_date?: string;
  manager?: string;
  category?: string;
  business_name?: string;
  owner_name?: string;
  business_number?: string;
  phone?: string;
  internet_type?: string;
  internet_note?: string;
  internet_open_date?: string;
  card_apply_date?: string;
  card_apply_status?: string;
  easy_payment?: string;
  pos_install_date?: string;
  install_schedule_note?: string;
  setting?: string;
  open_date?: string;
  van_company?: string;
  pos_program?: string;
  product?: string;
  address?: string;
  memo?: string;
  sort_order?: number | null;
  created_at: string;
  updated_at: string;
}

export interface InternetManagement {
  id: string;
  franchise_application_id?: string | null;
  business_name?: string;
  apply_date?: string;
  open_date?: string;
  status?: string;
  category?: string;
  carrier?: string;
  speed?: string;
  addon?: string;
  gift?: string;
  owner_name?: string;
  phone?: string;
  region?: string;
  monthly_fee?: string;
  install_fee?: string;
  memo?: string;
  sort_order?: number | null;
  created_at: string;
  updated_at: string;
}

export interface FranchiseApplicationLog {
  id: string;
  franchise_application_id: string;
  user_id?: string;
  user_name?: string;
  from_status?: string;
  to_status?: string;
  details?: Record<string, unknown>;
  created_at: string;
  user?: Profile;
}

export interface Notification {
  id: string;
  user_id: string;
  ticket_id?: string;
  franchise_application_id?: string;
  type: string;
  title: string;
  body?: string;
  is_read: boolean;
  created_at: string;
  ticket?: Ticket;
}

export const STATUS_LABEL: Record<TicketStatus, string> = {
  sales: "영업 접수",
  cs_pending: "CS 대기",
  cs_progress: "CS 진행중",
  scheduled: "일정 확정",
  tech_pending: "배정완료",
  in_progress: "작업중",
  done: "완료",
  canceled: "취소",
};

export const STATUS_COLOR: Record<TicketStatus, string> = {
  sales: "bg-gray-100 text-gray-700",
  cs_pending: "bg-yellow-100 text-yellow-700",
  cs_progress: "bg-blue-100 text-blue-700",
  scheduled: "bg-indigo-100 text-indigo-700",
  tech_pending: "bg-orange-100 text-orange-700",
  in_progress: "bg-purple-100 text-purple-700",
  done: "bg-green-100 text-green-700",
  canceled: "bg-red-100 text-red-700",
};

export const TYPE_LABEL: Record<TicketType, string> = {
  install: "신규 설치",
  as: "A/S",
  consult: "상담",
  other: "기타",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "낮음",
  normal: "보통",
  high: "높음",
  urgent: "긴급",
};

export const PRIORITY_COLOR: Record<Priority, string> = {
  low: "bg-gray-100 text-gray-600",
  normal: "bg-blue-100 text-blue-600",
  high: "bg-orange-100 text-orange-600",
  urgent: "bg-red-100 text-red-600",
};

export const FRANCHISE_STATUS_LABEL: Record<FranchiseStatus, string> = {
  info_input: "정보입력",
  doc_waiting: "서류대기",
  doc_incomplete: "서류미비",
  card_apply_done: "카드가맹접수완료",
  internet_apply_done: "인터넷접수완료",
  card_internet_apply_done: "카드,인터넷접수완료",
  card_done: "카드가맹완료",
  internet_done: "인터넷 가입완료",
  toss_review_apply_done: "토스심사접수완료",
  toss_review_done: "토스심사완료",
  completed: "완료",
  hold: "보류",
  persistent_absence: "지속적 부재",
  canceled: "취소",
};

export const FRANCHISE_STATUS_COLOR: Record<FranchiseStatus, string> = {
  info_input: "bg-slate-100 text-slate-700 border-slate-200",
  doc_waiting: "bg-[#ff0000] text-[#ffffff] border-[#ff0000]",
  doc_incomplete: "bg-red-100 text-red-700 border-red-200",
  card_apply_done: "bg-sky-100 text-sky-700 border-sky-200",
  internet_apply_done: "bg-cyan-100 text-cyan-700 border-cyan-200",
  card_internet_apply_done: "bg-teal-100 text-teal-700 border-teal-200",
  card_done: "bg-indigo-100 text-indigo-700 border-indigo-200",
  internet_done: "bg-blue-100 text-blue-700 border-blue-200",
  toss_review_apply_done: "bg-lime-100 text-lime-700 border-lime-200",
  toss_review_done: "bg-green-100 text-green-700 border-green-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  hold: "bg-gray-100 text-gray-700 border-gray-200",
  persistent_absence: "bg-orange-100 text-orange-700 border-orange-200",
  canceled: "bg-rose-100 text-rose-700 border-rose-200",
};

export const FRANCHISE_CHANNEL_LABEL: Record<FranchiseChannel, string> = {
  direct_sales: "직접 영업",
  toss_lead: "토스 리드",
};

export const FRANCHISE_CASE_TYPE_LABEL: Record<FranchiseCaseType, string> = {
  new: "신규",
  conversion: "전환",
  succession: "승계",
  name_change: "명변",
};

export const APPLICANT_TYPE_LABEL: Record<ApplicantType, string> = {
  individual: "개인 사업자",
  corporate: "법인 사업자",
  giga_individual: "기가맹 개인 사업자",
  giga_corporate: "기가맹 법인 사업자",
};

export type ChangeType = "bank" | "name" | "ceo" | "address" | "category";
export type ChangeRequestStatus = "waiting_docs" | "docs_incomplete" | "done";
export type ChangeApplicantType = "individual" | "corporate";

export interface ChangeRequest {
  id: string;
  merchant_id?: string;
  business_name: string;
  owner_name?: string;
  phone?: string;
  business_number?: string;
  applicant_type: ChangeApplicantType;
  change_type: ChangeType;
  before_value?: string;
  after_value?: string;
  reception_date?: string;
  payment_received: boolean;
  status: ChangeRequestStatus;
  memo?: string;
  sales_id?: string;
  cs_id?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  sales?: Profile;
  cs?: Profile;
  creator?: Profile;
}

export const CHANGE_TYPE_LABEL: Record<ChangeType, string> = {
  bank: "통장변경",
  name: "상호변경",
  ceo: "대표자변경",
  address: "주소변경",
  category: "업종변경",
};

export const CHANGE_APPLICANT_TYPE_LABEL: Record<ChangeApplicantType, string> = {
  individual: "개인사업자",
  corporate: "법인사업자",
};

export const CHANGE_STATUS_LABEL: Record<ChangeRequestStatus, string> = {
  waiting_docs: "서류대기",
  docs_incomplete: "서류미비",
  done: "접수완료",
};

export const CHANGE_STATUS_COLOR: Record<ChangeRequestStatus, string> = {
  waiting_docs: "bg-yellow-100 text-yellow-700",
  docs_incomplete: "bg-red-100 text-red-700",
  done: "bg-emerald-100 text-emerald-700",
};

export interface CustomerLedger {
  id: string;
  record_date: string;
  manager_id: string | null;
  manager_name: string | null;
  business_name: string;
  phone: string | null;
  issue: string | null;
  solution: string | null;
  created_at: string;
}
