import { positionRank } from "@/types";

// 설치완료 승인 단계 — 팀장(1차) → 실장(최종).
//
// 예전에는 승인 직책(approval_role)의 tech_responsible → team_lead로 갈렸는데,
// 직급(대표·상무·실장·팀장·팀원)이 생기면서 조직 서열과 어긋나 관리가 두 벌이 됐다.
// 이제 직급 하나로 판정한다. 승인 직책은 가맹접수 이관 등 다른 흐름에서 계속 쓰인다.
//
// 실장보다 위(상무·대표)도 최종 승인을 할 수 있다. 결재가 사람 한 명 부재로 멈추지
// 않게 하기 위함이다. 다만 최종 승인자는 1차를 대신하지 않는다 — 두 단계가 한 사람에게
// 몰리면 검토가 형식이 되기 때문이다.
export const FIRST_APPROVAL_POSITION = "팀장";
export const FINAL_APPROVAL_POSITION = "실장";

/** 1차 승인 담당 — 팀장만. 실장급 이상은 최종 승인을 맡으므로 여기서 제외한다. */
export function canApproveFirst(position?: string | null): boolean {
  const rank = positionRank(position);
  return (
    rank >= positionRank(FIRST_APPROVAL_POSITION) && rank < positionRank(FINAL_APPROVAL_POSITION)
  );
}

/** 최종 승인(실장급 이상) 가능 여부 */
export function canApproveFinal(position?: string | null): boolean {
  return positionRank(position) >= positionRank(FINAL_APPROVAL_POSITION);
}

/** 요청자가 실장급 이상이면 1차를 건너뛰고 최종 승인 대기로 올린다. */
export function skipsFirstApproval(position?: string | null): boolean {
  return canApproveFinal(position);
}

// ── 강제완료(승인 절차 없이 바로 완료) ───────────────────────────────────────
//
// 승인 판정을 approval_role에서 직급으로 옮길 때(d0a760a) 기존 데이터를 옮기지 않아,
// 직급이 비어 있거나 "팀장"으로 지정된 사람이 강제완료 권한을 통째로 잃었다.
// 예전 approval_role의 team_lead가 최종 승인자였는데 직급 축의 최종 승인은 실장이라,
// 같은 "팀장"이라는 말이 다른 등급을 가리키게 된 탓이다.
//
// 강제완료는 팀장급 이상으로 되돌린다. 다만 그대로 두면 팀장이 자기가 1차 승인해야 할
// 건을 강제완료로 끝내버려 "팀장 1차 → 실장 최종" 분리가 무의미해지므로,
// 이미 승인 요청이 올라온 건은 팀장급의 강제완료를 막는다(blocksForceComplete).

export type ApprovalActor = { role?: string | null; position?: string | null };

/**
 * 직급과 무관하게 결재를 풀 수 있는 계정.
 * 직급 지정이 빠지면 판정이 전부 0점이 되어 아무도 결재를 못 푸는 잠금 상태가 되는데,
 * 그때 되돌릴 사람이 하나는 있어야 한다.
 */
export function isApprovalOverrider(role?: string | null): boolean {
  return role === "master" || role === "admin";
}

/** 최종 승인 권한자인지 — 직급 판정에 관리자 안전망을 더한 것. */
export function canApproveFinalBy(actor: ApprovalActor): boolean {
  return isApprovalOverrider(actor.role) || canApproveFinal(actor.position);
}

/** 강제완료 가능 여부 — 팀장급 이상. 단 건별 제한은 blocksForceComplete로 따로 본다. */
export function canForceCompleteBy(actor: ApprovalActor): boolean {
  return (
    isApprovalOverrider(actor.role) ||
    positionRank(actor.position) >= positionRank(FIRST_APPROVAL_POSITION)
  );
}

/** 강제완료로 건너뛰면 안 되는 승인 상태 — 이미 결재가 돌고 있는 단계. */
export const FORCE_COMPLETE_BLOCKING_STATUSES = ["requested", "responsible_approved"];

/**
 * 이 건을 강제완료로 처리하면 안 되는지.
 * 실장급 이상(과 관리자)은 최종 승인 권한이 있어 제한하지 않는다.
 * 팀장급은 이미 승인 요청이 올라온 건을 강제완료로 건너뛸 수 없다.
 *
 * 화면의 버튼 노출 조건과 서버 가드가 이 함수 하나를 함께 쓴다 — 갈라지면
 * "버튼은 보이는데 누르면 에러"가 된다.
 */
export function blocksForceComplete(actor: ApprovalActor, approvalStatus?: string | null): boolean {
  if (canApproveFinalBy(actor)) return false;
  return FORCE_COMPLETE_BLOCKING_STATUSES.includes(approvalStatus ?? "");
}
