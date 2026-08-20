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

## 2026-08-20 (후속) — 스테퍼가 배송유형별 실제 단계를 그리도록 수정

### 문제

최초 구현은 `STAGES`를 `STATUS_ORDER_INSTALL`(설치 5단계)로 **고정**해두고, 현재 위치만
`statusOrderFor(deliveryType)`로 구해 5단계 축에 비례 배분(`Math.round`)했다. 그 결과
설치가 아닌 유형에서 뱃지와 스테퍼가 서로 다른 단계를 가리켰다.

- AS 건 `scheduled`(일정확정): `round(1/3 × 4) = 1` → 축의 1번 노드인 **"제품준비"** 에 점이 찍힘.
  뱃지는 "일정확정"인데 스테퍼는 "제품준비".
- 택배발송 건 `delivery_sent`: `round(2/3 × 4) = 3` → **"이동중"** 에 점이 찍히고, 택배 흐름에
  존재하지도 않는 "일정확정"이 이미 지나간 단계로 표시됨.

주석에는 "근사치를 허용했다"고 근거를 남겼지만, 근사치가 아니라 다른 단계를 가리키는 것이라
상태를 한눈에 보라고 넣은 스테퍼가 오히려 오독을 유발했다.

### 수정

고정 축과 비례 배분을 없애고, `statusOrderFor(deliveryType)`가 준 순서를 **그대로 축으로**
그린다. 라벨도 `statusLabel(stageStatus, deliveryType)`로 해당 유형의 문구를 쓴다.

- 설치: 접수 → 제품준비 → 일정확정 → 이동중 → 설치완료 (5단계)
- 택배발송: 접수 → 제품준비 → 택배발송 → 완료 (4단계)
- AS: 접수 → 일정확정 → 이동중 → AS완료 (4단계)

`stageIndex()` 함수와 `Math.round` 보정이 통째로 없어졌다. `position`이 곧 `stage`다.
React key도 라벨 대신 상태값(`stageStatus`)을 쓴다.

`STATUS_ORDER_INSTALL` / `STATUS_LABELS` import는 이 수정으로 쓰이지 않게 되어 제거했다
(`installStatus.ts`의 export는 그대로 유지 — 다른 곳에서 쓸 수 있다).

### 검증

순수 로직을 그대로 옮겨 4개 케이스를 추적했고, 전부 뱃지 = 스테퍼 현재 단계로 일치했다.

| 유형/상태                | 뱃지     | 스테퍼 현재 점 | 축                                     |
| ------------------------ | -------- | -------------- | -------------------------------------- |
| as / scheduled           | 일정확정 | 일정확정       | 접수→일정확정→이동중→AS완료            |
| delivery / delivery_sent | 택배발송 | 택배발송       | 접수→제품준비→택배발송→완료            |
| install / scheduled      | 일정확정 | 일정확정       | 접수→제품준비→일정확정→이동중→설치완료 |
| install / rejected       | 반려     | (표시 안 함)   | —                                      |

`rejected`처럼 순서에 없는 상태는 기존과 동일하게 진행 표시를 하지 않는다.

`tsc --noEmit` 통과. ESLint는 이번 수정 전후 모두 9 errors / 8 warnings로 동일
(전부 InstallsClient.tsx에 원래 있던 부채).

### 함께 정리한 것

- `InstallsClient.tsx`에 마크업 정리 흔적으로 남아 있던 빈 JSX 표현식 `{}` 제거.

## 2026-08-20 (3) — 인라인 확장 행을 같은 드로어로 흡수

### 배경

`/installs`, `/installs/delivery`에서 표 행(상호명)을 클릭하면 펼쳐지던 **인라인 확장 행**
(`detailInst` 상태, `<tr className="bg-blue-50/50">`)을 가맹접수 원본 드로어와 같은 우측
드로어로 바꾸는 작업. 착각 방지용으로 지시서에 명시된 것처럼, 이전 작업(2026-08-20)에서
바꾼 건 확장 행 **안의** 보라색 "가맹접수" 버튼이 여는 별도 드로어였고, 확장 행 자체는
그대로 남아 있었다. 이번이 그 확장 행 차례.

### 작업 전 체크리스트 (지시서 요청대로 먼저 뽑음)

**A. 실제 인라인 확장 행(`detailInst?.id === inst.id`) 안에 있던 것:**

- 편집 필드: 상호명/고객명/전화번호/주소(모두 `canEdit`일 때 input, 아니면 텍스트) · 제품
  (`InstallItemsEditor`) · 비고(textarea)
- 읽기 필드: 상태 · 담당기사 · 등록자 · 등록일
- 설치완료 사진 썸네일 + 다운로드 링크
- 하위 컴포넌트: `InstallationActivityHistory`, `NotificationHistory`
- 버튼: 가맹접수 원본 보기 / 우국상 원본 보기 / 완료 이후 메모(완료·택배발송만) / 저장
  (`saveRowNow`, `detailDraft` 일괄 저장) / `HistoryButton`(변경이력)

**B. 사용자에게 미리 확인한 불일치**: 반려/삭제/승인이력 Popover는 실제로는 확장 행이 아니라
같은 행의 **"관리" 열**(항상 보이는 칼럼, `detailInst`와 무관)에 있었다 — 링크복사/일정변경/
승인대기뱃지+반려·승인/비고이력 Popover/반려(기술 전용)/삭제. 이 열도 드로어로 옮기고
테이블에서는 제거할지 물었고, "관리 열 전체를 드로어로 이전(권장)"으로 확정받았다.

### 한 일

1. **`InstallDetailDrawer.tsx`를 "설치건 상세" 드로어로 확장**: 기존엔 가맹접수 원본만
   보여줬는데, 이제 설치건 자체가 주가 되고 가맹접수 원본은 그 안의 접었다 펼 수 있는
   섹션(`franchiseOpen`)이 됐다. 드로어는 여전히 하나다.
2. **순환 참조 회피를 위한 추가 분리**: `InstallItemsEditor`/`QtyStepper`/`PRODUCT_CATALOG`를
   `InstallsClient.tsx`에서 `InstallItemsEditor.tsx`로 뽑았다. 이 컴포넌트가 모바일 카드 뷰
   (건드리지 않음)와 새 드로어 양쪽에서 필요한데, `installStatus.ts`를 뽑았던 것과 같은
   이유로 안 그러면 `InstallsClient.tsx` ↔ `InstallDetailDrawer.tsx` 순환 참조가 생긴다.
3. **표에서 제거**: "관리" 열(`<td>`, `MAIN_COLUMNS`의 `actions` 항목 포함)과 인라인 확장 행
   `<tr>`을 통째로 제거. 행 클릭 시 동작을 "그 자리에서 펼치기" → "드로어 열기"로 변경
   (`openInstallDetail`/`closeInstallDetail` 신설, 같은 행 재클릭 시 닫히는 토글 동작은 유지).
4. **가맹접수 원본 조회 시점 이동**: `openFranchiseDetail()` 쿼리는 그대로 두고, 이제
   `openInstallDetail()`이 드로어를 열 때 `franchise_application_id`가 있으면 함께
   호출한다. `installationId` 인자는 더 이상 필요 없어(호출부에서 `installation.id`를 직접
   씀) 시그니처에서 뺐다.
5. **상태 관리 정리**: `compositionInstallationId` state는 `installation.id`로 완전히
   대체되어 제거(선언 + `openFranchiseDetail` 안의 setter 호출 모두). `activeDetailInst`를
   새로 추가해 `installs` 배열에서 매번 최신 값을 다시 찾아 드로어에 넘긴다 — 인라인 확장
   행이던 시절 `installs.map`의 루프 변수를 직접 쓰던 것과 동일한 효과(저장/상태변경 후
   드로어가 stale 데이터를 보여주지 않도록).
6. **타입 정리**: `Installation`, `CompletionApproval`을 `InstallsClient.tsx`에서
   `export`해 드로어가 `import type`으로 가져다 쓴다(타입 전용 import라 순환 참조 문제
   없음).
7. **디자인**: 시맨틱 토큰만 사용(`bg-card`/`text-foreground`/`text-muted-foreground`/
   `border-border`/`bg-primary`), 편집 입력창은 FranchiseDetailDrawer의 `inputClass`
   패턴을 새 파일에도 옮겨 적용. 액션 버튼은 하단 바(footer)로 모았고, 색상 의미가 있는
   것(반려=red, 승인=green, 대기=amber, 우국상=teal, 일정변경=indigo)은 FranchiseDetailDrawer
   자신의 footer도 같은 방식(기능색은 유지, 회색만 토큰화)이라 그대로 따랐다.
8. **권한 분기**: 승인/반려 가능 여부(`canDecideApproval`), 기술 반려 노출(`showTechReject`),
   삭제 노출(`showDelete`), 일정변경 노출(`showReschedule`)을 원래 "관리" 열에 있던 조건식
   그대로 드로어 컴포넌트 안으로 옮겼다(불리언 표현식 한 글자도 안 바꿈). 승인 워크플로
   관련 조건은 `profile`(role/approval_role/id)을 그대로 프롭으로 받아 판단한다.
9. **`key={activeDetailInst.id}`**: 드로어에 추가. 설치건 A를 열어 "가맹접수 원본" 섹션을
   펼쳐둔 채로 다른 행 B를 클릭하면, key가 없으면 `franchiseOpen` 같은 드로어 내부 로컬
   상태가 B에도 그대로 남는다. `detailDraft`(편집 값)는 애초에 부모 state라 매번
   `openInstallDetail`에서 새로 시딩되므로 이 문제가 없지만, 드로어 내부 UI 상태는 이
   보장이 없어 key로 리마운트시켰다.

### 작업 중 발견하고 고친 실수

`InstallDetailDrawer.tsx` 전체를 다시 작성하면서, 지난 세션(2026-08-20 후속)에서 이미
고쳐 커밋된 스테퍼 로직(배송유형별 실제 상태 순서를 그대로 축으로 쓰는 방식)을 모르고
그 이전의 구버전 로직(설치 5단계 고정 축에 `Math.round`로 비례 배분)으로 되돌려버렸다.
`git diff`로 직접 대조해 발견하고, `statusOrderFor(deliveryType)`가 준 순서를 그대로
축으로 쓰는 원래 로직으로 복구했다 — 새 파일의 나머지 구조(헤더/섹션/액션 버튼)는 그대로
두고 스테퍼 부분만 되돌렸다. 안 쓰게 된 `STATUS_ORDER_INSTALL` import도 제거했다.

### 건드리지 않은 것

- 모바일 뷰의 별도 확장(`mobileExpandedId`)과 그 안의 상태변경/반려 버튼 — 지시서대로
  손대지 않았다. `InstallItemsEditor`를 공유 파일로 뽑으면서 모바일 뷰의 import 출처만
  바뀌었고 그 화면 자체의 JSX/동작은 그대로다.
- 표 본체, 필터, KPI, 정렬, 드래그 순서 변경, 일괄삭제.
- 서버 액션과 Supabase 쿼리 로직 — `saveRowNow`/`saveInstallField`/`saveInstallItems`/
  `handleStatusChange`/`approveCompletion`/`rejectCompletion`/`handleDelete`/`copyLink`
  전부 기존 함수를 그대로 재사용, 내부 로직 무변경.
- 상태 전이 규칙, 알림톡 발송, 승인 워크플로.
- 필드 인라인 편집 방식 — 여전히 `detailDraft` 일괄 편집 + "저장" 버튼 클릭 방식(개별
  필드 blur 자동저장으로 바꾸지 않았다. FranchiseDetailDrawer의 `EditableInput`은 blur
  자동저장이지만, 지시서가 "`detailDraft`, `saveInstallField`... 그대로 살릴 것"이라고
  명시했으므로 기존 배치저장 방식을 유지했다).

### 검증

- `node_modules/.bin/tsc --noEmit`: 통과.
- ESLint `InstallsClient.tsx` 단독: 작업 전후 동일하게 **9 errors / 8 warnings** (지시서
  기준선과 일치, 늘지 않음). 내역: no-explicit-any 6(범위 밖, 807·1704·1779·1791·1792·1796행)
  - set-state-in-effect 3(무관한 기존 이슈) = 9 errors. warnings 8개도 이미지 태그 2개
    (모바일 뷰) 포함 그대로.
- `InstallDetailDrawer.tsx`(전면 재작성) + `InstallItemsEditor.tsx`(신규): 0 errors,
  1 warning(`<img>` no-next-image — 원래 확장 행 안에 있던 설치완료 사진 썸네일이 그대로
  옮겨온 것뿐, 새로 생긴 문제 아님. InstallsClient.tsx 쪽 이미지 경고는 3개→2개로 줄어
  전체 경고 총량은 늘지 않았다).
- `npx prettier --check`(변경/신규 파일 전체): 통과.
- `npm run build`: Turbopack 컴파일 + TypeScript 단계까지 통과, 이후 `supabaseUrl is
required`로 중단 — 기존 환경 제약, 무관.
- 코드 추적으로 확인한 것(직접 dev DB로 클릭 확인은 못 함, 자격증명 없음):
  - **편집 후 저장 반영**: `onDraftChange`가 부모의 `setDetailDraft`를 그대로 호출하고,
    "저장" 버튼은 `onSave`→`saveRowNow(activeDetailInst.id)`를 그대로 호출한다. 필드 비교
    로직(`saveRowNow` 내부)도 안 건드렸으므로 기존과 동일하게 반영되어야 한다.
  - **반려·삭제·승인이력·권한 분기**: 8번 항목대로 조건식을 그대로 옮겼고, 콜백도
    `handleDelete`/`rejectCompletion`/`approveCompletion`/`setRejectModal` 원본 함수를
    그대로 호출한다.
  - **`/installs`, `/installs/delivery`, `/installs/mine` 세 라우트 전부** 같은
    `InstallsClient` 컴포넌트를 그대로 import해서 쓰므로(각 `page.tsx` 확인) 세 곳 모두
    동일하게 반영된다.
  - **franchise_application_id 없는 설치건**: `openInstallDetail`이 이 경우
    `openFranchiseDetail`을 호출하지 않고 관련 state를 바로 null/빈 값으로 정리하고,
    드로어는 `installation.franchise_application_id`가 없으면 "가맹접수 원본" 섹션
    자체를 렌더링하지 않는다(지시서 4번 요구사항대로). 나머지 섹션(설치 정보/일정·담당/
    이력/사진/실제 설치 구성)과 액션 버튼은 franchise 연결과 무관하게 그대로 동작한다.
    **부수 효과**: 이전 세션 flow.md에 남겨둔 "정보를 불러올 수 없습니다가 사실상 도달
    불가능하다"는 이슈도 이번 구조 변경으로 자연히 해소됐다 — 이제 드로어 전체를 여닫는
    조건이 `franchiseDetail`이 아니라 `activeDetailInst`(설치건 자체)이므로, 가맹접수
    조회가 실패해도 드로어는 안 닫히고 그 섹션만 "정보를 불러올 수 없습니다"를 정상적으로
    보여준다.
