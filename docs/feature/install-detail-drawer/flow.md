# 설치관리 "가맹접수 원본 정보" 드로어 전환 작업 흐름

## 2026-08-20

### 배경

`/installs`의 "가맹접수 원본 정보" 모달이 가운데 팝업 + 2열 라벨/값 나열 + `✕` 문자 닫기
버튼으로, `src/app/(app)/franchise/FranchiseDetailDrawer.tsx`가 쓰는 신형 디자인 시스템
(우측 슬라이드 드로어, 시맨틱 토큰, `StageProgress`/`Field` 패턴)과 어긋나 있었다. 디자인만
맞추고 동작·데이터·액션은 그대로 두는 작업.

### 한 일

1. **컴포넌트 추출**: `InstallsClient.tsx` 1965~2051행(대략)의 인라인 모달을
   `src/app/(app)/installs/InstallDetailDrawer.tsx`로 뽑았다. `InstallsClient.tsx`가
   3,700줄이라 인라인으로 두면 리뷰가 안 된다는 지시대로.
2. **상태 매핑 분리**: `STATUS_LABELS`/`STATUS_COLORS`/`statusLabel`/`statusOrderFor`/
   `DeliveryType` 등을 `InstallsClient.tsx`에서 `installStatus.ts`로 옮겼다. 순환 참조를
   피하기 위한 선택이었다 — 근거는 decisions.md 참고. `InstallsClient.tsx`의 표/필터/모바일뷰
   JSX가 이 상수들을 쓰는 코드 자체는 한 글자도 바꾸지 않았고, import 출처만 바뀌었다.
3. **레이아웃**: 가운데 모달(`fixed inset-0 flex items-center justify-center`) →
   `FranchiseDetailDrawer`와 동일한 우측 드로어(`fixed inset-0` 오버레이 + `absolute inset-y-0
right-0` aside, `w-[820px] max-w-[calc(100vw-32px)]`, `role="dialog" aria-modal="true"
aria-labelledby`). 닫기 버튼을 `✕` 문자에서 `lucide XIcon`으로 교체.
4. **헤더 재구성**: 제목=상호명, 부제=대표자·연락처, 그 아래 현재 설치 상태 뱃지(`STATUS_COLORS`
   - `statusLabel` 재사용) + 설치 진행 스테퍼(`InstallStageProgress`, 신규 — 근거는
     decisions.md).
5. **본문 필드 정리**: `[label, value]` 배열 나열 → `Field` 컴포넌트 + 섹션 그룹핑
   (기본정보/일정/연동/담당), 접수 장비·비고는 기존처럼 있을 때만 표시. 필드 자체는 추가/삭제
   없이 그대로 재배치.
6. **설치 구성 편집 섹션**: `InstallCompositionSection` 사용은 그대로 이식(props·위치 동일),
   내부 로직은 건드리지 않음.
7. **타입 정리**: `franchiseDetail` state를 `Record<string, unknown>`에서
   `InstallFranchiseDetail`(신규, `InstallDetailDrawer.tsx`에 정의)로 바꾸고, 모달 안
   `as any` 16개 + `setFranchiseDetail(data ?? null)`의 암묵적 `any` 1개, 총 17개를 제거했다.
   `InstallsClient.tsx`의 다른 부분(표/필터, 807·1704·1779·1791·1792·1796행)에 남아있는
   `as any` 6개는 건드리지 않았다(이번 범위 밖).

### 건드리지 않은 것

- 서버 액션, Supabase 쿼리, 상태 관리 로직(`openFranchiseDetail`, `compositionMerchantId` 등
  전부 동일).
- 표 행의 일정확정/이동중/택배발송/완료/반려/승인요청/사진 액션 — 드로어로 옮기지 않음.
- `InstallsClient.tsx`의 표/필터/KPI/모바일 뷰 JSX.
- 필드 인라인 편집 — 여전히 읽기 전용.

### 검증

- `node_modules/.bin/tsc --noEmit`: 통과.
- ESLint (`InstallsClient.tsx`) 오류 개수 비교:
  - 작업 전: 26 errors (no-explicit-any 23 + set-state-in-effect 3), 8 warnings.
  - 작업 후: 9 errors (no-explicit-any 6 + set-state-in-effect 3 — 그대로), 8 warnings.
  - 모달 안에 있던 no-explicit-any 17개가 사라지고, 범위 밖 6개와 set-state-in-effect 3개는
    그대로다. **오류가 늘지 않았고 17개 줄었다.**
  - `InstallDetailDrawer.tsx`, `installStatus.ts`(신규): ESLint 0 errors, 0 warnings.
- `npx prettier --check` (변경/신규 파일 전체): 통과 (`InstallsClient.tsx`,
  `InstallDetailDrawer.tsx`는 최초 작성 시 줄바꿈이 어긋나 `--write`로 재포맷).
- `npm run build`: Turbopack 컴파일 + TypeScript 단계까지 통과. 이후 페이지 데이터 수집 단계에서
  `supabaseUrl is required`로 중단됨 — dev Supabase 자격증명이 없는 기존 환경 제약
  (merchant-unified-view/flow.md에도 동일 증상 기록됨)이며 이번 변경과 무관.

### 확인 요청: "접수 연결 없는 설치건" 시나리오

지시서에는 "접수 연결이 없는 설치건(franchise_application_id NULL)에서 드로어를 열었을 때
기존과 동일하게 동작하는지 (지금은 '정보를 불러올 수 없습니다' 문구가 뜸)"을 확인하라고
되어 있었는데, 코드를 추적한 결과 이 전제를 그대로 재현할 수 없었다:

- `openFranchiseDetail`을 호출하는 버튼("가맹접수"/"가맹접수 원본 보기")은 두 곳 모두
  `{inst.franchise_application_id && (...)}`로 감싸여 있어서, `franchise_application_id`가
  `NULL`인 설치건에는 애초에 버튼 자체가 렌더링되지 않는다. 즉 UI상 그 상태로는 드로어를 열
  방법이 없다.
- "정보를 불러올 수 없습니다" 문구가 뜨는 조건(`franchiseDetail && Object.keys(...).length ===
0`)도 현재 부모 쪽 렌더 조건(`{franchiseDetail !== null && (...)}`)과 겹쳐 사실상 도달
  불가능하다: `openFranchiseDetail`이 조회에 실패하면 `setFranchiseDetail(data ?? null)`이
  `franchiseDetail`을 `null`로 만들어버리는데, 그러면 바깥 조건이 꺼지면서 드로어 전체가
  사라진다 — "정보를 불러올 수 없습니다" 문구가 뜰 새 없이 그냥 닫힌다. 이 동작은 원래 모달도
  똑같이 갖고 있던 구조라(내가 새로 만든 게 아니라) 이번 작업에서 그대로 옮겼다. 손대지 않았다.
- 이 두 지점은 "디자인만 바꾸기"라는 이번 작업 범위를 벗어나는 별도의 동작 이슈로 보여서
  고치지 않고 그대로 이식만 했다. 실제로 "정보를 불러올 수 없습니다"를 재현하려면
  `franchise_application_id`는 있지만 그 값이 가리키는 `franchise_applications` 행이
  삭제된 것 같은 고아 참조 상황이 필요해 보이는데, 이 경우도 위에서 설명한 대로 문구가 뜨기
  전에 드로어가 통째로 닫혀버린다. 이 부분을 고칠지(별도 버그 수정 작업으로), 그냥 이대로
  둘지는 사용자 확인이 필요하다.
