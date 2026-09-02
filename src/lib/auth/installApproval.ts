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
