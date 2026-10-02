/**
 * 가맹접수 한 건의 기술지원 이관 진행 상태.
 * 이관 승인(franchise_transfer_approvals.status)과 연결 설치건(installations.status)을 함께 본다 —
 * 팀장 승인 뒤 기술지원이 설치건을 반려해도 승인 기록은 "approved"로 남기 때문이다.
 */
export type TransferApprovalStatus =
  "requested" | "cs_responsible_approved" | "approved" | "rejected";

export type TransferState =
  | "none"
  | "cs_waiting"
  | "team_lead_waiting"
  | "approval_rejected"
  | "tech_rejected"
  | "check_needed"
  | "transferred"
  | "install_completed";

export function resolveTransferState(
  approvalStatus: TransferApprovalStatus | null | undefined,
  installStatus: string | null | undefined,
): TransferState {
  if (installStatus && installStatus !== "rejected")
    return installStatus === "completed" ? "install_completed" : "transferred";
  if (approvalStatus === "requested") return "cs_waiting";
  if (approvalStatus === "cs_responsible_approved") return "team_lead_waiting";
  if (approvalStatus === "rejected") return "approval_rejected";
  if (installStatus === "rejected") return "tech_rejected";
  // 승인은 끝났는데 설치건이 없다. 이관 액션은 설치건 생성에 실패하면 승인을 되돌리므로 정상 흐름에선 생기지 않는다.
  if (approvalStatus === "approved") return "check_needed";
  return "none";
}

const AMBER = "border-amber-200 bg-amber-50 text-amber-700";
const RED = "border-red-200 bg-red-50 text-red-700";
const EMERALD = "border-emerald-200 bg-emerald-50 text-emerald-700";

export const TRANSFER_STATE_BADGE: Record<
  Exclude<TransferState, "none">,
  { label: string; className: string; hint: string }
> = {
  cs_waiting: {
    label: "CS책임 승인대기",
    className: AMBER,
    hint: "기술지원 이관 승인요청 — CS책임 1차 승인 대기",
  },
  team_lead_waiting: {
    label: "팀장 승인대기",
    className: AMBER,
    hint: "팀장 최종 승인 대기",
  },
  approval_rejected: {
    label: "이관 반려",
    className: RED,
    hint: "이관 승인요청이 반려됨 — 상세에서 다시 승인요청",
  },
  tech_rejected: {
    label: "기술지원 반려",
    className: RED,
    hint: "기술지원에서 설치건을 반려함 — 상세에서 다시 승인요청",
  },
  check_needed: {
    label: "이관 확인 필요",
    className: "border-orange-200 bg-orange-50 text-orange-700",
    hint: "승인은 완료됐지만 연결된 설치건이 없음 — 새로고침 후에도 보이면 관리자 확인",
  },
  transferred: { label: "기술지원 이관됨", className: EMERALD, hint: "기술지원으로 이관됨" },
  install_completed: { label: "설치완료", className: EMERALD, hint: "기술지원 설치 완료" },
};
