# 가맹점 통합정보 작업 흐름

## 2026-08-20

design.md 1~~6단계 구현 시작. 7~~8단계(115 트리거, 운영 반영)는 이번 작업 범위 밖.

### 1단계: loadMerchant360 추출

- `src/app/(app)/merchants/page.tsx`에 있던 `loadMerchant360()`과 관련 헬퍼
  (`firstTimestamp`, `classifyMemo`, `installationStatusLabel`, `installationStatusClass`,
  `NON_STATUS_LOG_LABEL`)를 `src/app/(app)/merchants/loadMerchant360.ts`로 그대로 이동.
  동작 변경 없음, export만 추가.
- `page.tsx`는 새 파일에서 import해서 사용하도록 축소.
- `node_modules/.bin/tsc --noEmit` 통과 확인 (저장소에 `node_modules`가 없어 `npm install` 먼저 실행).

### 2단계: 113/114 마이그레이션 작성

- `supabase/113_merchant_unified_view_fields.sql`, `supabase/114_merchant_equipment_composition.sql`
  작성. Supabase에는 실행하지 않음 — dev 프로젝트 SQL Editor에서 직접 적용 필요.

### 3단계: 타입 확장 + 파생값 계산

- `merchant360.ts`: `Merchant360Merchant`(운영상태·계약시작일·담당자·특이사항),
  `Merchant360Application`(program·case_type), `MerchantEquipmentItem`(category·quantity·
  components·manufacturer·supplier·location·source) 필드를 옵셔널로 추가.
  옵셔널로 둔 이유: 113/114 미적용 환경에서는 select가 이 컬럼을 못 가져오기 때문.
  `MerchantDerivedSummary`, `MerchantEquipmentCategorySummary` 타입 신규 추가.
- `loadMerchant360.ts`: 새 컬럼을 select할 때 `42703`(column does not exist) 에러를
  잡아 기본 컬럼만 다시 조회하는 `fetchMerchantRow`/`fetchEquipmentRows` 헬퍼 추가.
  기존 `merchant_equipment` 테이블 부재(`42P01`/`PGRST205`) 가드와 별개로, 테이블은 있지만
  컬럼만 없는 경우를 추가로 흡수한다.
- 최근 A/S는 `installations.delivery_type = 'as'`(이미 조회 중인 배열에서 필터),
  `merchant_memo_entries.entry_type = 'as'`(이미 조회 중인 memos에서 필터),
  `tickets.type = 'as' AND merchant_id`(신규 쿼리, tickets는 항상 존재하는 핵심 테이블이라
  테이블 부재 가드 불필요) 세 소스 중 최신 시각으로 계산.
  → 새 쿼리를 최소화하기 위해 이미 불러온 배열을 최대한 재사용했다.
- 설치 담당자를 위해 `installations` select에 `assignee:profiles!installations_assigned_to_fkey(name)`
  조인 추가 (기존 franchise_applications의 cs/tech 조인과 같은 패턴).
- `fetchMerchantRow`의 반환 타입이 확장/기본 두 select의 유니온으로 좁혀져 `contract_started_at`
  등 신규 필드 접근에서 타입 에러가 나서, `merchant` 변수를 `Merchant360Merchant | null`로
  명시 캐스팅해서 해결.
- `node_modules/.bin/tsc --noEmit` 통과 확인.

### design.md와 다르게 판단한 지점

- design.md 4-2는 메모 히스토리/관련 업무 이력 섹션을 추출해 "양쪽에서 쓴다"고 했지만,
  decisions.md의 화면 배치 원칙("같은 폼을 두 곳에서 관리하지 않기 위함")과 4-4의
  "우측 패널은 읽기 전용 요약 + 통합정보 열기 버튼으로 슬림화"를 우선했다.
  → `MerchantsClient.tsx` 우측 패널에는 메모/이력 리스트를 다시 넣지 않고, 기존에도 있던
  "진행 중 N건" + "최근 이력: ..." 한 줄 요약만 유지한다.
  → `MerchantMemoSection.tsx`/`MerchantHistorySection.tsx`는 `[id]` 페이지 단일 소비자로
  추출한다 (재사용 목적의 분리는 유지하되 동일 컴포넌트를 두 화면에 렌더링하지는 않음).
  이 판단이 의도와 다르면 알려주세요 — 우측 패널에 읽기 전용 리스트를 추가로 보여주는
  버전으로 되돌리는 것도 어렵지 않습니다.
- 장비 삭제 감사 로그를 위해 `deletion_logs.entity_type` CHECK 제약에 `'merchant_equipment'`를
  추가해야 해서 114 마이그레이션에 포함시켰다 (design.md에는 명시되지 않았던 항목).
  `src/lib/deletionLog.ts`의 `DeletionEntityType` 유니온도 함께 확장.

### 4단계: [id] 페이지 + [A]~[E] 컴포넌트

- `src/app/(app)/merchants/[id]/page.tsx` 전면 재작성 (구식 tickets 나열 화면 → 통합정보 화면).
- 신규 컴포넌트: `MerchantInfoCard`(기본정보), `InstallInfoCard`(설치정보 + 특이사항 편집),
  `ContractCard`(계약조건), `QuickActions`(빠른 업무 딥링크), `InstallCompositionSection`
  ([B]+[C], 설치 구성 요약 카드 + 상세 표 + 행 추가/수정/삭제).
- KpiCard(`@/components/ui/KpiCard`)는 "건수 + 아이콘" 전용 스타일이라 요약 헤더의 텍스트형
  KPI(계약기간 "36개월", 설치 구성 "17세트" 등)에 맞지 않아 재사용하지 않고 같은 카드 톤의
  간단한 `SummaryCard`를 페이지 내부에 인라인으로 뒀다.
- `updateMerchantInfo`가 가맹점 행 전체를 업데이트하는 구조라, `MerchantInfoCard`와
  `ContractCard`가 같은 액션을 나눠 쓰면서 서로 담당하지 않는 필드를 지우지 않도록 각 카드가
  `merchant` prop에서 전체 필드를 다시 채워 제출한다. (같은 로드에서 두 카드를 동시에 열어
  순차로 저장하면 나중 저장이 앞선 저장 이후의 최신 값을 못 보고 초기 로드 시점 값으로 되돌릴
  수 있는 이론적 여지가 있음 — `router.refresh()`를 사이에 두면 발생하지 않음)
- 설치 유형 라벨용 `caseTypeLabel()` 헬퍼를 `loadMerchant360.ts`에 추가 (case_type 우선,
  없으면 delivery_type로 신규/이관 설치 추정).
- `navItems.ts`의 `breadcrumbForPath`에 `/merchants/`로 시작하는 경로 전용 분기 추가
  (`["가맹점", "통합정보"]`).

### 5단계: actions 확장

- `updateMerchantInfo`: contactName/contactPhone/operationStatus/contractStartedAt 추가,
  113 미적용 시 컬럼 없는 기본 필드로 재시도.
- `updateMerchantInstallNote` 신규.
- `addMerchantEquipment`: category/quantity/components/manufacturer/supplier/location 추가,
  수량 1 이상 정수 검증, 114 미적용 시 기본 컬럼으로 재시도.
- `updateMerchantEquipment`, `deleteMerchantEquipment` 신규. 삭제는 `requireDeletePermission` +
  스냅샷 감사 로그.
- 모든 액션에 `revalidatePath("/merchants/" + merchantId)` 추가.

### 6단계: 메모/이력 섹션 추출 + 목록 우측 패널 슬림화

- `MerchantMemoSection.tsx`, `MerchantHistorySection.tsx` 추출 (`[id]` 페이지 전용,
  design.md와 다르게 판단한 지점 참고).
- `MerchantsClient.tsx` 우측 패널: 정보수정/메모등록/장비등록 폼 전부 제거,
  읽기 전용 요약(가맹점 기본 정보 카드 + 진행중 건수 + 최근 이력 한 줄) + `통합정보 열기`
  버튼으로 교체. 좌측 목록/검색/일괄삭제는 변경 없음.
- `page.tsx`(목록)에서 `MerchantsClient`로 넘기던 `memos`/`equipment` prop 제거.

### 검증

- `node_modules/.bin/tsc --noEmit`: 통과 (매 단계마다 확인).
- `node_modules/.bin/eslint "src/app/(app)/merchants/**/*.{ts,tsx}"`: 통과.
- `npm run build`: Turbopack 컴파일 + TypeScript 단계까지 통과. 이후 페이지 데이터 수집 단계에서
  `supabaseUrl is required` 에러로 중단됨 — 저장소에 dev Supabase 자격증명이 없어 발생하는
  기존 환경 제약이며(merchants-360/flow.md에 동일 증상 기록됨), 이번 변경과 무관.
  브라우저로 실제 화면(로그인 후 `/merchants`, `/merchants/[id]`)을 직접 확인하지 못했다 —
  dev Supabase 프로젝트 자격증명이 없어서다. 113/114 마이그레이션을 적용하고 실제 데이터로
  design.md "6. 검증"의 엣지 케이스(접수 링크 없음/설치 완료 0·1·2건/장비 0행/계약 시작일만
  있음)를 사용자가 직접 확인해야 한다.
- 임시로 `.env.example`을 `.env`로 복사해 빌드 시도 후 즉시 삭제함 — 저장소에 `.env`가
  남아있지 않음.
