# 설치관리 "가맹접수 원본 정보" 드로어 전환 결정사항

## 2026-08-20

`/installs`의 "가맹접수 원본 정보" 가운데 모달을 `src/app/(app)/franchise/FranchiseDetailDrawer.tsx`
기준 디자인(우측 슬라이드 드로어, 시맨틱 토큰)으로 바꾸는 작업. **디자인만 변경**하며 서버 액션·
Supabase 쿼리·상태 관리 로직은 그대로 유지한다. 배경/코드 근거는
[flow.md](./flow.md) 참고.

### 구조: 새 파일 3개로 분리

- `InstallsClient.tsx`(3,700줄)에 인라인으로 있던 모달을 `InstallDetailDrawer.tsx`로 추출했다.
- 상태 라벨/색/순서 매핑(`STATUS_LABELS`, `STATUS_COLORS`, `statusLabel`, `statusOrderFor`,
  `DeliveryType` 등)은 원래 `InstallsClient.tsx` 안에 있었는데, `InstallDetailDrawer.tsx`가
  이 매핑이 필요하고 `InstallsClient.tsx`는 `InstallDetailDrawer`를 렌더링해야 해서, 그대로
  두면 두 파일이 서로를 import하는 순환 참조가 생긴다. 순환 참조 시 `InstallDetailDrawer.tsx`의
  모듈 최상단 `const STAGES = STATUS_ORDER_INSTALL.map(...)`이 `InstallsClient.tsx`가 아직 그
  줄까지 평가되기 전에 실행돼 `undefined.map()`으로 런타임 에러가 난다. 그래서 상태 매핑만
  `installStatus.ts`로 뽑아 양쪽이 거기서 import하게 했다 — 표/필터/모바일뷰가 쓰는 값과
  드로어가 쓰는 값은 정확히 같은 상수(재선언 아님)다. 표/필터 쪽 사용 코드는 손대지 않았다.

### 타입: `franchiseDetail`의 `as any` 20여 개 정리

- `openFranchiseDetail()`의 실제 select는 `franchise_applications`에 `"*"` + `sales`/`cs` 조인
  (`name`만)이다. 이 드로어가 실제로 읽는 필드만 추려 `InstallFranchiseDetail` 타입으로
  선언했다(`business_name`, `owner_name`, `phone`, `business_number`, `address`,
  `address_detail`, `open_date`, `install_date`, `van_company`, `internet`,
  `equipment_items`, `memo`, `sales.name`, `cs.name`). `@/types`의 `FranchiseApplication`을
  그대로 쓰지 않은 이유: 그 타입은 `sales?: Profile`처럼 전체 프로필을 기대하는데 실제 쿼리는
  `name`만 select하므로, 그대로 캐스팅하면 실제로 없는 필드(`id`, `role` 등)가 있다고 거짓
  타입을 붙이게 된다.
- 모달 안 16개 `as any` + `openFranchiseDetail`의 `setFranchiseDetail(data ?? null)` 1개까지
  총 17개가 사라졌다. `InstallsClient.tsx`에 남은 6개(807, 1704, 1779, 1791, 1792, 1796행 —
  `installs` 목록 fetch/필터 쪽)는 이번 작업 범위(표/필터) 밖이라 손대지 않았다.

### 설치 진행 스테퍼 — delivery_type별 실제 순서를 그대로 축으로 사용

(최초 구현은 아래와 다르게 "설치 5단계 고정 축 + 비례 배분" 방식이었으나, 뱃지와 스테퍼가
서로 다른 단계를 가리키는 문제가 있어 2026-08-20 후속 작업에서 지금 방식으로 고쳤다.
자세한 문제 재현/수정 근거는 [flow.md](./flow.md)의 "스테퍼가 배송유형별 실제 단계를
그리도록 수정" 항목 참고.)

- 배송유형마다 실제 상태 흐름이 다르다 — 설치 5단계(접수→제품준비→일정확정→이동중→설치완료),
  택배발송 4단계(접수→제품준비→택배발송→완료), AS 4단계(접수→일정확정→이동중→AS완료).
  고정된 축에 다른 유형을 비례 배분하면 뱃지와 스테퍼가 서로 다른 단계를 가리키므로, 이미
  있는 `statusOrderFor(deliveryType)`가 준 순서를 **그대로** 스테퍼 축으로 그린다. 라벨도
  `statusLabel(stageStatus, deliveryType)`로 해당 유형의 실제 문구를 쓴다.
- `status`가 해당 배송유형의 순서 배열에 없는 값(가장 흔한 경우는 `rejected`)이면 진행 위치를
  계산하지 않고 스테퍼를 진행 없음(회색) 상태로 그린다.
- 스테퍼 점의 solid 색(`STAGE_TONE`)은 새로 선언했다. `STATUS_COLORS`는 배지용 옅은 톤
  (`bg-x-50`)이라 진행선에 쓰기엔 흐리기 때문 — `FranchiseDetailDrawer`의 `tone()`도 배지
  pill과 별개로 solid 색을 따로 갖고 있어 같은 방식을 따랐다. 상태 뱃지 자체는 요구사항대로
  `STATUS_COLORS`/`statusLabel`을 그대로 재사용한다(새로 안 만듦).

### 헤더 — 데이터 로딩/실패 상태

- 요청서의 헤더 스펙(제목=상호명, 부제=대표자·연락처, 뱃지+스테퍼)은 데이터가 이미 로드된
  상태를 전제로 한다. 로딩 중이거나 조회 실패 시에는 제목만 "불러오는 중..." /
  "정보를 불러올 수 없습니다"로 바꾸고 부제·뱃지·스테퍼는 렌더링하지 않는다. 원래 모달에도
  없던 상태라 새로 정한 것이며, 빈 부제("· ")나 회색 뱃지를 보여주는 것보다 자연스럽다고
  판단했다.

### 본문 필드 — 빈 값 숨김 범위 확장

- 원래 모달은 `[label, value].map(...)`에서 값이 없으면 그 필드 행 자체를 숨겼다(섹션 개념
  자체가 없었음). 섹션으로 묶으면서, 섹션에 속한 필드가 전부 비어 있을 때 섹션 제목까지
  숨기도록 확장했다(예: 일정 섹션에 오픈예정일·설치발송일이 둘 다 없으면 "일정" 제목 자체가
  안 뜬다). 필드 자체를 추가/삭제한 게 아니라, "값 없으면 숨긴다"는 기존 규칙을 섹션 단위로
  일관되게 적용한 것이다.

### (해소됨) "접수 연결 없는 설치건" 시나리오

당시엔 "franchise_application_id NULL일 때 드로어를 열면 '정보를 불러올 수 없습니다'가
뜬다"는 지시서의 전제를 코드로 재현하지 못했다(드로어 자체가 `franchiseDetail !== null`로
열려 있어서, 조회 실패 시 문구가 뜨기 전에 드로어 전체가 닫혀버렸다). 2026-08-20 (3) 작업에서
드로어의 개폐 조건을 `franchiseDetail`이 아니라 설치건 자체(`activeDetailInst`)로 바꾸면서
이 문제가 부수적으로 해소됐다 — 자세한 내용은 [flow.md](./flow.md) 참고.

## 2026-08-20 (2)

`/installs`, `/installs/delivery`의 표 행 클릭 시 펼쳐지던 인라인 확장 행
(`<tr className="bg-blue-50/50">`)을 위 드로어로 흡수하는 작업. 배경과 상세 작업 내역은
[flow.md](./flow.md)의 "인라인 확장 행을 같은 드로어로 흡수" 항목 참고. 여기엔 판단이
필요했던 지점만 남긴다.

### "관리" 열을 드로어로 옮길지 — 사용자에게 직접 확인

지시서는 반려/삭제/승인이력 Popover를 "확장 행 안에 있는 것"으로 설명했지만, 실제로는
행이 펼쳐졌는지와 무관하게 항상 보이는 별도의 "관리" 열(칼럼)에 있었다. 이 열을 그대로
테이블에 남길지, 드로어로 옮기고 테이블에서 제거할지는 UX에 영향이 커서(빠른 조작 vs
단일 진입점) 임의로 정하지 않고 사용자에게 세 가지 선택지를 제시했다:
"관리 열 전체를 드로어로 이전(권장)" / "테이블에 그대로 둠" / "둘 다(중복 노출)".
사용자가 첫 번째를 선택해 관리 열을 통째로 드로어 하단 액션 바로 옮기고 테이블 열은
제거했다.

### 순환 참조 회피 대상 확장: `InstallItemsEditor`

`installStatus.ts`를 분리했던 것과 같은 이유로, "제품" 필드 편집에 쓰는
`InstallItemsEditor`(및 의존 컴포넌트 `QtyStepper`, 데이터 `PRODUCT_CATALOG`)도
`InstallItemsEditor.tsx`로 분리했다. 이 컴포넌트는 모바일 카드 뷰(건드리지 않음)와 새
드로어 양쪽에서 필요한데, `InstallsClient.tsx` 안에 그대로 두면 드로어가 그 컴포넌트를
가져오면서 `InstallsClient.tsx` ↔ `InstallDetailDrawer.tsx` 순환 참조가 생긴다.

### `Installation`/`CompletionApproval` 타입을 `InstallsClient.tsx`에서 export

드로어가 설치건 자체를 주로 다루게 되면서 이 두 타입이 필요해졌다. 별도 파일로 옮기지
않고 `InstallsClient.tsx`에 `export`만 붙이고 드로어에서 `import type`으로 가져왔다 —
타입 전용 import는 컴파일 시 완전히 지워지므로 순환 참조를 일으키지 않는다(값을 가져오는
`InstallItemsEditor`/상태 매핑과는 다른 경우).

### 편집 방식은 배치저장 그대로 — FranchiseDetailDrawer의 blur 자동저장으로 바꾸지 않음

FranchiseDetailDrawer의 `EditableInput`은 필드마다 blur 시 바로 저장한다. 하지만 지시서가
"인라인 편집: ... (`detailDraft`, `saveInstallField`, canEdit 권한 분기 포함) 반드시 그대로
살릴 것"이라고 명시했으므로, 여러 필드를 고친 뒤 "저장" 버튼 한 번으로 일괄 반영하는 기존
방식을 유지했다. 디자인(레이아웃/토큰)만 맞추고 저장 방식(언제 커밋되는지)은 건드리지
않는다는 원칙에 따른 것이다.
