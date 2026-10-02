# 승인함 이관 승인 목록 — VAN 구분 탭

## 배경

- 팀장이 이관 승인을 할 때 KICC 건과 토스 건을 나눠 보고 싶다는 요청
- 같은 구분이 가맹접수 목록·설치관리·대시보드에는 이미 있었으나 승인함에는 없었음

## 결정

- 승인함 "기술지원 이관 승인" 목록에 VAN 구분 탭(전체 / 토스계열 / KICC) 추가. 설치완료 승인 목록은 이번 범위 아님
- 기준은 `franchise_applications.van_company`에 KICC 포함 여부 (`src/types/index.ts`의 VAN 계열 정의). 값이 없으면 어느 쪽도 아니며 "전체"에서만 보임
- 라벨은 대시보드와 같은 "토스계열"·"KICC", 색도 같은 규칙(토스 파랑·KICC 초록)
- 인입경로 칩과 AND로 동작하고, 건수는 서로 교차 집계 (인입경로 건수는 VAN 필터 기준, VAN 건수는 인입경로 필터 기준)
- 목록 행의 상호명 옆에 VAN 배지 표시

## 공용화

- `parseVanList`·`vanGroupOf`를 `FranchiseClient.tsx`에서 `src/lib/vanGroup.ts`로 옮김 (동작 동일)
- `cs-report/page.tsx`의 로컬 `parseVanList`는 이번에 그대로 둠

## 영향 파일

- `src/lib/vanGroup.ts` (신규)
- `src/app/(app)/franchise/FranchiseClient.tsx` — 로컬 함수 제거, import 교체
- `src/app/(app)/approvals/page.tsx` — 이관 승인 조회에 `van_company` 추가
- `src/app/(app)/approvals/TransferApprovalList.tsx` — VAN 탭, 교차 집계
- `src/app/(app)/approvals/TransferApprovalItem.tsx` — VAN 배지

## DB

- 변경 없음 (`van_company` 컬럼은 기존 것 사용, 마이그레이션 없음)
