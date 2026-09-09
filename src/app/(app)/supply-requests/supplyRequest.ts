import { canApproveFinalBy, type ApprovalActor } from "@/lib/auth/installApproval";

// 물품요청 — 직원이 필요한 소모품·비품을 올리고 실장급 이상이 승인하는 게시판.
// 상태 라벨은 DB CHECK(supabase/145)와 같이 간다. 한쪽만 바꾸면 저장이 실패한다.

export const SUPPLY_REQUEST_STATUSES = ["요청", "승인", "반려", "구매중", "수령완료"] as const;
export type SupplyRequestStatus = (typeof SUPPLY_REQUEST_STATUSES)[number];

export const SUPPLY_STATUS_STYLE: Record<SupplyRequestStatus, string> = {
  요청: "bg-amber-100 text-amber-700",
  승인: "bg-emerald-100 text-emerald-700",
  반려: "bg-red-100 text-red-700",
  구매중: "bg-blue-100 text-blue-700",
  수령완료: "bg-slate-100 text-slate-600",
};

export interface SupplyRequest {
  id: string;
  item_name: string;
  quantity: number;
  unit: string | null;
  description: string | null;
  /** YYYY-MM-DD */
  needed_by: string | null;
  is_urgent: boolean;
  requester_id: string | null;
  requester_name: string | null;
  requester_team: string | null;
  status: SupplyRequestStatus;
  approver_id: string | null;
  approver_name: string | null;
  approved_at: string | null;
  /** 반려 사유나 "다음 주 도착" 같은 처리 안내 */
  approver_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplyRequestInput {
  item_name: string;
  quantity: number;
  unit: string;
  description: string;
  needed_by: string;
  is_urgent: boolean;
}

/**
 * 승인·반려·구매중·수령완료를 누를 수 있는 사람 — 실장급 이상(실장·상무·대표).
 * 설치 최종 승인과 같은 직급 판정을 쓰고, 직급이 비어 결재가 멈추지 않도록 admin·master는 항상 된다.
 * 본인이 올린 요청도 본인이 승인할 수 있다(결재 한 단계, 금액 작음).
 */
export function canDecideSupplyRequest(actor: ApprovalActor): boolean {
  return canApproveFinalBy(actor);
}

/** 요청자가 내용을 고치거나 지울 수 있는 상태 — 승인이 나기 전까지만 */
export function isEditableByRequester(status: SupplyRequestStatus): boolean {
  return status === "요청" || status === "반려";
}
