# 가맹접수 기술지원 이관 — 팀장 승인요청 허용

## 배경

- 이관 승인 흐름은 CS매니저 요청 → CS책임 1차 승인 → 팀장 최종 승인
- 승인요청은 `approval_role`이 `cs_manager`·`cs_responsible`인 사람만 가능해, 팀장 계정이 요청하면 "CS매니저 또는 CS책임만 등록할 수 있습니다" 경고가 뜸

## 결정

- 팀장이 요청하면 CS책임 1차 승인을 건너뛰고 바로 `cs_responsible_approved`(팀장 최종 승인 대기)로 올림
- 팀장은 본인이 올린 건도 직접 최종 승인할 수 있음 (CS책임 1차 승인 단계의 요청자 본인 승인 불가 규칙은 그대로). 팀장이 최종 승인자라 두 번째 승인자가 없어도 막히지 않게 함. 요청·승인 기록은 모두 남음. 처음에는 다른 팀장 승인을 필수로 했으나, 현장에서 CS 팀장이 요청 후 본인이 바로 승인하려는데 버튼이 없어 이관이 막혀 변경(긴급)
- 팀장 요청 건은 `cs_approved_by`·`cs_approved_by_name`·`cs_approved_at`을 null로 둠 (CS책임이 승인한 것이 아니며 KPI 집계도 이 값을 읽음)
- "CS책임 1차 승인" 로그(`transfer_cs_responsible_approved`)는 남기지 않고 `transfer_approval_requested` 로그만 남김
- 새 상태값·마이그레이션 없음 (DB CHECK 제약 변경 없음)

## 영향 파일

- `src/app/(app)/approvals/actions.ts` — `requestFranchiseTransfer`, `approveFranchiseTransfer`, `rejectFranchiseTransfer`
- `src/app/(app)/approvals/page.tsx` — 승인함에 팀장 본인 요청 건 표시
- `src/app/(app)/franchise/FranchiseClient.tsx` — 요청 권한 안내, 단건·일괄 요청 처리, 비고 입력 문구
- `src/app/(app)/franchise/transferState.ts` — 팀장 승인대기 안내 문구

## 선례

- `src/lib/auth/installApproval.ts`의 `skipsFirstApproval` — 요청자와 승인 담당이 같은 사람이 되는 잠금을 요청 단계 건너뛰기로 해결한 방식과 동일
