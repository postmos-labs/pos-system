# franchise-receipts — DB 스키마 스냅샷 (dev 프로젝트 기준, 2026-07-27 조회)

> Supabase 콘솔에서 직접 조회한 실제 컬럼 목록. 코드(`FranchiseClient.tsx`, `page.tsx`, `franchiseStatusEffects.ts`, `dashboard/actions.ts`)와 대조한 결과 포함.

## franchise_applications

| 컬럼                                           | 타입        | Null | 기본값            | 코드 사용                                                                    |
| ---------------------------------------------- | ----------- | ---- | ----------------- | ---------------------------------------------------------------------------- |
| id                                             | uuid        | NO   | gen_random_uuid() | PK                                                                           |
| business_name/owner_name/phone/business_number | text        | YES  | NULL              | 사용                                                                         |
| equipment                                      | text        | YES  | NULL              | **미사용 — 죽은 컬럼**                                                       |
| equipment_items                                | jsonb       | YES  | '[]'              | 사용 (실제 상품 데이터)                                                      |
| equipment_select_token                         | uuid        | YES  | gen_random_uuid() | `/api/franchise/equipment-select` 추정, franchise-receipts 화면에서는 미사용 |
| selected_equipment                             | ARRAY       | YES  | NULL              | 상동                                                                         |
| equipment_selected_at                          | timestamptz | YES  | NULL              | 상동                                                                         |
| address / address_detail                       | text        | YES  | NULL              | 사용                                                                         |
| title                                          | text        | YES  | NULL              | 사용 (설치 티켓 제목 fallback)                                               |
| reception_channel / reception_date             | text        | YES  | NULL              | 사용                                                                         |
| card_apply_date / open_date / install_date     | date        | YES  | NULL              | 사용                                                                         |
| van_company                                    | text        | YES  | NULL              | 사용 (콤마 구분 다중선택 문자열)                                             |
| internet                                       | text        | YES  | NULL              | 사용                                                                         |
| program                                        | text        | YES  | NULL              | **franchise-receipts 코드에서 참조 안 됨 — 확인 필요**                       |
| sales_id / cs_id / tech_id                     | uuid        | YES  | NULL              | sales_id·cs_id 사용, tech_id는 타입에만 있고 UI 미사용                       |
| created_by                                     | uuid        | YES  | NULL              | 사용                                                                         |
| status                                         | text        | NO   | 'doc_waiting'     | 사용, 앱 레벨 enum(`FranchiseStatus`)으로 관리, DB는 text라 제약 없음        |
| applicant_type                                 | text        | NO   | 'individual'      | 사용, 앱 레벨 enum(`ApplicantType`)                                          |
| doc_template                                   | text        | YES  | NULL              | 사용 (상태가 doc_waiting일 때 자동 세팅)                                     |
| memo                                           | text        | YES  | NULL              | 사용 (스탬프+PIN 마커 내장 단일 텍스트, 구조화 안 됨)                        |
| sort_order                                     | bigint      | YES  | NULL              | 사용 (수동 정렬)                                                             |
| created_at / updated_at                        | timestamptz | YES  | now()             | 사용                                                                         |

## franchise_transfer_approvals

전부 코드 기대와 일치 (`status`, `delivery_type`, `requested_by(_name)`, `requested_at`, `approved_by(_name)`, `approved_at`, `cs_approved_by(_name)`, `cs_approved_at`, `rejection_reason`, `approval_notes` jsonb). 문제 없음.

## franchise_application_logs

`franchise_application_id, user_id, from_status, to_status, created_at` 사용. **`details`(jsonb, NOT NULL default `{}`) 컬럼은 franchise-receipts에서 채우지 않음** — 이 테이블은 franchise 전용이 아니라 `transfers`, `installs`, `dashboard/actions`, `approval-logs`, `admin/logs`에서도 공유하는 테이블이라 `details`는 다른 기능(아마 installs/transfers)에서 쓰는 것으로 보임. franchise-receipts 리팩토링 시 이 테이블 자체는 건드리지 않는 게 안전.

## installations (franchise 연동 부분만)

코드가 쓰는 컬럼(`customer_name`(NOT NULL) / `customer_phone` / `items` / `status` / `notes` / `franchise_application_id` / `address` / `scheduled_date` / `created_by` / `sort_order` / `delivery_type`) 전부 실제 스키마에 존재, 불일치 없음. `delivery_type`이 NOT NULL default `'install'`이라 franchise 쪽에서 이관 시 넘기는 `InstallationDeliveryType` 값이 이 컬럼의 허용값과 일치하는지만 추후 확인.

## internet_management (franchise 연동 부분만)

코드가 쓰는 컬럼(`business_name` / `owner_name` / `phone` / `franchise_application_id` / `sort_order`) 전부 존재, 불일치 없음.

## merchants (franchise 연동 부분만)

`business_name`/`owner_name`/`phone`이 NOT NULL인데, `autoRegisterMerchant`/`createLinkedInstallTicket`(죽은 코드) 모두 이 세 값이 없으면 insert 전에 막고 있어 정합성 문제 없음.

## profiles (franchise 연동 부분만)

`team`/`role`/`name`/`can_delete`는 NOT NULL, `approval_role`/`phone`은 nullable. 코드가 기대하는 `role`(`sales`/`cs`/`admin`/`master`/`tech`) · `approval_role`(`cs_responsible`/`team_lead`) 문자열 체크와 컬럼 존재 자체는 문제 없음. 실제 값이 이 문자열들과 정확히 일치하는지(오탈자 등)는 별도 확인 필요하지만 우선순위 낮음.

## 아직 미확인 (우선순위 낮음, 나중에)

- `notifications`, `notification_logs`: D-day/장기미처리 알림용
- 3개 FK 제약 이름(`franchise_applications_sales_id_fkey` 등) — `information_schema.table_constraints` 또는 콘솔의 Foreign Keys 탭
- `franchise_applications`, `franchise_transfer_approvals`의 RLS 정책
