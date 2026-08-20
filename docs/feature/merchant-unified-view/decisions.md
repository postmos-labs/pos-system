# 가맹점 통합정보 결정사항

## 2026-08-20

제안된 목업(가맹점 통합정보 화면)을 기존 `/merchants` 360도 뷰 위에 얹기 위한 설계 결정.
구현 상세와 작업 순서는 [design.md](./design.md), 기존 360도 뷰 결정은
[../merchants-360/decisions.md](../merchants-360/decisions.md) 참고.

### 화면 배치

- 목업 화면은 `/merchants/[id]` 전체 페이지로 만든다. 목업은 좌측 목록이 없는 전폭 레이아웃이고,
  설치 구성 상세 표(6컬럼)와 2단 카드가 기존 우측 패널 폭에서는 읽히지 않는다.
- 현재 `/merchants/[id]`는 `tickets`만 나열하는 구식 화면이라 그대로 대체한다. 북마크 호환은
  같은 URL을 유지하므로 깨지지 않는다.
- `/merchants` 2패널은 진입점으로 유지한다. 다만 우측 패널의 편집 기능(정보 수정 / 메모 등록 /
  장비 등록)은 전부 `/merchants/[id]`로 옮기고, 패널은 읽기 전용 요약 + `통합정보 열기` 버튼으로
  슬림화한다. 같은 폼을 두 곳에서 관리하지 않기 위함.

### 설치 구성 데이터

- 목업의 `설치 구성 요약`(메인포스/키오스크/테이블오더 세트 수)과 `설치 구성 상세`
  (설치구분·구성·수량·제조사/공급사·설치위치·비고)를 담을 데이터가 현재 없다.
  - `franchise_applications.equipment_items`는 `{name, quantity}` 평면 배열이라 카테고리·제조사·
    설치위치가 없고, 현장에서 바뀐 실제 구성을 수정할 수도 없다.
  - `merchant_equipment`는 시리얼 단위 행이라 세트 개념과 수량이 없다.
- `merchant_equipment`를 "설치 구성 항목" 테이블로 확장한다(컬럼 추가만). 별도
  `merchant_install_sets` 테이블을 신설하지 않는 이유는 장비 정보가 두 테이블로 갈라져
  어느 쪽이 진실인지 모호해지기 때문.
- 기술지원 이관 시점(`sync_merchant_on_tech_transfer`)에 `equipment_items`를 카테고리로 묶어
  `source = 'application'` 행으로 자동 시딩하고, 이후에는 담당자가 화면에서 수정한다.
  자동 시딩은 해당 가맹점에 `source = 'application'` 행이 하나도 없을 때만 수행해 재이관 시
  수기 수정본을 덮어쓰지 않는다.
- 기존 행은 `category = 'etc'`, `quantity = 1`, `source = 'manual'`로 남는다.

### 파생값 vs 저장값

목업의 상단 KPI와 `설치정보` 카드는 대부분 이미 있는 데이터에서 계산할 수 있다.
중복 저장은 동기화 실패 위험이 있으므로 계산 가능한 값은 저장하지 않는다.

- 파생: 최초 설치일, 최근 재설치일, 설치 담당자, 설치 상태, 설치 유형, 총 설치 세트,
  최근 A/S, 계약기간(개월).
- 신규 저장: 운영 상태(`operation_status`), 계약 시작일(`contract_started_at`),
  매장 담당자(`contact_name`, `contact_phone`), 설치 특이사항(`install_note`).
  전부 어디에서도 파생할 수 없는 수기 입력값이다.
- 최초 설치일/최근 재설치일은 `installations.created_at`이 아니라
  `installation_activity_logs`의 `to_status IN ('completed','delivery_sent')` 시각을 쓴다.
  접수 시각이 아니라 실제 완료 시각이어야 하고, 이 계산은 `merchants/page.tsx`의
  `firstCompletionAt` 로직이 이미 하고 있어 재사용한다.
- `사용 프로그램`(토스POS)은 `franchise_applications.program`에서 읽는다. `merchants.pos_model`은
  이관 트리거가 장비 목록 요약 문자열을 넣고 있어 프로그램명 용도로 쓸 수 없다.

### 빠른 업무

- 1단계는 기존 화면 딥링크만 제공한다. `installations` 행 생성은 승인·알림·재고 차감 로직이
  `/installs` 쪽에 붙어 있어 여기서 복제하면 규칙이 두 벌이 된다.
- 링크 대상은 지금 실제로 동작하는 경로만 건다(`/installs`, `/installs/delivery`, `/changes`,
  `/franchise?id=<application_id>`). 프리필 쿼리 파라미터는 받는 쪽이 아직 소비하지 않으므로
  이번에 붙이지 않는다.

### 범위 밖

- 목업에서 잘린 `계약조건` 카드 하단(월 이용료 등)은 필드가 확정되지 않아 넣지 않는다.
  이번에는 계약 시작일/종료일/계약기간 + 토스 가맹점번호/VAN사/인터넷만 표시한다.
- 목업에 없는 기존 섹션(메모 히스토리, 관련 업무 이력)은 삭제하지 않고 통합정보 페이지
  하단으로 그대로 옮긴다.
