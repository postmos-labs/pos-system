-- ============================================
-- 인입내역 기술지원 AS 구분 컬럼 추가
-- 가맹점 메모 히스토리(117번)와 같은 값 체계를 tickets에도 둔다.
-- 담당팀이 기술지원팀인 인입 등록 시 문제 유형/해결 방식/반복 여부를 기록.
-- src/app/(app)/merchants/merchant360.ts의 라벨 상수와 값이 일치해야 한다.
-- ============================================

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS issue_category TEXT
    CHECK (issue_category IN ('payment', 'pos', 'device', 'install', 'usage', 'etc')),
  ADD COLUMN IF NOT EXISTS resolution TEXT
    CHECK (resolution IN ('phone', 'guide', 'remote', 'onsite', 'unresolved')),
  ADD COLUMN IF NOT EXISTS is_repeat BOOLEAN;
