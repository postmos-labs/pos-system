// 가맹접수 → 기술지원 이관의 팀장 최종 승인 권한.
// 이관은 CS 업무라 CS 소속 팀장(그리고 마스터)만 최종 승인한다. 기술지원·영업 팀장도 approval_role이
// team_lead라 예전엔 누구나 승인할 수 있었는데, CS 팀장이 모르는 사이 이관되는 일이 생겨 막았다.
// 승인함 목록·가맹접수 버튼(화면)과 승인·반려 서버 액션, 알림 대상이 모두 이 함수를 쓴다.
export const TRANSFER_FINAL_APPROVER_ROLES = ["cs", "master"] as const;

export function canFinalApproveTransferBy(profile: {
  role?: string | null;
  approval_role?: string | null;
}) {
  return (
    profile.approval_role === "team_lead" &&
    (TRANSFER_FINAL_APPROVER_ROLES as readonly string[]).includes(profile.role ?? "")
  );
}
