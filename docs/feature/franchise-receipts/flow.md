# 가맹 접수 (franchise-receipts) — 현재 흐름 (as-is)

> 작성일 2026-07-27. `src/app/(app)/franchise/*` 코드를 읽고 정리한 결과. 아직 DB 실제 스키마는 대조 전.

## 1. 파일 구성과 실제 렌더 트리

```
src/app/(app)/franchise/
  page.tsx                 서버 컴포넌트. franchise_applications 등 조회 후 FranchiseClient에 전달
  FranchiseClient.tsx       3,013줄. 상태/이펙트/핸들러 컨테이너 + 렌더
  FranchiseReceiptSurface.tsx  실제 렌더되는 목록/필터/KPI/테이블 UI
  FranchiseCreateDialog.tsx    실제 렌더되는 신규 접수 모달
  FranchiseDetailDrawer.tsx    실제 렌더되는 상세 드로어
  FranchiseMemoDrawer.tsx      실제 렌더되는 히스토리(메모) 드로어
  actions.ts                 서버 액션 1개 (deleteFranchiseRows)
src/lib/franchiseStatusEffects.ts   상태 변경 시 사이드이펙트(알림톡, merchant/install 자동 생성)
```

`page.tsx`가 서버에서 `franchise_applications`, `profiles`(영업/CS), `franchise_application_logs`(오늘 완료 건수), `franchise_transfer_approvals`, `installations`, `internet_management`를 병렬 조회해서 `FranchiseClient`에 props로 내려줌. `FranchiseClient`는 이걸 `localRows`에 복사해 로컬 상태로 들고, 이후 CRUD는 낙관적 갱신 없이 **DB 반영 성공 후에만 로컬 상태를 갱신**하는 패턴을 일관되게 씀 (realtime refresh와 충돌 방지 목적, 코드 주석에 명시돼 있음).

## 2. ⚠️ 중요 발견 — 죽은 코드 (미사용, 렌더 안 됨)

`FranchiseClient.tsx` 상단 225~1010줄 부근에 다음이 정의되어 있는데, **파일 전체에서 렌더 트리 어디에도 쓰이지 않음** (grep으로 확인):

- `EquipmentCart`, `VanMultiSelect`, `EditableText`, `EditableMemo`, `HistoryPanel`, `DateField`, `DateFormField`, `CreateForm` (컴포넌트 7~8개, 약 800줄)
- 이들이 참조하는 상수/헬퍼: `RECEPTION_CHANNELS`, `EQUIPMENT_CATALOG`, `VAN_COMPANIES`, `INTERNET_PROVIDERS`, `EMPTY_FORM`, `defaultCreateForm`, `AUTO_FORMAT`, `parseVanList`

**정황**: `FranchiseReceiptSurface`/`FranchiseCreateDialog`/`FranchiseDetailDrawer`/`FranchiseMemoDrawer`가 이미 새 디자인 시스템(`border-border`, `bg-card` 등 CSS 변수 기반)으로 별도 파일에 분리되어 실제로 렌더되고 있음 — 즉 **UI를 이미 한 차례 새 컴포넌트로 옮기는 작업이 진행됐고, 옮기고 나서 기존 구버전 인라인 컴포넌트를 안 지운 상태**로 보임. `parseMemoEntries`/`splitMemoBlocks`/`togglePinEntry`/`removeMemoEntry` 등 메모 파싱 순수 함수는 `FranchiseMemoDrawer`용으로 계속 살아있음 (죽은 코드 아님).

→ 리팩토링 1단계로 이 죽은 코드부터 삭제하면 3,013줄 → 약 2,200줄 수준으로 즉시 줄어듦. 별도 커밋으로 분리 예정 (기능 변경 없는 순수 삭제).

## 3. 데이터 흐름 요약

### 3.1 목록/필터/검색 (FranchiseReceiptSurface)

- `localRows` → `matchesFilters`(activeKpi/tableView/statusFilter/applicantType/channel/van/date range) → 검색어 매칭 → 정렬(`sortBy`: updated_at/created_at/open_date/install_date/status/manual) → 페이지네이션(50건/페이지)
- KPI 5종(오늘 접수/서류 대기/서류 미비/심사 중/오늘 완료)과 탭 뷰(전체/내 업무/서류 미비/심사 대기/승인 완료)가 각각 `activeKpi`/`tableView` state로 별도 관리되며 서로 상호작용(`onKpiChange`가 `tableView`를 "all"로, `onTableViewChange`가 `activeKpi`를 초기화)
- `sortBy === "manual"`일 때만 행 드래그 재정렬 가능(`reorderRows` → `sort_order` 컬럼 갱신)

### 3.2 신규 접수 생성 (FranchiseCreateDialog → handleCreate)

1. 전화번호/상호명/사업자번호 중복 체크 (있으면 confirm)
2. `franchise_applications.insert` (status는 항상 `"doc_waiting"` 고정)
3. `sendDocNotify` 체크 시 `/api/franchise/notify`(doc_request) 호출
4. 성공 시 로컬 `localRows` 맨 앞에 추가

### 3.3 상태 변경 (가장 복잡한 흐름)

`handleStatusChange` → `statusConfirm` 모달 오픈 → 사용자가 "카톡 발송 후 변경" 또는 "발송 없이 변경" 선택 → `updateStatus(row, status, sendNotify, docCase)`:

1. `franchise_applications.update({status, ...doc_template 조건부})`
2. `franchise_application_logs.insert` (from_status/to_status 기록)
3. `applyFranchiseStatusSideEffects` (lib/franchiseStatusEffects.ts):
   - `sendNotify`면 상태별 알림톡 발송 + 발송 로그(`to_status: "alimtalk:<key>"`) — doc_waiting은 2건(상태변경+서류안내) 발송하는 특수 케이스
   - `card_done`/`toss_review_done`이면 `autoRegisterMerchant` (merchants 테이블에 자동 등록, 중복 방지)
4. 로컬 상태 갱신

`NEXT_STATUS` 맵은 정의(770줄)만 있고 참조하는 곳이 없음 — **죽은 코드 확정**.

### 3.4 기술지원 이관 승인 워크플로 (2단계 승인)

`franchise_transfer_approvals` 테이블 기반. 승인 역할(`currentUserApprovalRole`): `cs_responsible`(CS책임) → `team_lead`(팀장) 순.

- CS책임이 요청 → `requested`. CS책임이 직접 요청한 경우 자동으로 `cs_responsible_approved`로 시작(1단계 스킵)
- `cs_responsible`이 승인 → `cs_responsible_approved`
- `team_lead`가 이관 구분(`delivery_type`) 선택 후 최종 승인 → `approved` → `installations`에 자동 이관/생성(`autoTransferToTech`, server action `approveFranchiseTransfer` 내부에서 처리)
- 요청자 본인은 승인 불가, 각 단계 알림 실패는 toast.warning으로 별도 안내(승인 자체는 롤백 안 함)
- 단건/일괄(`submitBulkTransfer`) 두 경로 존재, 로직 일부 중복

### 3.5 메모/히스토리 (FranchiseMemoDrawer)

- `memo` 컬럼은 단일 텍스트 필드에 `[작성자 MM. DD. HH:mm]` 스탬프로 여러 항목을 이어붙이는 방식 (구조화된 테이블 아님)
- 상단 고정(pin)은 텍스트 안에 `PIN:<epoch ms>:` 프리픽스를 심는 방식, 구버전 포맷(`PIN::`, `MMDDHHmmss`) 호환 코드도 남아있음
- 삭제/고정은 프론트에서 전체 memo 문자열을 파싱→재조립해서 통째로 update — 동시 편집 시 마지막 쓰기가 이전 걸 덮어씀 (레이스 컨디션 가능성)

### 3.6 기타 연동

- `saveField`로 business_name/owner_name/phone/address 수정 시, 이미 연결된 `installations` 행이 있으면 동일 필드를 동기화 update
- `saveEquipmentItems`도 연결된 install에 items 동기화
- 인터넷관리 연동: `linkToInternet`이 `internet_management`에 franchise_application_id로 링크 insert
- D-day(7/3/1일 전 오픈예정) 알림, 7일 이상 미변경 건 알림 — `notification_logs`로 중복 발송 방지, 클라이언트 useEffect에서 매 렌더 시 조건부 실행 (서버 크론이 아니라 프론트 접속 시점에 트리거되는 방식)
- realtime: `franchise_applications` 테이블 postgres_changes 구독 → 400ms debounce 후 `router.refresh()`

## 4. 코드가 참조하는 테이블/컬럼 (실제 DB 대조 필요)

- **franchise_applications**: 거의 모든 컬럼 사용 (`FranchiseApplication` 타입 기준, src/types/index.ts:129). `sales_id`/`cs_id`/`created_by`는 각각 `profiles` FK(alias sales/cs/creator)
- **franchise_application_logs**: `franchise_application_id, user_id, from_status, to_status, created_at` + `to_status`에 `alimtalk:<key>` 값도 섞어서 로그로 재사용 (컬럼 재활용 패턴)
- **franchise_transfer_approvals**: status/delivery_type/requested_by(_name)/requested_at/approved_by(_name)/approved_at/cs_approved_by(_name)/cs_approved_at/rejection_reason/approval_notes(JSON)
- **installations**: franchise_application_id로 연결, customer_name/customer_phone/items/status/notes/address/scheduled_date/sort_order 등을 franchise 쪽에서 직접 update
- **internet_management**: franchise_application_id 또는 phone으로 연결
- **merchants**: franchise_application_id로 연결, 카드가맹/토스심사 완료 시 자동 생성
- **tickets**: `lib/franchiseStatusEffects.ts`의 `createLinkedInstallTicket`이 type="install"로 생성하는 로직인데, `FranchiseClient.tsx` 안의 래퍼 함수(1723줄)가 **어디서도 호출되지 않음 — 죽은 코드 확정**. 즉 현재 흐름에서 franchise → tickets 자동 생성 경로는 실제로 동작하지 않고, 대신 3.4의 `autoTransferToTech`(franchise → installations)가 실질적인 이관 경로임
- **notifications / notification_logs**: D-day, 장기미처리 알림
- **profiles**: role/approval_role 기준 필터링에 다수 사용

## 5. 확인이 필요한 DB 항목 (직접 조회 요청)

아래는 코드만 보고는 확신할 수 없는 부분입니다. Supabase 콘솔에서 확인해서 알려주시면 됩니다:

1. `franchise_applications` 테이블의 **현재 실제 컬럼 목록/타입** — 특히 `equipment`(구식 텍스트 필드로 보임) vs `equipment_items`(jsonb로 보임)가 둘 다 남아있는지, `equipment` 컬럼이 여전히 쓰이는지
2. `franchise_applications_sales_id_fkey`, `franchise_applications_cs_id_fkey`, `franchise_applications_created_by_fkey` FK 제약 이름이 실제로 이 이름인지 (page.tsx의 PostgREST 조인 문법이 FK 이름에 의존함)
3. `franchise_transfer_approvals`의 `rejection_reason`, `approval_notes` 컬럼 타입 (jsonb로 추정)과 실제 존재 여부 (023, 071, 073, 078~080번 마이그레이션에 걸쳐 누적된 필드라 실제 반영 여부 확인 필요)
4. `equipment_select_token`, `selected_equipment`, `equipment_selected_at` 컬럼 (061번 마이그레이션 추정) — `app/api/franchise/equipment-select/route.ts`에서 쓰는지 아직 미확인, 실사용 여부
5. `sort_order` 컬럼 nullable 여부와 기본값 (드래그 정렬 기능이 `sort_order`가 없는 기존 행에서 어떻게 동작하는지)
6. RLS 정책 — `franchise_applications`, `franchise_transfer_approvals`에 걸린 정책이 이 코드의 권한 체크(approval_role 기반)와 실제로 일치하는지

## 6. 다음 단계

- [x] 위 5번 DB 확인 결과 받으면 `db-schema.md`에 실제 스키마 스냅샷 기록
- [x] (2026-07-28) `FranchiseClient.tsx` 죽은 코드 삭제 — 원래 알려진 8개 컴포넌트 외에,
      함께 죽어있던 `ALIMTALK_LOG_LABEL`/`INSTALL_LOG_LABEL`/`MAIN_COLUMNS`/`NEXT_STATUS`/
      `createLinkedInstallTicket` 래퍼, 그리고 이후 unused로 드러난 아이콘 import 다수
      (Pin/Calendar/Plus/Trash2 등)도 같이 제거. 3013줄 → 2303줄. 커밋 f83c852
- [x] (2026-07-28) memo 테이블 전환 — `FranchiseMemoDrawer`가 `franchise_applications.memo`
      blob 파싱 대신 `franchise_application_memos` 테이블을 직접 읽고/씀 (조회는 드로어를
      열 때, 추가/삭제(soft delete)/고정은 row 단위). PIN 마커 파싱 헬퍼 전부와 `saveMemoRaw`,
      `saveField`의 memo append 분기 제거. 커밋 1780a5d
  - **알려진 갭**: `FranchiseReceiptSurface`의 목록 "메모" 컬럼 아이콘(있음/없음 표시)이
    여전히 `row.memo`(legacy blob)만 보고 판단함. 새 메모는 이제 `memo` 컬럼에 안 쌓이므로,
    새로 추가된 메모만 있는 건은 이 아이콘이 계속 "없음"으로 표시됨 — 목록에 메모 유무를
    정확히 반영하려면 `page.tsx`에서 건별 메모 존재 여부를 함께 조회해서 내려줘야 함.
    이번 배치 범위 밖으로 남겨둠, 후속 처리 필요
  - **미검증**: 이 세션 환경에 Supabase 연결 정보(.env)가 없어 브라우저 실기동 확인은
    못 함 (tsc 타입체크만 통과 확인). dev 서버에서 직접 눌러보고 문제 있으면 알려줄 것
- [x] (2026-07-28) soft delete 전환 — `deleteFranchiseRows`가 실제 DELETE 대신
      `deleted_at` UPDATE 수행. `franchise_applications_active` 뷰는 만들어뒀지만
      실제로는 안 씀 — 조회 지점 다수가 `sales:profiles!..._fkey` 같은 PostgREST
      FK embed 조인을 쓰는데, 뷰로 바꾸면 이 FK 관계 추론이 깨질 위험이 있어
      각 조회 쿼리에 `.is("deleted_at", null)` 조건을 개별 추가하는 쪽으로 결정
      (db-plan.md도 뷰/조건 추가 둘 다 허용했음). franchise/dashboard/installs/
      calendar/layout/kpi/transfers/equipment-select 전체 조회 지점 반영.
      커밋 bc9b0b1
- [x] (2026-07-28) `reception_channel_code`/`option_code` UI 반영 — 이 작업 중 **live 버그
      발견**: `reception_channel` 컬럼이 이미 `reception_channel_legacy`로 rename됐는데
      van_company(8be9a0c)와 달리 이 컬럼은 코드 전반에서 그대로 참조되고 있어서 실제로는
      깨져 있었음 (가맹 신규 접수 생성이 dev DB에서 실패하는 상태였을 것). `franchiseCodes.ts`에
      `RECEPTION_CHANNEL_OPTIONS`/`FRANCHISE_OPTION_OPTIONS` 추가하고, 생성/상세/목록
      필터/엑셀 다운로드 전체를 `reception_channel_code` + `option_code` 기준으로 전환.
      `case_type_code`(전환/승계/명변)는 `original_application_id` 연결 UI가 별도로
      필요해 이번 배치에서 보류 — 신규 건은 전부 `case_type_code: "NEW"`로 고정.
      부수적으로 `franchiseStatusEffects.ts`의 `createLinkedInstallTicket`이 task 1
      이후 프로젝트 전체에서 완전히 죽은 코드가 된 것을 확인해 삭제. `transfers`
      페이지(기술지원 이관, `reception_channel="전환"`으로 필터링하는 별도 기능)는
      이번 case_type 마이그레이션 대상이 아니라서 `reception_channel_legacy` 참조로만
      최소 수정. 커밋 6fc7c17
  - **후속 필요**: `case_type_code` UI(전환/승계/명변 생성 시 원본 신규 건 검색·연결
    피커) — 별도 작업으로 남음
  - **미검증**: 이번에도 Supabase 연결 정보가 없어 브라우저 실기동 확인은 못 함 (tsc
    타입체크만 확인). 특히 가맹 신규 접수 생성 폼은 실제 DB에서 꼭 한 번 눌러서 확인 필요
- [ ] 이후 리팩토링 계획(`src/features/franchise-receipts/` 이동)은 위 항목들 정리 후 별도 문서로
- [ ] 리팩토링 착수 시 `src/features/**`에 ESLint override로 `@typescript-eslint/no-explicit-any: error` 등 엄격 규칙 적용 (전역 174건 기존 오류는 그대로 두고, 새로 옮기는 기능부터 깨끗하게 시작)
