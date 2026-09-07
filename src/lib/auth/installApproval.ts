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

/**
 * 요청자가 팀장급 이상이면 1차를 건너뛰고 최종 승인 대기로 올린다.
 *
 * 예전에는 실장급 이상만 건너뛰었는데, 팀장이 직접 올린 건은 1차 승인 담당(팀장)과
 * 요청자가 같은 사람이 된다. 요청자 본인 승인은 막혀 있으므로 다른 팀장이 없으면
 * "requested"에서 영영 멈추고(실장은 1차를 대신하지 않는다) 재요청도 막힌다.
 * 팀장 요청 건은 처음부터 최종 승인 대기로 올려 이 잠금을 없앤다 — 검토는
 * 요청자(팀장) 한 번, 실장 최종 한 번으로 두 단계가 그대로 유지된다.
 */
export function skipsFirstApproval(position?: string | null): boolean {
  return positionRank(position) >= positionRank(FIRST_APPROVAL_POSITION);
}

// ── 강제완료(승인 절차 없이 바로 완료) ───────────────────────────────────────
//
// 승인 판정을 approval_role에서 직급으로 옮길 때(d0a760a) 기존 데이터를 옮기지 않아,
// 직급이 비어 있거나 "팀장"으로 지정된 사람이 강제완료 권한을 통째로 잃었다.
// 예전 approval_role의 team_lead가 최종 승인자였는데 직급 축의 최종 승인은 실장이라,
// 같은 "팀장"이라는 말이 다른 등급을 가리키게 된 탓이다.
//
// 강제완료는 팀장급 이상이면 된다. 승인 요청이 이미 올라온 건도 막지 않는다 — 현장이 끝난
// 뒤 결재만 남아 며칠씩 지연되는 걸 푸는 게 이 기능의 목적인데, 승인 요청이 있을 때만 잠기면
// 정작 필요한 상황에서 못 쓴다. 대신 강제완료가 대기 중이던 요청을 함께 닫아
// (completeInstallationByTeamLead) 결재 기록이 붕 뜨지 않게 한다.

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

/**
 * 1차 승인 권한자인지 — 직급 판정에 관리자 안전망을 더한 것.
 * 팀장이 한 명도 없으면 "requested" 건을 아무도 못 푸는데, 관리자는 그때 풀 수 있어야 한다.
 * 화면(버튼 노출)과 서버 액션 가드가 이 함수를 함께 써야 한다.
 */
export function canApproveFirstBy(actor: ApprovalActor): boolean {
  return isApprovalOverrider(actor.role) || canApproveFirst(actor.position);
}

/** 강제완료 가능 여부 — 팀장급 이상. 승인 대기 여부와 무관하다. */
export function canForceCompleteBy(actor: ApprovalActor): boolean {
  return (
    isApprovalOverrider(actor.role) ||
    positionRank(actor.position) >= positionRank(FIRST_APPROVAL_POSITION)
  );
}

/** 아직 결재가 돌고 있는 승인 상태. */
export const PENDING_APPROVAL_STATUSES = ["requested", "responsible_approved"];

/**
 * 지금 새 승인요청을 올릴 수 없는 상태인지.
 *
 * 대기 중 요청이 하나라도 있으면 서버가 중복 요청을 거절한다
 * (requestInstallationStatusApproval — 중복 행이 생기면 승인 조회가 깨진다).
 * 실장급 이상(과 관리자)은 승인요청 대신 바로 처리하는 경로가 따로 있어 막지 않는다.
 *
 * 화면의 버튼 비활성 조건과 서버 동작이 이 함수 하나를 기준으로 맞춰져야 한다 — 갈라지면
 * "버튼은 보이는데 누르면 에러"가 된다.
 */
export function blocksApprovalRequest(
  actor: ApprovalActor,
  approvalStatus?: string | null,
): boolean {
  if (canApproveFinalBy(actor)) return false;
  return PENDING_APPROVAL_STATUSES.includes(approvalStatus ?? "");
}
