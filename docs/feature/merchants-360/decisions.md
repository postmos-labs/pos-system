# 가맹점 360도 뷰 결정사항

## 2026-08-06

### 범위와 상태

- bkit 저장소 상태는 `.bkit/state/pdca-status.json` 기준 Dynamic 레벨, 현재 Phase 1이다.
- 저장소에 `docs/.pdca-status.json`는 없으므로 이번 작업의 결정·흐름은 이 문서와 `flow.md`에 기록한다.
- `supabase/100_installation_post_history.sql`은 검토용 파일만 생성하며 어떤 Supabase 프로젝트에도 실행하지 않는다.

### 설치 후 히스토리의 가맹점 연결

- 현재 설치건은 `installations.franchise_application_id`로 `franchise_applications`에 연결된다.
- 기본 연결은 `merchants.franchise_application_id = installations.franchise_application_id` 역조회로 한다. 사용자 제공 기존 스키마에서 `franchise_applications.merchant_id` 직접 연결은 보장하지 않으므로 해당 컬럼은 코드에서 전제하지 않는다.
- 설치건에 접수 연결이 없거나 해당 가맹점을 찾지 못하면 `installation_post_history.merchant_id`는 NULL로 저장한다. 설치건 자체의 히스토리 추가는 허용하되, 가맹점 360도 뷰에는 merchant_id가 있는 행만 표시한다.

### 360도 뷰와 기존 상세 라우트

- `/merchants?id=...` 쿼리 파라미터를 선택 상태로 사용한다. 리스트 클릭은 `/merchants/[id]`로 이동하지 않고 같은 페이지의 우측 패널을 갱신한다.
- `/merchants/[id]` 라우트는 직접 북마크와 기존 외부 링크 호환을 위해 유지한다. 새 메인 진입점은 `/merchants` 2패널 화면이다.
- 우측 상세에는 기존 `merchants` 컬럼인 상호명, 대표자, 연락처, 주소, 상세주소, 메모만 표시하며 merchant_no/status/cs_id/tech_id/open_date 필드나 뱃지는 추가하지 않는다.

### 통합 업무 이력

- 접수: `merchants.franchise_application_id`로 연결된 `franchise_applications` 1건.
- 설치: 같은 접수에 연결되고 `delivery_type IN ('install', 'transfer')`인 `installations`.
- AS: 같은 접수에 연결된 `installations`의 `delivery_type = 'as'`와 `tickets.type = 'as'`.
- 변경: `change_requests.merchant_id` 직접 연결.
- 설치·배송 이후 히스토리: `installation_post_history.merchant_id` 직접 연결.
- 모든 원본 행은 `created_at` 기준 내림차순으로 하나의 배열에 합치고, 원본 상세 화면으로 이동하는 링크를 제공한다. 설치·배송 이후 히스토리 테이블이 아직 없으면 조회는 빈 배열로 처리한다.
