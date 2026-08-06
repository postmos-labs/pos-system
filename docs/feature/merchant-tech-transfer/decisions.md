# 기술지원 이관 시점 merchant 동기화 결정사항

## 2026-08-06

- 기존 `091_franchise_receipts_merchant_link.sql`은 `franchise_applications.status`가 `card_done` 또는 `toss_review_done`이 되는 순간 `merchants`를 생성했다.
- 이 시점은 실제 기술지원 이관보다 빠르거나 상태 일괄 변경으로 우회될 수 있으므로, 기존 트리거와 함수를 완전히 제거하고 `installations`의 기술지원 이관을 단일 기준으로 삼는다.
- `approveFranchiseTransfer()`의 신규 이관은 `installations` INSERT, rejected 건 재이관은 기존 행의 `status`를 `received`로 UPDATE한다. 두 경로 모두 `franchise_application_id`를 보존하므로 새 트리거가 동일하게 처리한다.
- `installValues`에는 설치 화면에 필요한 고객명·연락처·장비·메모·주소·설치일만 복사된다. 사업자번호·상세주소·영업담당자·오픈예정일은 원본 `franchise_applications`를 트리거에서 재조회한다. 원본이 비어 있는 nullable 값은 merchant에도 NULL로 남긴다.
- `merchants`의 기존 NOT NULL 컬럼(`business_name`, `owner_name`, `phone`, `address`)은 원본이 비어 있을 때 `미입력`으로 저장해 이관 자체가 실패하지 않도록 했다.
- `franchise_applications.merchant_id`는 091번에서 이미 추가된 역참조 컬럼이다. 기존 `merchants.franchise_application_id` 연결을 우선 조회하고, 역참조만 남은 기존 데이터는 `franchise_applications.merchant_id`를 보조로 사용한 뒤 양쪽 연결을 다시 맞춘다.
- `src/lib/franchiseStatusEffects.ts`의 `autoTransferToTech()`는 저장소 전체 검색에서 호출부가 선언부 외에는 없어 제거했다. 실제 이관은 `approveFranchiseTransfer()`가 담당한다.
- `FranchiseCreateDialog.tsx`의 `merchant_id` 검색은 기존 가맹점에 접수 건을 연결하는 기능이며 `card_done`/`toss_review_done` 상태를 전제로 하지 않는다. 새 merchants 생성 시점 변경으로 수정하지 않는다.
- merchants 360도 뷰와 기존 상세 페이지에도 카드/토스 완료 상태만 merchant로 노출한다는 필터는 없다.

## 적용 경계

- `101_merchant_sync_on_tech_transfer.sql`은 생성만 했다. dev/운영 Supabase에 실행하지 않는다.
- 실제 적용 전에는 기존 091번이 이미 적용된 환경에서 DROP 대상 트리거/함수 이름과 `franchise_applications.merchant_id` 컬럼 존재 여부를 사람이 확인한다.
