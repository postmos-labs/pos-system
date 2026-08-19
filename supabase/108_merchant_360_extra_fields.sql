-- 가맹점 360도 뷰에 posmos-new 수준의 필드 노출을 위한 컬럼 추가
-- (인입경로/사업자번호/개업예정일/CS·기술담당은 기존 franchise_applications 링크에서 가져오므로 스키마 변경 불필요)

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS toss_merchant_no TEXT,
  ADD COLUMN IF NOT EXISTS contract_expires_at DATE,
  ADD COLUMN IF NOT EXISTS brand TEXT;
