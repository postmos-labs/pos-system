# 가맹접수(franchise-receipts) 프로세스 재설계

## 2026-08-06 대형 가맹점 분리

- `franchise_applications.is_large_franchise`를 additive 방식의 영구 boolean 플래그로 추가한다.
- 기본 가맹접수 조회는 `is_large_franchise = false`만 가져오고, `/large-franchises`는 같은 fetch와
  클라이언트 화면을 재사용하면서 `is_large_franchise = true`만 조회한다.
- 확인일 색상 정렬 열의 별 토글은 DB 플래그를 변경해 두 목록 사이에서 행을 이동시키며, 즉시 반응을
  위해 로컬 목록도 함께 갱신한다.
- 확인일은 기존 초록/노랑/빨강 severity를 날짜 텍스트에 적용하고 severity 1~3에서만 반짝인다.

> 현재 이 문서는 설계 논의와 구현 흐름을 함께 기록합니다.
> 관련 코드: `src/app/(app)/franchise/FranchiseClient.tsx`, `FranchiseCreateDialog.tsx`, `src/lib/franchiseStatusEffects.ts`

## 배경 (현재 문제)

1. 접수채널(`reception_channel`)에 성격이 다른 값 9개가 한 컬럼에 섞여 있음
   (`토스 홈페이지`, `직접 영업`, `전환`, `토스리드건`, `토스프리미엄`, `승계`, `명변`, `랜탈`, `할부`)
   - 실제로는 3가지 다른 축이 뒤섞인 것: **채널**(직접영업/토스), **구분**(신규/전환/승계/명변), **옵션**(랜탈/할부)
2. DB에 한글 자유문자열로 저장되어 있어 코드값 정규화가 안 되어 있음
3. 전환/승계/명변 접수 시 "기존 완료 건에서 무엇이 바뀌었는지" 추적할 방법이 없음
4. 매장(merchant) 자동 등록 로직에 구멍이 많음 (아래 "현재 매장 생성 경로 감사" 참조)

## 현재 매장 생성 경로 감사 (2026-07-28 기준)

실제로 살아있는 경로는 단 하나:

- `autoRegisterMerchant()` (`src/lib/franchiseStatusEffects.ts:120`) — 가맹접수 `status`를 사람이
  **개별로** `card_done`(카드가맹완료) 또는 `toss_review_done`(토스심사완료)으로 바꿀 때만 실행됨
  - 호출부: `FranchiseClient.tsx:1751` (개별 상태변경), `TransfersClient.tsx:605` (이관 페이지 상태변경)
  - 중복 체크는 `franchise_application_id` 동일 여부만 봄 → 같은 매장이 다른 접수 건으로 다시 들어오면 무조건 새 merchant 생성됨

죽어있는 경로 (정리 대상, 이번 작업과 별개로 삭제 필요):

- `createLinkedInstallTicket()` (`franchiseStatusEffects.ts:62`) — 어디서도 호출 안 됨
- `InstallsClient.tsx:849`의 `autoRegisterMerchant` 호출 — 설치완료 처리 블록 전체가 주석 처리되어 있음
- `set_franchise_status_silent` RPC (`supabase/027_franchise_silent_status_update_migration.sql`) — 코드에서 호출 안 함
- **일괄 상태변경**(`handleBulkStatusChange`, `FranchiseClient.tsx:1996`)은 `applyFranchiseStatusSideEffects`를 아예 안 불러서, 여러 건을 한번에 `card_done`으로 바꾸면 매장이 생성되지 않음

## 새 구조

### 접수 정보를 3개 축으로 분리

| 축   | 컬럼(가칭)                    | 값                                                                          | 비고                                                                                     |
| ---- | ----------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 채널 | `reception_channel`           | `direct_sales`(직접영업) / `toss_lead`(토스리드)                            | 2개로 단순화                                                                             |
| 구분 | `case_type`                   | `new`(신규) / `conversion`(전환) / `succession`(승계) / `name_change`(명변) | `transfer`라는 단어는 기술지원 이관(`franchise_transfer_approvals`)과 겹치므로 사용 금지 |
| 옵션 | `is_rental`, `is_installment` | boolean                                                                     | 랜탈/할부 동시 선택 가능 (다중 체크박스로 확정)                                          |

`case_type ≠ new`인 경우 접수 시점에 검색 UI로 기존 `merchants`를 찾아 `merchant_id`를 지정한다 (아래 참조).

### 매장(merchants) = "현재 상태 스냅샷", franchise_applications = "시점별 이력"

핵심 원칙: **새 테이블을 만들지 않는다.** 이미 `merchants`가 `tickets`/`contact_logs`/`install_blueprints`/`/merchants/[id]` 페이지에서
매장 앵커 역할을 하고 있으므로, 여기에 통합한다.

- `franchise_applications.merchant_id` (nullable FK → merchants) 추가
- **생성/갱신 시점**: `franchise_applications.status`가 `card_done` 또는 `toss_review_done`으로 바뀌는 순간, DB 트리거로 처리
  (클라이언트 코드 여러 곳에서 각자 호출하던 지금 방식은 "일괄변경은 매장 생성 안 됨" 같은 구멍을 반복 생산하므로 폐기)
  - `merchant_id`가 비어있으면(신규 건) → merchant 신규 insert 후 `franchise_applications.merchant_id`에 채움
  - `merchant_id`가 이미 있으면(전환/승계/명변 건, 접수 시점에 미리 연결됨) → 해당 merchant row를 최신 값으로 UPDATE (덮어쓰기)
- **매칭 기준**: 자동 매칭 안 함. 사업자번호도 명변 시 바뀌는 값이라 자동 매칭 키로 쓸 수 없음.
  전환/승계/명변은 접수 시점에 사람이 검색(상호명/대표자/연락처/주소)해서 merchant를 직접 선택.
- **덮어쓰는 필드**: `business_name`, `owner_name`, `business_number`, `phone`, `address`, `address_detail`,
  `pos_model`(장비 요약, `equipment_items`로부터 재계산), `open_date`, `memo`, `sales_id`
- **변경 이력은 "작업 단위" 자체에 명시적으로 저장**: 화면에서 이전 건과 비교해 계산(diff)하는 방식은 채택하지
  않음. 대신 전환/승계/명변 접수 건을 만드는 시점(=merchant를 검색해서 연결하는 바로 그 순간)에, 그 merchant의
  **현재 값을 스냅샷으로 떠서 새 접수 건 자체에 저장**한다 (`previous_snapshot` JSONB). 그래서 접수 건 하나만
  봐도 "명변 · 김OO → 이OO" 처럼 무엇이 바뀐 작업인지 계산 없이 바로 드러남. 자세한 컬럼 설계는
  [db-schema.md](./db-schema.md) 참조.
- **도면**: `install_blueprints`가 이미 `merchant_id` 기준 다건 저장 가능 (스키마 변경 불필요). 전환/승계 때 도면이
  바뀌면 새로 등록하거나 기존 것을 수정하며, 옛 도면을 지우지 않으면 자연히 이력처럼 남음.

### 오픈준비 / 운영중 상태

- `merchants.open_date` 컬럼 신설 (현재 `merchants`에는 없고 `franchise_applications`에만 있음)
- 완료 시마다 최신 `open_date`로 덮어씀
- 상태는 저장하지 않고 화면에서 계산: `open_date`가 없거나 오늘보다 미래 → "오픈준비", 지났으면 → "운영중"
- 휴업/폐업 같은 수동 상태는 이번 스코프에서 제외 (필요해지면 별도 override 컬럼 추가)

## 기존 데이터(레거시) 처리

- 기존 `reception_channel` 원본 텍스트는 `legacy_reception_channel`에 보존, 새 `reception_channel`/`case_type`은 `NULL`로 시작
- 자동 매핑 안 함 — 건별로 확인이 필요하다고 확인됨 (예: '랜탈'/'전환'/'승계' 단독 값만으로는 채널을 알 수 없음)
- 프랜차이즈 목록에 "정리 필요"(신규 필드 비어있는 건) 필터를 추가해서 담당자가 화면에서 건별로 채워넣을 수 있게 함

## "매장 운영 이력" 화면과 "불러오기" UI는 사실상 같은 것

`/merchants/[id]`(현재는 티켓 이력만 보여줌)를 아래 내용을 포함하도록 확장한다:

- **현재 설치 기기**: merchant의 최신 `pos_model`
- **최근 작업 이력**: `merchant_id`로 묶인 `franchise_applications`(접수 이력) + `tickets`(설치 작업)을
  시간순으로 나열 — 새 테이블 없이 이미 있는 데이터로 구성 가능
- **도면/완료사진**: `install_blueprints` (이미 `merchant_id` 연결됨)

전환/승계/명변 접수의 "기존 건 불러오기" UI는 이 화면의 데이터를 그대로 재사용한다:

"불러오기"는 두 단계로 나뉜다 — `merchants`는 설치기기/VAN사/인터넷/사업자유형/담당자 같은
접수 전용 필드를 갖고 있지 않으므로, 검색과 프리필의 소스 테이블이 다르다.

1. **매장 검색** (소스: `merchants`) — 상호명/대표자/연락처로 검색해서 물리적 매장(=`merchant_id`) 식별
2. **필드 프리필** (소스: 해당 `merchant_id`로 연결된 `franchise_applications` 중 최신 1건,
   `ORDER BY created_at DESC LIMIT 1`) — `merchants`엔 없는 설치기기/VAN사/인터넷/사업자유형/담당자 등
   전부 여기서 가져옴. `merchants`는 검색용 식별자 + 화면 표시용 요약(현재 기기 요약/오픈일)만 담당.
3. 담당자가 바뀐 부분만 수정해서 제출
4. **프리필했던 값이 곧 `previous_snapshot`이 됨** — "불러오기"와 "이전 값 스냅샷 기록"은 같은 동작의
   앞/뒤일 뿐이라, 제출 시점에 다시 조회할 필요 없이 폼을 열 때 이미 들고 있던 값을 그대로
   `previous_snapshot`에 저장하면 된다.

→ 이 구조라서 `merchants`에 접수 전용 필드를 추가로 옮겨 담을 필요가 없고, 새 테이블도 필요 없다.

## 남은 미결정 사항

- [ ] 정확한 컬럼/enum 이름 최종 확정 (`case_type` 등은 가칭)
- [ ] "기존 완료 건 검색해서 불러오기" UI의 구체적인 화면/인터랙션 설계
- [ ] `is_rental`/`is_installment` vs 배열 컬럼 — 2개뿐이라 boolean 2개 제안, 추가 옵션 생길 가능성 있으면 배열 재검토
