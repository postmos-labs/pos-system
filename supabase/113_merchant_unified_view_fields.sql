-- 가맹점 통합정보 화면(posmos-new 스타일 목업)에 필요한 수기 입력 필드 추가.
-- 나머지 목업 항목(최초 설치일/계약기간/최근 A/S 등)은 기존 테이블에서 파생 계산하므로
-- 컬럼을 추가하지 않는다. docs/feature/merchant-unified-view/decisions.md 참고.

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS operation_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS contract_started_at DATE,
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS install_note TEXT;

ALTER TABLE merchants DROP CONSTRAINT IF EXISTS merchants_operation_status_check;
ALTER TABLE merchants ADD CONSTRAINT merchants_operation_status_check CHECK (operation_status IN (
  'active',      -- 정상운영
  'paused',      -- 일시중지
  'terminated'   -- 해지
));
