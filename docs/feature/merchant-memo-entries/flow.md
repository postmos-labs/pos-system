# 가맹점 메모 분류 흐름

```text
메모 등록
  └─ addMerchantMemo(merchant_id, content)
       └─ merchant_memo_entries INSERT

360도 뷰 조회
  ├─ merchant_memo_entries 조회
  ├─ franchise_application_id로 installations 전체 조회
  ├─ installation_activity_logs에서 completed/delivery_sent 최초 시각 조회
  └─ 메모 created_at과 경계 시각 비교
       ├─ 설치 행 없음/전부 rejected → memo_before
       ├─ 이관 후·완료 경계 전 → memo_after_transfer
       └─ 완료 최초 시각 이후 → memo_after_completion
```

분류값은 저장하지 않고 매 조회마다 계산한다. 따라서 설치 상태가 변경되거나 완료 활동 로그가 추가되어도 과거 메모가 현재 업무 흐름에 맞는 탭으로 이동한다.

## 2026-08-06 current audit

- Already present and reused: `102_merchant_memo_entries.sql`, `103_merchant_memo_entries_backfill.sql`, and `addMerchantMemo()` in `merchants/actions.ts`.
- Added: the merchant 360 query now defensively reads `merchant_memo_entries` with a `profiles` author join, recalculates stages from installations/activity logs, and returns an empty memo list when the new table is unavailable.
- Added: the client now renders memo history as an independent section with a separate input, newest-first entries, timestamp/author text, and a stage badge; work-history tabs remain independent.
