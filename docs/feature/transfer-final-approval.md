# 기술지원 이관 최종 승인 — CS 팀장만

현장 문의(CS 팀장 이명진): CS(박상준)가 올린 이관은 본인 승인을 거쳐야 하는데, 라온타운경주는 승인하지 않았는데 이관됐다.

## 원인

박상준은 CS책임이라 요청 시 1차가 자동 처리되고 바로 팀장 최종 단계로 간다. 최종 승인 조건이 `approval_role = team_lead` 하나뿐이라 기술지원·영업 팀장도 승인할 수 있었고, 라온타운경주는 기술지원 전병준 팀장이 승인했다(11-12 09:14). 지코바 신문점은 이명진이 승인.

## 결정

- 이관 최종 승인·반려는 `approval_role = team_lead` 이면서 `role`이 `cs` 또는 `master`인 사람만. 판단은 `src/lib/auth/transferApproval.ts`의 `canFinalApproveTransferBy` 하나로.
- 같은 함수를 쓰는 곳: 승인함 이관 목록(`approvals/page.tsx`), 가맹접수 승인 버튼·내 업무 필터(`FranchiseClient.tsx`), 서버 `approveFranchiseTransfer`·`rejectFranchiseTransfer`, 최종 승인 요청 알림 대상(요청·CS책임 1차 승인 두 곳).
- 기술지원·영업 팀장은 승인함에 이관 건이 안 보이고, 서버에서도 거절. 이관 요청 자체는 그대로 가능(요청 권한은 안 바꿈).
- 마스터라도 approval_role이 없으면(예: 대표 계정) 대상이 아니다 — 필요하면 직원 관리에서 승인 직책을 팀장으로 지정.
- 설치 단계 승인(기술지원 쪽)은 아래 "짝" 항목에서 기술지원 소속으로 따로 묶었다.

## 짝: 설치 단계 승인은 기술지원 소속만

- 설치 단계 1차(팀장)·강제완료는 직급만 봐서 CS 팀장이 설치 1차를 누를 수 있었다. 이관과 반대 방향의 같은 문제라 함께 막았다.
- 최종 승인(실장 이상)은 "실장 승인은 실장이 다 할 수 있어야 한다"는 결정으로 소속 무관(실장·상무·대표). 처음엔 기술지원으로 묶었다가 되돌렸다.
- `installApproval.ts`의 `canApproveFirstBy`·`canForceCompleteBy`에 `role = tech` 조건 추가(관리자·마스터 안전망 유지). 화면·서버가 모두 이 함수를 써서 한 번에 맞춰진다. 승인 요청 알림 대상도 `INSTALL_APPROVER_ROLES`(tech·master·admin)로 제한.
- 물품요청 결재(`canDecideSupplyRequest`)는 직급 판정을 그대로 쓰도록 분리해 두었다(최종 승인 판정과 지금은 결과가 같다).
