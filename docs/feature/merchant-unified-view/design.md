# 가맹점 통합정보 구현 설계

대상 화면: `/merchants/[id]` (신규 전폭 페이지). 결정 배경은 [decisions.md](./decisions.md).

## 1. 화면 구조

```
AppHeader breadcrumb: 가맹점 / 통합정보
────────────────────────────────────────────────────────────
[A] 요약 헤더        상호명 + 사업자번호/대표자 + 상태·프로그램 뱃지
                     | 최초 설치일 | 계약기간 | 설치 구성 | 최근 A/S |   (KPI 4장)
[B] 설치 구성 요약   메인포스 / 키오스크 / 테이블오더 / 총 설치 구성  (카드 4장)
[C] 설치 구성 상세   설치구분·구성·수량·제조사/공급사·설치위치·비고  (표 + 편집)
[D] 2단 그리드       좌: 기본정보(수정)      우: 설치정보(수정)
[E] 2단 그리드       좌: 계약조건(수정)      우: 빠른 업무
[F] 메모 히스토리    기존 /merchants 우측 패널에서 이동
[G] 관련 업무 이력   기존 /merchants 우측 패널에서 이동 (탭 필터 유지)
```

- 서버 컴포넌트가 데이터를 모두 로드하고, 편집이 필요한 섹션만 클라이언트 컴포넌트로 분리한다.
- `[A]` KPI 카드는 기존 `@/components/ui/KpiCard`를 먼저 확인하고 맞으면 재사용한다.
- `[B]`~`[E]` 카드 스타일은 `MerchantsClient.tsx`의 `rounded-2xl border border-slate-200 bg-white`
  패턴을 따른다. 새 디자인 토큰을 만들지 않는다.

## 2. 필드 매핑

### [A] 요약 헤더

| 목업 항목               | 출처                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 상호명                  | `merchants.business_name`                                                                                                                                 |
| 사업자번호 · 대표자     | `merchants.business_number`, `merchants.owner_name`                                                                                                       |
| 상태 뱃지 (정상운영)    | `merchants.operation_status` **(신규)**                                                                                                                   |
| 프로그램 뱃지 (토스POS) | `franchise_applications.program` (링크 없으면 뱃지 숨김)                                                                                                  |
| 최초 설치일             | 파생 — `installation_activity_logs` 중 `to_status IN ('completed','delivery_sent')`인 가장 이른 시각                                                      |
| 계약기간                | 파생 — `contract_started_at` **(신규)** ~ `contract_expires_at` 개월수, 한쪽이라도 없으면 `-`                                                             |
| 설치 구성               | 파생 — `SUM(merchant_equipment.quantity) WHERE status <> 'removed'`                                                                                       |
| 최근 A/S                | 파생 — 아래 세 소스의 최신 시각<br>`installations.delivery_type = 'as'`, `tickets.type = 'as' AND merchant_id`, `merchant_memo_entries.entry_type = 'as'` |

### [B] 설치 구성 요약

`merchant_equipment`를 `category`로 묶는다(`status <> 'removed'`만 집계).

| 카드         | category      | 큰 숫자              | 부제                                               |
| ------------ | ------------- | -------------------- | -------------------------------------------------- |
| 메인포스     | `main_pos`    | `SUM(quantity)` 세트 | 해당 카테고리 행들의 `components`를 `,`로 이어붙임 |
| 키오스크     | `kiosk`       | 〃                   | 〃                                                 |
| 테이블오더   | `table_order` | 〃                   | 〃                                                 |
| 총 설치 구성 | 전체          | 전체 합              | `현재 가맹점 설치 기준` 고정 문구                  |

`etc` 카테고리는 요약 카드에 별도 자리를 만들지 않고 총합에만 포함한다(목업과 동일).

### [C] 설치 구성 상세

`merchant_equipment` 행 = 표 1행. 컬럼: `category` 라벨 / `components` / `quantity`세트 /
`manufacturer` + `/` + `supplier` / `location` / `notes`.
행 추가·수정·삭제 가능. 시리얼 단위 관리가 필요한 행은 기존 `serial_number`, `installed_date`,
`status`를 상세 편집 모달에서 그대로 유지한다.

### [D] 기본정보 / 설치정보

기본정보(모두 편집 가능, `updateMerchantInfo` 확장):
`business_name`, `business_number`, `owner_name`, `phone`, `address` + `address_detail`,
담당자 = `contact_name` **(신규)** + `contact_phone` **(신규)**, 사용 프로그램(읽기 전용, 접수에서 파생).

설치정보(특이사항만 편집):

| 항목          | 출처                                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 최초 설치일   | `[A]`와 동일 파생값                                                                                                                            |
| 최근 재설치일 | 완료 시각이 2건 이상일 때 가장 최근 값, 1건 이하면 `-`                                                                                         |
| 설치 담당자   | 최신 `install`/`transfer` installation의 `assignee.name`                                                                                       |
| 설치 상태     | 최신 installation `status` → 기존 `installationStatusLabel()` 재사용                                                                           |
| 설치 유형     | `franchise_applications.case_type` (`new`/`conversion`/`succession`/`name_change`) → 신규 설치/전환/승계/명의변경. 없으면 `delivery_type` 기준 |
| 특이사항      | `merchants.install_note` **(신규)** — 유일한 편집 필드                                                                                         |

### [E] 계약조건 / 빠른 업무

계약조건: 계약 시작일(`contract_started_at`), 계약 종료일(`contract_expires_at`),
계약기간(파생), 토스 가맹점번호(`toss_merchant_no`), VAN사(`franchise_applications.van_company`),
인터넷(`franchise_applications.internet`). 앞 3개만 편집 가능.

빠른 업무 버튼 → 이동만 한다.

| 버튼           | 이동                                                            |
| -------------- | --------------------------------------------------------------- |
| A/S 접수       | `/installs`                                                     |
| 장비 추가출고  | `/installs/delivery`                                            |
| 변경 접수      | `/changes`                                                      |
| 접수 원본 보기 | `/franchise?id=<franchise_application_id>` (링크 없으면 비활성) |

## 3. DB 변경

`supabase/`에 113번부터 이어 붙인다. 컬럼 추가 위주이며 삭제·타입 변경은 없다.
dev Supabase에서 먼저 적용해 확인한 뒤 운영에 반영한다(`docs/dev-environment.md`).

### 113_merchant_unified_view_fields.sql

```sql
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS operation_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS contract_started_at DATE,
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS install_note TEXT;

DO $$ BEGIN
  ALTER TABLE merchants ADD CONSTRAINT merchants_operation_status_check
    CHECK (operation_status IN ('active', 'paused', 'terminated'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

라벨: `active` 정상운영 / `paused` 일시중지 / `terminated` 해지.

### 114_merchant_equipment_composition.sql

```sql
ALTER TABLE merchant_equipment
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'etc',
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS components TEXT,
  ADD COLUMN IF NOT EXISTS manufacturer TEXT,
  ADD COLUMN IF NOT EXISTS supplier TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
-- CHECK 제약(category IN main_pos/kiosk/table_order/etc, quantity > 0,
-- source IN manual/application)은 113과 같은 DO $$ 패턴으로 추가

CREATE INDEX IF NOT EXISTS merchant_equipment_category_idx
  ON merchant_equipment (merchant_id, category);

DROP POLICY IF EXISTS "authenticated delete merchant equipment" ON merchant_equipment;
CREATE POLICY "authenticated delete merchant equipment"
  ON merchant_equipment FOR DELETE TO authenticated USING (TRUE);
```

DELETE 정책이 없어 지금은 구성 행 삭제가 막혀 있다. 표에서 행 삭제를 지원하려면 필요하다.

### 115_merchant_equipment_seed_from_application.sql

`sync_merchant_on_tech_transfer()`를 `CREATE OR REPLACE`로 확장해, merchants upsert 직후
아래 매핑으로 `merchant_equipment`에 `source = 'application'` 행을 삽입한다.

| category      | equipment_items 이름                                               |
| ------------- | ------------------------------------------------------------------ |
| `main_pos`    | 포스기, 토스프론트, 영수증프린터, 주방프린터기, 무선단말기, 금전함 |
| `kiosk`       | 키오스크, 키오스크리더기                                           |
| `table_order` | 테이블오더, 태블릿, 보조배터리                                     |
| `etc`         | 인터넷, 원격, 그 외                                                |

- `quantity`(세트 수) = 카테고리 대표 품목 수량 — `main_pos`는 포스기, `kiosk`는 키오스크,
  `table_order`는 테이블오더(없으면 태블릿). 대표 품목이 없으면 카테고리 내 최대 수량.
- `components` = 해당 카테고리 품목명을 `+`로 이어붙인 문자열.
- 가드: `EXISTS (SELECT 1 FROM merchant_equipment WHERE merchant_id = v_merchant_id
AND source = 'application')`이면 아무것도 하지 않는다(재이관 시 수기 수정본 보존).
- 이 함수는 `SECURITY DEFINER`여야 `created_by = auth.uid()` INSERT 정책에 걸리지 않는다.
  기존 함수 정의를 확인하고, 아니라면 `created_by`를 NULL로 두고 INSERT 정책을 함께 손본다.
  **적용 전 이 두 가지를 반드시 dev에서 확인할 것.**

## 4. 코드 작업

### 4-1. 데이터 로더 추출 (선행 필수)

현재 `loadMerchant360()`이 `src/app/(app)/merchants/page.tsx` 안에 있다.
`src/app/(app)/merchants/loadMerchant360.ts`로 **그대로 옮기고 export**한 뒤,
목록 페이지와 `[id]` 페이지가 함께 쓴다. 이 단계에서는 동작을 바꾸지 않는다.

옮긴 뒤 다음을 추가한다.

- `merchants` select에 `operation_status, contract_started_at, contact_name, contact_phone, install_note`
- `franchise_applications` select에 `program, case_type`
- `merchant_equipment` select에 `category, quantity, components, manufacturer, supplier, location, source`
- AS 소스 조회 추가: `installations`(`delivery_type = 'as'`), `tickets`(`type = 'as'`),
  `merchant_memo_entries`(`entry_type = 'as'`) → `lastAsAt` 하나로 축약
- 파생값 계산 함수: `firstInstalledAt`, `lastReinstalledAt`, `contractMonths`,
  `equipmentSummaryByCategory`, `latestInstallation`
- `merchant_equipment` / `merchant_memo_entries` 조회는 기존처럼 테이블 부재
  (`42P01`/`PGRST205`)를 빈 배열로 흡수하는 처리를 유지한다. 마이그레이션 미적용 환경에서
  새 컬럼 select가 실패할 수 있으므로 같은 방식으로 감싼다.

### 4-2. 신규 파일

```
src/app/(app)/merchants/
  loadMerchant360.ts                    (추출 + 확장)
  merchant360.ts                        (타입 확장)
  actions.ts                            (액션 확장)
  [id]/page.tsx                         (전면 재작성, 서버)
  [id]/MerchantUnifiedClient.tsx        (편집 상태 보유 셸)
  [id]/InstallCompositionSection.tsx    ([B] + [C])
  [id]/MerchantInfoCard.tsx             ([D] 좌)
  [id]/InstallInfoCard.tsx              ([D] 우)
  [id]/ContractCard.tsx                 ([E] 좌)
  [id]/QuickActions.tsx                 ([E] 우)
```

`[F]` 메모 히스토리, `[G]` 관련 업무 이력은 `MerchantsClient.tsx`의 해당 JSX를
`src/app/(app)/merchants/MerchantMemoSection.tsx`, `MerchantHistorySection.tsx`로 추출해
양쪽에서 쓴다. 로직은 그대로 옮기고 새로 쓰지 않는다.

### 4-3. actions.ts 변경

- `updateMerchantInfo` — `contactName`, `contactPhone`, `operationStatus`, `contractStartedAt` 추가.
  `operationStatus`는 화이트리스트 검증 후 저장.
- `updateMerchantInstallNote(merchantId, note)` 신규 (2,000자 제한).
- `addMerchantEquipment` — `category`, `quantity`, `components`, `manufacturer`, `supplier`,
  `location` 입력 추가. `quantity`는 1 이상 정수 검증.
- `updateMerchantEquipment(id, input)` 신규 — 상세 표 행 편집.
- `deleteMerchantEquipment(id)` 신규 — 삭제는 `requireDeletePermission()`을 거치고,
  `merchants` 삭제와 동일하게 `fetchRowsForDeletion` / `recordDeletions`로 스냅샷을 남긴다.
- 모든 액션은 기존대로 `revalidatePath("/merchants")`에 더해 `revalidatePath("/merchants/" + merchantId)`.

### 4-4. 기존 화면 정리

- `MerchantsClient.tsx` 우측 패널: 정보 수정 폼 / 메모 등록 폼 / 장비 등록 폼 제거,
  읽기 전용 요약 + `통합정보 열기`(→ `/merchants/[id]`) 버튼으로 교체.
  좌측 목록·검색·일괄삭제는 손대지 않는다.
- `src/components/layout/navItems.ts`의 `breadcrumbForPath`가 `/merchants/[id]`에서
  `["가맹점", "통합정보"]`를 반환하도록 분기를 추가한다.

## 5. 작업 순서

1. `loadMerchant360` 추출 (동작 변경 없음) → `tsc --noEmit` 통과 확인
2. 113 / 114 마이그레이션 작성 후 dev Supabase 적용
3. 타입(`merchant360.ts`) + 로더 확장, 파생값 계산 추가
4. `[id]/page.tsx` + `[A]`~`[E]` 컴포넌트 구현 (읽기 전용으로 먼저 완성)
5. actions 확장 + 각 카드 편집 기능 연결
6. `[F]`/`[G]` 섹션 추출 후 이동, `MerchantsClient` 우측 패널 슬림화
7. 115 트리거 마이그레이션 작성 → dev에서 이관 1건 태워 시딩 검증
8. 운영 반영 (113 → 114 → 115 순서)

각 단계 끝에 `flow.md`에 결정·확인 내용을 그때그때 기록한다.

## 6. 검증

- `npx tsc --noEmit`, 변경 파일 ESLint.
- dev 데이터로 확인할 케이스:
  - 접수 링크가 **없는** 가맹점 (`franchise_application_id` NULL) — 프로그램/설치유형/VAN·인터넷이
    `-`로 나오고 에러가 없어야 한다.
  - 설치 완료 이력이 0건 / 1건 / 2건 이상 — 최초 설치일·최근 재설치일 분기.
  - `merchant_equipment` 0행 — 요약 카드 전부 `0세트`, 상세 표 빈 상태.
  - 계약 시작일만 있고 종료일이 없는 경우 — 계약기간 `-`.
  - 113~115 미적용 상태에서 페이지 진입 — 500이 아니라 빈 값으로 표시되어야 한다.
- 회귀: `/merchants` 목록 검색·페이지 이동·일괄 삭제, 메모/장비 등록이 새 위치에서 동작.
