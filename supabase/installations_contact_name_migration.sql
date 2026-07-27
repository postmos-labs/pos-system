-- ============================================
-- 설치건에 고객명(contact_name) 컬럼 추가
-- 기존 customer_name은 상호명 용도로 유지, contact_name은 실제 고객(개인) 성함
-- ============================================

ALTER TABLE installations
  ADD COLUMN IF NOT EXISTS contact_name TEXT;
