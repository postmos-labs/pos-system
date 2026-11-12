# 기술지원 이관 최종 승인 — CS 팀장만

현장 문의(CS 팀장 이명진): CS(박상준)가 올린 이관은 본인 승인을 거쳐야 하는데, 라온타운경주는 승인하지 않았는데 이관됐다.

## 원인

박상준은 CS책임이라 요청 시 1차가 자동 처리되고 바로 팀장 최종 단계로 간다. 최종 승인 조건이 `approval_role = team_lead` 하나뿐이라 기술지원·영업 팀장도 승인할 수 있었고, 라온타운경주는 기술지원 전병준 팀장이 승인했다(11-12 09:14). 지코바 신문점은 이명진이 승인.

## 결정

- 이관 최종 승인·반려는 `approval_role = team_lead` 이면서 `role`이 `cs` 또는 `master`인 사람만. 판단은 `src/lib/auth/transferApproval.ts`의 `canFinalApproveTransferBy` 하나로.
- 같은 함수를 쓰는 곳: 승인함 이관 목록(`approvals/page.tsx`), 가맹접수 승인 버튼·내 업무 필터(`FranchiseClient.tsx`), 서버 `approveFranchiseTransfer`·`rejectFranchiseTransfer`, 최종 승인 요청 알림 대상(요청·CS책임 1차 승인 두 곳).
- 기술지원·영업 팀장은 승인함에 이관 건이 안 보이고, 서버에서도 거절. 이관 요청 자체는 그대로 가능(요청 권한은 안 바꿈).
- 마스터라도 approval_role이 없으면(예: 대표 계정) 대상이 아니다 — 필요하면 직원 관리에서 승인 직책을 팀장으로 지정.
- 설치 단계 승인(기술지원 쪽)은 직급 기준이라 이번 변경과 무관.
