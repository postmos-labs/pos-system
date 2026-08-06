# 가맹점 누적 메모 결정사항

## 2026-08-06

- 최신 마이그레이션 번호가 `101`이므로 `102_merchant_memo_entries.sql`을 테이블/RLS용으로 만들고, 기존 `merchants.memo` 이관은 `103_merchant_memo_entries_backfill.sql`로 분리한다.
- `merchants.memo` 컬럼은 삭제하지 않는다. 화면의 단일 메모 필드는 제거하고, 누적 입력은 `merchant_memo_entries` 별도 행으로 저장한다.
- 기존 memo에는 실제 작성 시각이 없으므로 backfill 시 `merchants.created_at`을 최초 메모의 `created_at`으로 사용한다. 이관 전후 분류가 일부 추정값이 될 수 있는 한계는 SQL 주석에 남긴다.
- 메모 분류는 저장 시점에 고정하지 않고 360도 뷰 조회 시 계산한다. 연결된 installations가 없거나 전부 `rejected`면 `memo_before`, 유효한 설치 행이 있고 메모 시각이 설치 행 생성 시각 이후이면서 완료 경계 전이면 `memo_after_transfer`, 완료 최초 로그 이후면 `memo_after_completion`으로 분류한다.
- 완료 경계는 `installation_activity_logs`에서 해당 installation의 `to_status`가 `completed` 또는 `delivery_sent`인 로그 중 가장 이른 `created_at`을 사용한다. 로그가 없으면 완료 경계가 없는 것으로 보고 이관 후 메모로 분류한다.
- 설치 상태가 나중에 변경되거나 완료 로그가 추가되면 같은 메모의 분류도 다음 조회에서 자연스럽게 바뀐다.
- `merchant_memo_entries`가 아직 없는 환경에서는 조회 오류를 빈 배열로 처리하고, 등록 액션은 저장을 건너뛰되 화면 전체가 실패하지 않도록 한다.

## 적용 경계

- `102`와 `103` SQL은 생성만 한다. dev/운영 Supabase에 연결하거나 실행하지 않는다.
- 실제 적용 순서는 `102_merchant_memo_entries.sql` → `103_merchant_memo_entries_backfill.sql`이다.
