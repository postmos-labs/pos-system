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

### 설치 진행 스테퍼 — delivery_type='delivery' 처리

- 5단계 축(`STAGES`)은 `STATUS_ORDER_INSTALL`(접수/물품준비/일정확정/이동중/완료)의 라벨을
  그대로 쓴다.
- `delivery_type='delivery'`(택배발송) 흐름은 실제로는 접수→물품준비→택배발송→완료 4단계뿐이라
  (일정확정·이동중이 없음) 이 5단계 축에 상태값이 1:1로 대응되지 않는다. 이미 있는
  `statusOrderFor(deliveryType)`로 해당 배송유형의 실제 상태 순서를 구한 뒤, 그 안에서 현재
  상태의 위치를 5단계 축에 비례 배분(`position / (order.length-1) * 4`, 반올림)하는 방식으로
  풀었다. 결과적으로 택배발송(`delivery_sent`, 구버전 데이터의 `in_transit` 포함)은 축 뒤쪽
  ("이동중" 위치)에 놓이고 "일정확정" 노드는 지나간 것으로만 표시된다.
- 이 근사치가 허용되는 이유: 정확한 상태 문구는 스테퍼 위에 별도로 뜨는 상태 뱃지가
  `statusLabel()`로 그대로 보여준다(요구사항 3). 스테퍼는 대략적 진행 위치만 보여주는 보조
  시각 요소이므로, "일정확정"을 실제로 거치지 않아도 시각적으로 지나간 것처럼 그려지는 정도의
  근사는 데이터를 왜곡하는 게 아니라고 판단했다.
- `status`가 해당 배송유형의 순서 배열에 없는 값(가장 흔한 경우는 `rejected`)이면 진행 위치를
  계산하지 않고(`stageIndex` → `null`) 스테퍼를 진행 없음(회색) 상태로 그린다.
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

### 확인 필요: "접수 연결 없는 설치건" 시나리오

flow.md의 검증 항목 참고 — 지시서에 적힌 "franchise_application_id NULL일 때 드로어를 열면
'정보를 불러올 수 없습니다'가 뜬다"는 전제를 코드로 재현하지 못했다. 자세한 내용과 실제로
어떤 경우에 그 문구가 뜨는지는 flow.md에 기록했다.
