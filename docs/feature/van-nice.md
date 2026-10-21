# VAN사 NICE 추가 및 VAN 계열 포함 방식 집계

## 배경

- 가맹점(디얼스헤어)이 프로그램 연동 때문에 VAN사 NICE를 함께 사용
- VAN 구분 카드·탭·필터가 있는 모든 화면에 NICE 추가 요청

## 결정

- VAN사 선택지에 `NICE` 추가 (`VAN_COMPANIES`), 배지·카드 색은 주황 계열
- 여러 VAN을 함께 쓰는 가맹점은 해당하는 모든 계열에 집계 (포함 방식)
- 계열 정의 (쉼표로 나눠 trim, 빈 값 제외, 대소문자 무시)
  - kicc: 항목 중 KICC가 있음
  - nice: 항목 중 NICE가 있음
  - toss: KICC·NICE가 아닌 값이 하나라도 있음 (목록에 없는 값도 토스계열, 예: 티켓 등록의 자리표시 "토스")
  - 값이 비면 어느 계열도 아님 (전체에만 집계)
- 서버 필터: kicc `ilike %KICC%`, nice `ilike %NICE%`, toss는 값이 있고 `imatch`로 KICC/NICE만으로 이뤄진 값이 아닐 때 (정규식은 `TOSS_ONLY_OTHER_PATTERN`)
- 계열 카드 숫자의 합이 전체와 다를 수 있음 (중복 집계, 값 없는 건은 전체에만 존재)
- KICC도 포함 방식으로 변경: 이전에는 KICC와 토스계열을 함께 쓰는 가맹점이 KICC에만 집계, 이제 양쪽에 집계
- CS 리포트: VAN 미상 인입 건은 기존대로 토스계열 리포트에만 합산

## 영향 파일

- `src/types/index.ts`, `src/lib/vanGroup.ts` (`vanGroupsOf`, `inVanGroup`, `TOSS_ONLY_OTHER_PATTERN`), `src/components/ui/VanBadge.tsx`
- 가맹접수: `FranchiseClient.tsx`, `FranchiseReceiptSurface.tsx`
- 대시보드: `dashboard/page.tsx`, `VanGroupTabs.tsx`
- 설치관리: `installs/page.tsx`, `InstallsClient.tsx`
- 가맹점: `merchants/page.tsx`, `MerchantsClient.tsx`
- CS 리포트: `cs-report/page.tsx`, `CsReportClient.tsx`
- 승인함: `approvals/TransferApprovalList.tsx`
- 티켓 등록: `tickets/new/NewTicketForm.tsx` (NICE 계열 선택 시 "NICE" 저장)

## DB

- 변경 없음 (`van_company`는 TEXT)
