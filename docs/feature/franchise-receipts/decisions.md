# 의사결정 로그

날짜는 논의 시점 기준.

## 2026-07-28

- **접수채널 3축 분리**: 채널(직접영업/토스리드) / 구분(신규/전환/승계/명변) / 옵션(랜탈/할부)로 분리하기로 함.
  기존 9개 값이 이 세 축을 뒤섞어놓은 것이었음.
- **`transfer`라는 이름 사용 금지**: `franchise_transfer_approvals`(기술지원 이관 워크플로우)와 이름이
  겹쳐서 혼동을 유발하므로, 전환/승계/명변 구분 필드에는 `case_type` 같은 다른 이름을 씀.
- **랜탈/할부는 동시 선택 가능**해야 함 (boolean 2개로 확정, 사용자 확인 완료).
- **레거시 데이터 자동 매핑 안 함**: "그건 애들마다 달라서 확인이 필요할듯" — 기존 `reception_channel`
  단독값(예: '랜탈', '전환', '승계')만으로는 새 채널이 무엇이었는지 알 수 없어서, 자동 매핑 규칙을 만들지
  않기로 함. (이후 07-28 추가 결정으로, 아예 레거시 컬럼 자체를 안 건드리는 쪽으로 더 단순화됨 — 아래 참조)
- **별도 lineage 테이블 만들지 않음**: 처음엔 `lineage_id` 자기참조 체인을 제안했으나, 이미 `merchants`
  테이블이 매장 앵커 역할(tickets/contact_logs/install_blueprints 전부 `merchant_id` 참조)을 하고 있다는
  걸 확인하고 방향 전환. `merchants`를 "현재 상태 스냅샷"으로, `franchise_applications`를 "시점별 이력"으로
  역할 분리하는 쪽으로 확정.
  - 사용자 피드백: "이건 내 생각인데 따로 table 생성해서... 근데 별개면 이제 쌓이는곳을 다 찾아야할것
    같은데" — 새 테이블을 따로 만들면 오히려 앵커가 두 개가 되어 혼란이 커진다는 데 동의.
- **매장 생성/갱신은 DB 트리거로 이관**: 지금은 클라이언트 코드 여러 곳(`FranchiseClient.tsx`,
  `TransfersClient.tsx`)에서 각자 `autoRegisterMerchant()`를 호출하는 구조라, 일괄 상태변경 같은 경로가
  빠지는 문제가 실제로 발견됨. `franchise_applications.status`가 `card_done`/`toss_review_done`으로
  바뀌는 시점에 DB 트리거가 무조건 처리하도록 바꿔서 이런 종류의 누락을 구조적으로 차단하기로 함.
- **매칭은 자동화하지 않고 수동 검색**: 사업자번호도 명변 시 바뀌는 값이라 자동 매칭 키로 못 씀. 전환/승계/
  명변은 접수 시점에 사람이 검색해서 `merchant_id`를 직접 지정하는 방식으로 확정.
- **변경 이력은 별도 diff 저장 없이 조회 시 계산**: `merchant_id`로 묶인 `franchise_applications`를
  시간순 나열한 것 자체가 이력이 되도록 설계. 화면에서 인접 항목을 비교해 diff를 그때그때 계산.
- **도면(install_blueprints)은 스키마 변경 불필요**: 이미 `merchant_id` 기준 다건 저장 가능한 구조임을
  확인.
- **오픈준비/운영중 상태는 저장하지 않고 파생값으로 계산**: `merchants.open_date`를 새로 추가하고,
  화면에서 오늘 날짜와 비교해서 계산.

## 확인된 기존 코드 감사 결과 (참고용, [flow.md](./flow.md)의 "현재 매장 생성 경로 감사" 참조)

- 실제로 살아있는 매장 생성 경로는 `autoRegisterMerchant()` 하나뿐이고, 나머지(`createLinkedInstallTicket`,
  `InstallsClient.tsx`의 주석 처리된 블록, `set_franchise_status_silent` RPC)는 전부 죽은 코드.
- 일괄 상태변경(`handleBulkStatusChange`)은 매장 등록 로직을 아예 안 타서, 여러 건을 한번에
  카드가맹완료로 바꾸면 매장이 생성되지 않는 버그가 있음.

## 2026-07-28 (추가 수정)

- **변경 이력은 "작업 단위" 자체에 명시적으로 저장, 계산식 diff 아님**: 처음엔 "화면에서 인접한 두
  `franchise_applications`를 비교해 diff를 그때그때 계산"하는 방식을 제안했으나, 사용자 피드백으로 정정함.
  - 사용자 피드백: "변경 이력이 그 memo나 log 테이블이 아니라... 예를들면 작업단위로 명변했다
    (ㅇㅇㅇ→ㅇㅇㅇ) 이런식으로 알아야하는거지" — 즉 로그를 뒤지거나 이전 건과 비교 계산해서 유추하는 게
    아니라, 그 접수 건(작업 단위) 자체가 "무엇에서 무엇으로 바뀌었는지"를 스스로 데이터로 갖고 있어야 함.
  - 확정안: `franchise_applications.previous_snapshot` (JSONB)에 merchant 연결 시점의 이전 값을
    스냅샷으로 저장. 새 값은 그 접수 건 자신의 컬럼에 이미 있으므로, `previous_snapshot` vs 본인 컬럼만
    비교하면 그 건 하나로 "명변 · 김OO → 이OO"를 즉시 알 수 있음. 자세한 내용은 [db-schema.md](./db-schema.md)
    의 "previous_snapshot" 절 참조.

## 2026-07-28 (브랜치 확인 + additive-only 확정)

- **기존 `feat/franchise-receipts` 브랜치 발견**: develop에 merge 안 된 상태로 이미 실질적인 작업이
  진행되어 있었음 (같은 계정, 오늘 날짜 커밋) — `codes` 공통코드 테이블, `reception_channel_code`/
  `case_type_code`/`option_code`, `original_application_id`(application→application 직접 참조 방식),
  `van_company` 배열화, soft delete(`deleted_at`), `updated_by/updated_at` 자동 트리거, memo 정규화
  (`franchise_application_memos`), 죽은 코드 삭제, 마이그레이션 `090_franchise_receipts_restructure.sql`
  까지 이미 커밋됨. 이번 대화의 설계(`merchant_id` + `previous_snapshot` 기반)와 목적은 같지만 갈라진
  별도 접근.
  - 사용자 결정: **그 브랜치는 그대로 두고, `develop`에서 새 `feat/franchise-merchant-link` 브랜치로
    이번 설계를 별도 진행.** 두 설계가 당분간 공존하며, 나중에 병합 시점에 직접 조율 필요(마이그레이션
    번호 090 충돌 포함 — 이번 브랜치는 번호를 나중에 다시 매길 수 있음을 감안).
- **DB 변경은 순수 추가(additive-only)로 확정**: "무리하게 table의 속성값을 변경하진말자... 운영단계
  레벨이라 공수가 너무 많이 들고 인력투입이 좀 빡인듯" — 기존 `reception_channel` 컬럼을 rename/reset하고
  레거시 백업 컬럼을 만드는 방식(`legacy_reception_channel`)은 폐기. 대신 새 컬럼(`channel`, `case_type`,
  `is_rental`, `is_installment`, `merchant_id`, `previous_snapshot`)만 추가하고 기존 컬럼은 전혀 안 건드림.
  과거 row는 새 컬럼이 `NULL`인 채로 남아도 회귀 없음 (트리거가 `merchant_id` 유무로만 동작하므로 지금과
  동일하게 동작). "정리 필요" 화면도 이번 마이그레이션의 필수 조건에서 제외됨.

## 2026-07-28 (레거시 데이터 백필, 090 dev 적용 후)

- `090_franchise_receipts_merchant_link.sql`(현재는 `091_franchise_receipts_merchant_link.sql`로
  재번호됨 — 아래 2026-07-29 항목 참고)을 dev DB에 적용 완료.
- 사용자가 "table 말고 data"도 마이그레이션해야 하지 않냐고 확인 — 스키마 추가만 하고 데이터 백필이
  없었던 걸 짚음. `092_franchise_receipts_data_backfill.sql`(당시 파일명 `091_...`) 작성:
  - **명확하게 매핑 가능한 값만 백필**, 애매한 건 그대로 NULL로 남김 (자동 매핑 안 하기로 한 원래 결정과
    모순 아님 — "전부 다 매핑"이 아니라 "확실한 것만 매핑"으로 범위를 좁힌 것)
  - `merchant_id`: 기존 `merchants.franchise_application_id`(059 마이그레이션에서 만든 관계)를
    역방향으로 채움 — 이미 있는 관계를 뒤집는 것뿐이라 모호함 없음
  - `case_type`: `reception_channel`이 `'전환'`/`'승계'`/`'명변'`이면 그대로 매핑. `'토스 홈페이지'`/
    `'직접 영업'`/`'토스리드건'`/`'토스프리미엄'`은 소거법으로 `'new'`
  - `channel`: 채널 계열 값(토스 관련 3종 → `toss_lead`, 직접 영업 → `direct_sales`)만 채움.
    `'전환'`/`'승계'`/`'명변'`/`'랜탈'`/`'할부'`는 채널 정보 자체가 없는 값이라 계속 `NULL`
  - `is_rental`/`is_installment`: `reception_channel`이 정확히 `'랜탈'`/`'할부'`였던 row만 `TRUE`
  - 번호는 090이 이미 dev에 적용된 뒤라 091로 이어붙임 (이미 적용된 마이그레이션 파일은 사후 수정 안 함)

## 2026-07-29 (배포 전 번호 재확인 — 090 충돌 발견)

- 배포 전 재검토 중 `supabase/090_calendar_events_category_as_migration.sql`이 이미 `develop`/`main`에
  존재한다는 걸 발견 (커밋 `675a6e9`, 이 브랜치를 따기 전부터 있던 파일). 세션 시작 시 "089가 마지막"으로
  잘못 확인해서 090을 그대로 써버린 것.
- dev DB에는 이미 옛 파일명(`090_franchise_receipts_merchant_link.sql`,
  `091_franchise_receipts_data_backfill.sql`) 그대로 적용됐으므로 **SQL 실행 결과는 그대로 유효** —
  파일만 리네임: `090_franchise_receipts_merchant_link.sql` → `091_franchise_receipts_merchant_link.sql`,
  `091_franchise_receipts_data_backfill.sql` → `092_franchise_receipts_data_backfill.sql`.
- 운영(prod) DB에 적용할 때는 새 파일명(091/092) 기준으로 안내.

## 미결 (다음 세션에서 이어갈 것)

- [ ] "기존 완료 건 검색해서 불러오기" UI 구체 설계 (검색 조건, 필드 프리필 방식, source 연결 UX)
- [ ] `channel`/`case_type` 등 최종 필드명·enum 값 확정
- [ ] 실제 마이그레이션 작성 및 dev DB 적용 — 번호는 `feat/franchise-receipts`의 090과 겹치지 않게 나중에
      조율 (지금은 `feat/franchise-merchant-link` 브랜치 안에서만 임시로 090 사용 가능, merge 전 재번호 필요)
- [ ] `FranchiseClient.tsx`/`FranchiseCreateDialog.tsx`의 `RECEPTION_CHANNELS` 배열 교체 + 폼 UI 반영
- [ ] 죽은 코드 정리: `createLinkedInstallTicket`, `InstallsClient.tsx` 주석 블록, `set_franchise_status_silent`
- [ ] 언젠가 `feat/franchise-receipts`와 이 브랜치를 어떻게 조율/병합할지 결정 필요
