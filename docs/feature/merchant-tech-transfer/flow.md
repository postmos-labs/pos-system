# 기술지원 이관 → 가맹점 생성 흐름

```text
팀장 최종 승인
  └─ approveFranchiseTransfer()
       ├─ 신규: installations INSERT (status = received)
       └─ 재이관: rejected installation UPDATE (status = received)
             └─ AFTER INSERT OR UPDATE OF status 트리거
                  ├─ franchise_application_id로 franchise_applications 조회
                  ├─ 기존 merchant 연결 조회
                  ├─ 없으면 merchants INSERT
                  ├─ 있으면 merchants UPDATE
                  └─ franchise_applications.merchant_id 역참조 갱신
```

`card_done` 또는 `toss_review_done` 상태 변경만으로는 더 이상 `merchants`가 생성되지 않는다. 설치/배송 이후 히스토리와 업무 이력 통합 조회는 생성된 `merchant_id`를 기준으로 동작한다.

## 검증 경계

- 새 트리거는 SQL 파일만 작성하고 실행하지 않는다.
- TypeScript는 기존 승인 액션의 입력값 주석과 dead code 제거만 반영한다.
- 로컬 UI 검증에서는 승인/이관 화면이 렌더링되는지 확인할 수 있지만, 실제 `merchants` 생성은 새 마이그레이션을 적용하기 전까지 확인 대상이 아니다.

## 2026-08-06 current audit

- Already complete in `supabase/101_merchant_sync_on_tech_transfer.sql`: the legacy `091` trigger/function is removed, and the replacement listens to `installations` INSERT plus `rejected -> received` status updates.
- Already complete in `src/app/(app)/approvals/actions.ts`: `approveFranchiseTransfer()` supplies the installation fields needed by the tech workflow and documents that nullable application fields are re-read by the trigger.
- No change: `autoTransferToTech()` has no live definition/call, and merchant list/detail queries do not assume `card_done` or `toss_review_done`.
