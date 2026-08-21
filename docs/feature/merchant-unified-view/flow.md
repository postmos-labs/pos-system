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

## 2026-08-20 (2)

### 구조 변경: `/merchants` 우측 패널을 통합정보 화면 전체로 교체

4단계~6단계에서는 decisions.md의 "같은 폼을 두 곳에서 관리하지 않기 위함" 원칙을 따라
`/merchants` 우측 패널을 읽기 전용 요약 + `통합정보 열기`(→ `/merchants/[id]`) 버튼으로
슬림화했다. 그런데 원래 의도는 "가맹점 탭 한 화면에서 다 본다"였고, 버튼으로 페이지를
넘어가는 구조는 그 의도와 맞지 않는다는 피드백을 받아 우측 패널 자체를 통합정보 화면으로
바꿨다.

- `[id]/MerchantInfoCard.tsx`, `InstallInfoCard.tsx`, `ContractCard.tsx`, `QuickActions.tsx`,
  `InstallCompositionSection.tsx`를 `merchants/`로 이동해 `/merchants` 패널과 `/merchants/[id]`
  페이지가 동일 컴포넌트를 그대로 공유하도록 했다. 두 화면에서 로직을 두 벌로 유지하지 않기
  위함 — "같은 폼을 두 곳에서 관리하지 않는다"는 원래 원칙은 유지하되, 그 폼이 이제 두 화면에
  동시에 렌더링된다는 점만 바뀐 것이다. `../actions`, `../merchant360`, `../loadMerchant360`
  참조는 전부 `./`로 정리했다.
- `MerchantsClient.tsx`의 `MerchantDetailPanel`을 `[id]/page.tsx`와 같은 구성(요약 헤더 → 설치
  구성 요약/상세 → 기본정보/설치정보 → 계약조건/빠른 업무 → 메모 히스토리 → 관련 업무 이력)으로
  전면 교체했다. `SummaryCard`/`formatDateOnly`는 별도 파일로 추출하지 않고 `MerchantsClient.tsx`
  안에 그대로 복사해 넣었다 — `DetailField`가 이미 여러 카드 컴포넌트에 각각 복사되어 있는
  기존 패턴을 따른 것으로, 새 공유 모듈을 만들지 않기 위함이다.
- 패널 폭이 좌측 목록(280~360px) 때문에 `[id]` 전폭 페이지보다 좁으므로, 기본정보/설치정보와
  계약조건/빠른 업무의 2단 그리드는 `lg:grid-cols-2` 대신 `xl:grid-cols-2`를 썼다(`[id]/page.tsx`는
  전폭이라 `lg:grid-cols-2` 그대로 유지). `InstallCompositionSection` 내부의 설치 구성 요약 카드
  그리드(`sm:grid-cols-4`)와 상세 표의 가로 스크롤은 공유 컴포넌트 내부라 손대지 않았다.
- `MerchantDetailPanel`의 `key={selectedMerchant?.id ?? "empty"}`는 그대로 유지했다. 좌측 목록
  클릭은 `router.replace`로 같은 페이지 안에서 `id` 쿼리만 바꾸므로, 이 key가 없으면 리렌더링만
  일어나 `MerchantInfoCard`/`InstallInfoCard`/`ContractCard`/`InstallCompositionSection`의 편집
  draft state(`useState`로 `merchant`/`item` prop을 초기값 삼아 보유)가 이전 가맹점 값으로 남는다.
  key가 바뀌면 패널 서브트리 전체가 언마운트·리마운트되어 각 카드가 새 프로트 기준으로 다시
  초기화된다.
- `page.tsx`(목록)에서 `MerchantsClient`로 `memos`/`equipment`/`equipmentCategorySummaries`/
  `derivedSummary`를 다시 전달하도록 Props를 확장했다 — 6단계에서 뺐던 것을 되돌린 것.
- `/merchants/[id]`는 그대로 유지, `[id]/page.tsx`의 컴포넌트 import 경로만 `./`에서 `../`로
  바꿨다. `navItems.ts`의 `breadcrumbForPath` 분기는 변경 없음.
- 새 서버 액션/쿼리는 추가하지 않았다. `actions.ts`에 5단계에서 만든 액션들을 그대로 재사용.

### 검증

- `node_modules/.bin/tsc --noEmit`: 통과.
- `node_modules/.bin/eslint "src/app/(app)/merchants/**/*.{ts,tsx}"`: 통과.
- `npx prettier --check`(변경 파일 전체): 통과 (`MerchantsClient.tsx`는 최초 작성 시 import 정렬이
  어긋나 `prettier --write`로 재포맷).
- `npm run build`: Turbopack 컴파일 + TypeScript 단계까지 통과, 이후 페이지 데이터 수집 단계에서
  기존과 동일하게 `supabaseUrl is required`로 중단됨 — dev Supabase 자격증명이 없는 환경 제약으로
  이번 변경과 무관.
- key 리셋 동작(가맹점 A → B 전환 시 A의 편집 draft가 B에 남지 않는지)은 React의 key 시맨틱상
  코드 레벨에서는 보장되지만(key 변경 시 서브트리 전체 언마운트), dev Supabase 자격증명이 없어
  로그인 후 브라우저로 직접 클릭해 확인하지는 못했다. 사용자가 `/merchants`에서 가맹점 A를 선택해
  기본정보 카드를 "수정" 상태로 열어 값을 바꾼 뒤 저장하지 않고 가맹점 B로 전환했을 때, B의 패널이
  "수정" 모드가 아닌 읽기 전용 상태로 뜨고 입력값도 B의 실제 값으로 나오는지 확인해달라.

## 2026-08-20 (3): "표시는 하는데 채울 방법이 없는" 항목 파이프라인 연결

design.md에 이미 설계된 115(접수 장비 시딩)를 작성하고, 백필(116)·설치관리 편집(항목 3)·
계약기간 직접입력(항목 4)·관련 업무 이력 확장(항목 5)을 진행했다. 113/114는 이미 라이브에
적용된 상태라 손대지 않았고, 115/116은 파일만 작성하고 실행하지 않았다.

### 사전 확인: SECURITY DEFINER 경고 (design.md 115절)

design.md는 "적용 전 반드시 확인하고 보고"하라고 두 가지를 명시했다. 실제로 확인한 결과:

- `sync_merchant_on_tech_transfer()`는 101번 정의 기준으로 SECURITY DEFINER가 **아니다**.
- 하지만 이 함수를 트리거하는 `installations` INSERT/UPDATE는 앱 전체에서 예외 없이
  `createAdminClient()`(service_role 키)로만 실행된다 — `approvals/actions.ts`(이관승인),
  `installs/actions.ts`(수동 등록) 모두 확인. Supabase의 `service_role` Postgres 롤은
  BYPASSRLS라 이 세션에서 발생하는 트리거 내부 INSERT는 SECURITY DEFINER 여부와 무관하게
  이미 RLS를 우회한다.
- 즉 design.md가 우려한 "created_by = auth.uid() 정책 때문에 트리거 INSERT가 막힘" 상황은
  현재 코드 경로상으로는 재현되지 않는다.
- 그럼에도 115에는 design.md 원안대로 `SECURITY DEFINER` + `created_by NULL` 허용 정책을
  그대로 넣었다. 위 사실에만 의존하면 나중에 service_role이 아닌 경로로 installations를
  쓰는 코드가 추가될 때 조용히 깨질 수 있어, 비용이 거의 없는 방어적 조치를 그대로 채택했다.
  근거와 확인 내용은 115 파일 상단 주석에도 남겼다.

### 1. 115: 접수 장비 → merchant_equipment 시딩

design.md 표를 그대로 따랐고, EQUIPMENT_CATALOG(FranchiseClient.tsx) 13개 품목
(포스기/토스프론트/영수증프린터/주방프린터기/무선단말기/금전함 → main_pos 6개,
키오스크/키오스크리더기 → kiosk 2개, 테이블오더/태블릿/보조배터리 → table_order 3개,
인터넷/원격 → etc 2개)을 매핑 함수(`merchant_equipment_category_for_item`)로 전부 커버하는지
확인했다 — 6+2+3+2=13, 정확히 일치.

- 카테고리별 세트 수는 대표 품목(`merchant_equipment_category_representative`: main_pos→포스기,
  kiosk→키오스크, table_order→테이블오더 우선 없으면 태블릿) 우선, 없으면 카테고리 내 최대
  수량으로 계산하는 로직을 별도 함수로 뽑아 115/116이 공유하도록 했다(`seed_merchant_equipment_from_application`).
- 가드(source='application' 행이 이미 있으면 스킵)는 함수 내부에 두어, 트리거든 백필이든
  호출부에서 따로 체크할 필요가 없게 했다.
- INSERT 정책은 `created_by = auth.uid() OR created_by IS NULL`로 확장.

### 2. 116: 기존 가맹점 백필

115의 `seed_merchant_equipment_from_application()`을 그대로 재사용하는 `DO $$ ... $$` 블록으로
작성했다. franchise_application_id가 있고 아직 source='application' 행이 없는 가맹점만 대상.
백필 전/후 건수를 비교할 수 있는 SELECT를 파일 주석으로 남겼다(대상 건수, source별 건수,
여전히 0세트인 가맹점 확인 쿼리).

### 3. /installs 설치 구성 편집 (항목 3)

- `InstallsClient.tsx`의 "가맹접수 원본 정보" 모달(`openFranchiseDetail`)은 원래
  `franchise_application_id`만 받았다. `installationId`도 함께 받도록 확장하고, 호출부 2곳
  (`inst.id`)을 함께 넘기도록 수정.
- merchant_id는 지시대로 `installations.franchise_application_id → merchants` 역조회로
  구했다(클라이언트에서 `merchants.select("id").eq("franchise_application_id", franchiseId)`).
  못 찾으면 `compositionMerchantId`가 null로 남는다.
- `InstallCompositionSection`(원래 `/merchants`, `/merchants/[id]`가 쓰던 컴포넌트)을 그대로
  재사용했다. `merchantId` prop 타입을 `string` → `string | null`로 넓히고, null이면 "구성 추가"
  버튼과 등록 폼의 저장 버튼을 모두 비활성화한 뒤 "접수 연결이 없어 가맹점을 찾을 수 없습니다"
  문구를 보여주도록 컴포넌트 내부에서 처리했다(조용히 실패하지 않음).
- `addMerchantEquipment`/`updateMerchantEquipment`(및 `MerchantEquipmentInput`)에
  `installationId?: string` 인자를 추가해 `installation_id` 컬럼(106번부터 존재, 113/114와
  무관하므로 항상 안전하게 insert/update 가능)을 채우도록 확장했다. 수정 시에는 installationId가
  전달된 경우에만 `installation_id`를 덮어써서, `/merchants`에서 편집할 때 기존 연결을 지우지
  않게 했다. 두 액션 + `updateMerchantEquipmentStatus` + `deleteMerchantEquipment`에
  `revalidatePath("/installs")`를 추가했다.
- 새 서버 액션은 만들지 않았다 — 기존 액션 인자만 확장.
- 모달 폭을 480px → 720px(max-w-95vw)로 넓혔다. 설치 구성 요약 카드 4장 + 상세 표 6컬럼이
  480px 모달에서는 가로 스크롤이 과해 거의 안 보이는 수준이라 판단했다. design.md/decisions.md에
  명시된 디자인 토큰은 아니고, 기존 모달 패턴(rounded-2xl/border/shadow-xl)은 그대로 유지했다.
- 접수 장비(주문 내역, 읽기 전용)는 지우지 않고 "접수 장비 (주문 내역)"으로 라벨만 더 명확히
  하고, 그 아래에 "실제 설치 구성 (현장 확정 기준 — 접수 장비와 다를 수 있음)" 구간으로
  `InstallCompositionSection`을 추가했다. 전제(주문 내역 vs 실제 설치 구성은 서로 다른 정본)를
  화면에서도 구분해 보여주기 위함.

**한계로 남긴 것**: 빠른 업무의 "장비 추가출고" 버튼은 `/installs/delivery`의 "+등록" 폼
(`createInstallation`)으로 연결되는데, 이 폼은 애초에 `franchise_application_id`를 받지 않는다.
즉 이렇게 만든 배송 설치건은 이번 3번 작업으로 설치 구성은 편집 가능해져도, merchant_id를 구할
방법 자체가 없어 5번(관련 업무 이력)에는 여전히 나타날 수 없다. 이관승인(approvals) 흐름에서
배송유형을 "택배발송"으로 선택해 만든 설치건(franchise_application_id 있음)과는 다른 경로다.
가맹점 검색·연결 UI를 "+등록" 폼에 추가하는 건 데이터 파이프라인 연결이라는 이번 작업 범위를
벗어나는 새 UI 기능이라 이번에는 포함하지 않았다. decisions.md가 애초에 "프리필 파라미터도
이번엔 붙이지 않는다"고 범위를 좁혀둔 것과 같은 맥락으로 판단했다.

### 4. 계약기간 직접입력 (항목 4)

새 컬럼을 추가하지 않고 `ContractCard.tsx` 안에서만 처리했다.

- `lastTouched: "months" | "endDate"` 상태로 마지막으로 사용자가 건드린 쪽을 추적한다.
  편집을 처음 열 때는 저장된 시작일+종료일 기준으로 개월수를 미리 계산해 채워두고,
  `lastTouched` 기본값은 `"endDate"`로 둔다(기존 저장 방식과 동일하게 시작+종료일이 기준값).
- 개월수를 고치면(`handleMonthsChange`) `lastTouched`를 `"months"`로 바꾸고, 시작일이 있으면
  종료일을 재계산한다. 종료일을 고치면(`handleEndChange`) 반대로 개월수를 재계산한다.
  시작일을 고치면(`handleStartChange`) `lastTouched`가 가리키는 쪽을 기준으로 나머지 하나만
  다시 계산한다 — 두 값이 서로를 계속 갱신하는 순환 의존이 아니라 "마지막으로 편집한 쪽 →
  나머지"의 단방향 계산이라 무한루프 여지가 없다.
- `DatePickerField`가 이미 export하던 `parseDate`/`formatDate`(로컬 Date 기준, "yyyy-MM-dd"
  문자열)를 재사용해 날짜 계산을 했다 — 새 유틸을 만들지 않았고, `loadMerchant360.ts`의
  `contractMonths` 계산식(연·월 차이만, 일자는 무시)과 동일한 공식을 그대로 복제해 편집 중
  보이는 개월수와 저장 후 다시 계산되는 개월수가 어긋나지 않게 했다.
- 저장 시 서버로는 여전히 `contractStartedAt`/`contractExpiresAt`만 보낸다 — `contractMonths`는
  화면에서만 쓰는 계산 편의 필드다.

**검증 (계약 시작일만 있는 경우)**: `handleStartChange`에서 `lastTouched`가 초기값 `"endDate"`고
`prev.contractExpiresAt`이 빈 문자열이면 `value && prev.contractExpiresAt` 조건이 거짓이 되어
`contractMonths`를 건드리지 않는다. `handleMonthsChange`도 `prev.contractStartedAt`이 없으면
종료일을 계산하지 않는다. 두 핸들러 모두 상태를 직접 갱신할 뿐 서로를 트리거하는 `useEffect`가
없어 무한루프가 발생할 수 없다.

### 5. 관련 업무 이력 확장 (항목 5)

`loadMerchant360.ts`에 아래 4개를 추가했다. `EQUIPMENT_CATEGORIES`/`computeEquipmentCategorySummaries`는
`merchant360.ts`로 옮겨 서버 로더와 `InstallsClient.tsx`(클라이언트)가 같은 순수 함수를
공유하도록 했다(3번 작업에서 필요).

- **AS**: `installations`(이미 franchiseApplicationId로 조회 중인 배열)에서
  `delivery_type='as'`인 건 + `tickets`(신규 쿼리, `merchant_id` 직접 연결 + `type='as'` +
  `deleted_at IS NULL`로 휴지통 항목 제외) 전체를 합쳤다.
- **변경**: `change_requests.merchant_id` 직접 연결(052/055번 스키마 — 055에서 상태값이
  `waiting_docs/docs_incomplete/done`으로 바뀌어 있어 `src/types`의 `ChangeRequestStatus`를
  그대로 썼다).
- **설치·배송 이후**: `installation_post_history.merchant_id` 직접 연결(100번 스키마).
- **배송**: `installations` 중 `delivery_type='delivery'`. `franchiseApplicationId`로 이미
  필터된 배열 안에서만 찾으므로 접수(이관)에 연결된 배송건만 걸린다. `category`는 `install`과
  같게 두고 제목만 "장비 배송"으로 구분했다 — 이력 탭 구조를 "설치" 탭 하나로 유지하기 위해
  별도 탭을 만들지 않았다(관련 업무 이력 탭은 원래 목업에 정의된 5개 카테고리
  reception/install/as/change/post를 그대로 따르고, "배송"은 목업에 없는 새 카테고리라 임의로
  추가하지 않았다). 이 판단이 다르면 알려달라 — `install`/`delivery`를 완전히 분리한 탭으로
  바꾸는 것도 어렵지 않다.
- `change_requests`/`installation_post_history` 조회는 `merchant_equipment`와 같은 패턴으로
  42P01/PGRST205를 빈 배열로 흡수하는 `isMissingTableError` 가드를 새로 추가해 적용했다.
- **최근 A/S KPI ↔ AS 탭 모순 해소**: 기존에는 "최근 A/S" KPI가 `tickets`에서 가장 최근 1건만
  별도로(`.limit(1).maybeSingle()`) 조회해 계산했는데, 이 1건은 `history` 배열에는 전혀 들어가지
  않아 KPI에는 날짜가 뜨는데 이력 탭에는 그 AS가 안 보이는 모순이 있었다. 이번에 그 단일-조회를
  없애고, `lastAsAt`을 `history`의 AS 탭에 실제로 들어가는 것과 **같은 배열**
  (`installations`의 as건 + `tickets` 전체)에서 최댓값으로 계산하도록 바꿨다. 구조적으로 같은
  소스를 쓰므로 이 모순은 재발할 수 없다.
  - 단, `merchant_memo_entries`(entry_type='as')는 여전히 `lastAsAt` 계산에 포함되지만 관련
    업무 이력 AS 탭에는 넣지 않았다 — 이 항목이 5번 작업 지시("installations 중
    delivery_type='as' + tickets 중 type='as' AND merchant_id")에 메모를 포함하지 않았고,
    AS 메모는 같은 페이지의 "메모 히스토리" 섹션에 이미 항상 노출되고 있어 안 보이는 것은
    아니다. decisions.md가 기존에 정의한 `lastAsAt` 계산식(설치+티켓+메모 세 소스)도 그대로
    유지했다 — 이번 작업 지시가 그 계산식을 바꾸라고 하지 않았기 때문.
- `MerchantHistorySection.tsx`의 `HISTORY_TABS`에 AS/변경/설치·배송 이후 탭을 추가했다
  (라벨은 이미 `HISTORY_CATEGORY_LABEL`에 정의돼 있었다).

### 검증

- `node_modules/.bin/tsc --noEmit`: 통과.
- `node_modules/.bin/eslint "src/app/(app)/merchants/**/*.{ts,tsx}"`: 문제 없음.
- `node_modules/.bin/eslint "src/app/(app)/installs/InstallsClient.tsx"`: 26 errors/8 warnings —
  main 브랜치의 수정 전 같은 파일을 그대로 lint해도 동일하게 34 problems(26 errors, 8 warnings)가
  나와, 전부 이번 변경과 무관한 기존 부채임을 확인했다(새로 추가한 코드에서 발생한 에러 없음).
  이 파일 전체를 정리하는 건 이번 작업 범위를 크게 벗어나 손대지 않았다.
- `node_modules/.bin/prettier --write`(변경 파일 전체): 통과. 최초 작성 시 `InstallCompositionSection.tsx`의
  `updateMerchantEquipment` 호출부 한 줄이 길어져 자동 줄바꿈됨.
- dev Supabase 자격증명이 없어 이전 세션들과 동일하게 브라우저로 직접 클릭 검증은 못 했다.
  대신 코드 경로를 직접 추적해 아래 3가지를 확인했다.
  - **접수 연결 없는 가맹점에서 3번 저장 시도**: "가맹접수 원본 정보" 버튼 자체가
    `inst.franchise_application_id`가 있을 때만 렌더링되지만, 그 접수 건에 대응하는
    `merchants` 행이 아직 없으면(예: 아직 이관되지 않은 접수) `compositionMerchantId`가
    null로 남는다. 이 경우 `InstallCompositionSection`이 "구성 추가"/저장 버튼을 비활성화하고
    이유 문구를 보여준다(조용히 실패하지 않음) — 코드 추적으로 확인.
  - **장비 0행 / 이력 0건**: `equipment.length === 0`이면 "등록된 설치 구성이 없습니다.",
    `history.length === 0`이면 "관련 업무 이력이 없습니다."를 그대로 보여주는 기존 분기를
    유지했고, 새로 추가한 4개 쿼리 결과가 모두 빈 배열이어도 단순히 `history`에 아무것도
    push되지 않을 뿐 예외가 나지 않는다 — 코드 추적으로 확인.
  - **계약 시작일만 있을 때**: 위 "4. 계약기간 직접입력" 절의 검증 문단 참고 — 무한루프/잘못된
    값 없음을 코드 추적으로 확인.
- 사용자가 dev Supabase에 113~116을 순서대로 적용한 뒤 직접 확인해야 하는 것:
  - 115/116 적용 후 실제 이관 1건과 기존 가맹점 백필 결과(설치 구성 요약 카드에 세트 수가
    뜨는지, 116 파일 주석의 SELECT로 전/후 건수 비교).
  - `/installs`에서 접수 연결된 설치건을 열어 실제로 merchant_equipment 행이 뜨고, 등록/수정/
    삭제가 `/merchants`, `/merchants/[id]`에도 즉시 반영되는지(`revalidatePath` 확인).
  - 계약기간 입력 UI에서 개월수 ↔ 종료일 상호 계산이 화면상에서 자연스러운지.
  - "최근 A/S" KPI 날짜와 관련 업무 이력 AS 탭에 실제로 같은 건이 뜨는지.

## 2026-08-21: 미뤄둔 항목 1 — 가맹접수 화면에 "사용 프로그램" 입력란 추가

decisions.md 2026-08-20 절이 "`사용 프로그램`은 `franchise_applications.program`에서 읽는다"고
했지만, 이 컬럼을 채울 수 있는 화면이 `/transfers`(`case_type: "conversion"` 하드코딩)뿐이라
`/franchise`로 들어온 신규 접수는 뱃지가 영원히 비어 있었다. 이번에 `/franchise` 쪽 입력 경로를
추가했다.

- `PROGRAMS`(`["유니온", "아임유", "토스", "플릭"]`)를 `src/app/(app)/transfers/TransfersClient.tsx`
  로컬 상수에서 `src/types/index.ts`로 옮겼다. `EquipmentItem` 인터페이스 바로 아래,
  `FranchiseChannel` 타입 위에 뒀다 — 장비 카탈로그(`EQUIPMENT_CATALOG`)처럼 프로그램 목록도
  접수 관련 선택지 데이터라 같은 자리가 자연스럽다고 판단했다. `TransfersClient.tsx`는 로컬
  선언을 지우고 `@/types`에서 import하도록 바꿨다 — 값 복사가 아니라 참조 이전이라 두 화면이
  같은 배열을 공유한다.
- `FranchiseCreateDialog.tsx`(신규 접수 등록): `FranchiseCreateInput`에 `program: string` 추가,
  `initialForm()`에 `program: ""` 추가, "접수 정보" 섹션에 "사용 프로그램" `AppSelect`를 새 행으로
  추가했다("선택 안함" 옵션 포함, 기본 빈 값). 기존 4필드 행(접수날짜/카드가맹접수일/인터넷/담당자)에
  5번째로 욱여넣지 않고 별도 grid 행으로 뺐다 — 기존 grid가 `md:grid-cols-4`로 이미 꽉 차 있어
  칸을 좁히면 다른 필드들 레이아웃이 깨진다.
- `FranchiseClient.tsx`: `EMPTY_FORM`에 `program: ""` 추가, `handleCreate`의
  `franchise_applications` insert에 `program: form.program || null` 추가. 이 파일의 `EMPTY_FORM`은
  `FranchiseCreateDialog`가 내부적으로 관리하는 `FranchiseCreateInput`과 구조적으로 동일해야
  하는 타입이라(둘 다 인라인 객체 리터럴 타입, 이름으로 연결되지 않고 구조적 할당 가능성으로만
  검증됨) 두 곳 모두 고쳐야 tsc가 무결하다.
- `FranchiseDetailDrawer.tsx`(접수 상세 수정): 새 저장 경로를 만들지 않고 기존
  `onSave(field, value)`(→ `FranchiseClient.tsx`의 `saveField`, 이미 `keyof FranchiseApplication`
  아무 필드나 받는 범용 함수라 `"program"`도 그대로 통과) 패턴을 그대로 따라 "사용 프로그램"
  `AppSelect`를 추가했다. 기존 "인터넷"/"담당자" 2열 grid(`sm:grid-cols-2`)를 3열로 넓혀
  그 사이에 끼워 넣었다 — 인터넷 옆이 원래 있던 자리라 화면 흐름상 자연스럽고, 별도 행을 새로
  만들 필요가 없었다.
- 두 화면 모두 program 값 없음(`""`/`null`)을 그대로 허용한다 — 별도 필수값 검증을 추가하지
  않았다. 기존 데이터 대부분이 NULL이라는 지시사항대로다.

**뱃지까지 경로 추적** (`franchise_applications.program` → `loadMerchant360` →
`application.program` → 뱃지): `loadMerchant360.ts:282`의 select가 이미 `program`을 가져오고
있고(113/114와 무관하게 애초부터 select 대상이었음), `loadMerchant360.ts:600`에서
`application.program`으로 그대로 매핑한다. `MerchantsClient.tsx:99-101`,
`merchants/[id]/page.tsx:85-87`이 `application?.program`을 뱃지로 렌더링하고,
`MerchantInfoCard.tsx:212`도 `programLabel` prop(`application?.program ?? null`)으로 같은 값을
"사용 프로그램" 필드에 표시한다. 이번 변경은 이 경로 자체를 건드리지 않고 값을 채우는
입력단만 추가했으므로, `/franchise`에서 프로그램을 저장하면 `franchise_applications.program`
UPDATE/INSERT가 되고 → 해당 가맹점이 이미 `merchants`로 이관되어 있다면 다음 `/merchants`,
`/merchants/[id]` 로드 시 `loadMerchant360`이 최신 값을 다시 읽어와 뱃지에 그대로 반영된다
(별도 캐시나 동기화 로직 없음, 매 로드마다 `franchise_applications`를 직접 조회하므로 즉시
반영). 신규 접수(아직 이관 전)는 애초에 `merchants` 행이 없어 통합정보 화면 자체가 없으므로
이관 시점 이후에만 뱃지로 나타나는 것이 정상 동작이다.

### 검증

- `node_modules/.bin/tsc --noEmit`: 통과.
- ESLint 기준치 비교(변경 대상 폴더): `node_modules/.bin/eslint "src/app/(app)/franchise/**/*.{ts,tsx}" "src/app/(app)/transfers/**/*.{ts,tsx}" "src/types/**/*.{ts,tsx}"` —
  변경 전/후 동일하게 57 problems (11 errors, 46 warnings). 전부 이번 변경과 무관한 기존 부채
  (예: `FranchiseDetailDrawer.tsx`의 `useEffect` 내 동기 `setState`, `TransfersClient.tsx`의 미사용
  컴포넌트 등) — `git stash`로 변경 전 상태를 같은 명령으로 lint해 동일 수치임을 확인했다.
- `node_modules/.bin/prettier --check`(변경 파일 5개): 전부 실패로 나오지만, `git stash`로 변경 전
  같은 파일들을 같은 명령으로 검사해도 동일하게 실패한다 — 이 저장소의 Windows 체크아웃이
  CRLF라 prettier(LF 기준)와 항상 어긋나는 환경 문제이지 실제 포맷 깨짐이 아니다. `--write` 실행 후
  `git diff`로 실제 콘텐츠 변경분이 없는지 확인했다(이번에 추가한 코드 블록 외에는 아무것도 안
  바뀜, import 문 줄바꿈 스타일 하나만 재포맷됨).
- `/transfers` 프로그램 선택·저장: `saveField`가 그대로 `PROGRAMS` import본을 쓰므로 동작 변경
  없음 — 코드 추적으로 확인, 값 목록·저장 컬럼·onValueChange 핸들러 전부 동일하다. dev Supabase
  자격증명이 없어 브라우저 직접 클릭 검증은 이전 세션들과 동일하게 못 했다.
- 사용자가 직접 확인해야 하는 것: `/franchise`에서 신규 접수를 등록/수정할 때 "사용 프로그램"
  선택이 저장되는지, 그 접수가 기술지원 이관되어 `merchants` 행이 생긴 뒤 `/merchants`,
  `/merchants/[id]` 헤더에 프로그램 뱃지로 뜨는지.
