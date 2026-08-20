-- 가맹점 통합정보 화면의 "설치 구성 요약/상세" 표를 위해 merchant_equipment를
-- 세트 단위 구성 항목 테이블로 확장한다. 기존 시리얼 단위 필드(name/serial_number/
-- status/installed_date/notes)는 그대로 두고 세트 정보 컬럼만 추가.
-- docs/feature/merchant-unified-view/decisions.md 참고.

ALTER TABLE merchant_equipment
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'etc',
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS components TEXT,
  ADD COLUMN IF NOT EXISTS manufacturer TEXT,
  ADD COLUMN IF NOT EXISTS supplier TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE merchant_equipment DROP CONSTRAINT IF EXISTS merchant_equipment_category_check;
ALTER TABLE merchant_equipment ADD CONSTRAINT merchant_equipment_category_check CHECK (category IN (
  'main_pos',     -- 메인포스
  'kiosk',        -- 키오스크
  'table_order',  -- 테이블오더
  'etc'           -- 기타
));

ALTER TABLE merchant_equipment DROP CONSTRAINT IF EXISTS merchant_equipment_quantity_check;
ALTER TABLE merchant_equipment ADD CONSTRAINT merchant_equipment_quantity_check CHECK (quantity > 0);

ALTER TABLE merchant_equipment DROP CONSTRAINT IF EXISTS merchant_equipment_source_check;
ALTER TABLE merchant_equipment ADD CONSTRAINT merchant_equipment_source_check CHECK (source IN (
  'manual',      -- 담당자가 화면에서 직접 등록
  'application'  -- 기술지원 이관 시점 equipment_items에서 자동 시딩 (115번 마이그레이션에서 사용 예정)
));

CREATE INDEX IF NOT EXISTS merchant_equipment_category_idx
  ON merchant_equipment (merchant_id, category);

-- 상세 표에서 행 삭제를 지원하려면 필요한데 106번 스키마에는 DELETE 정책이 없었다.
DROP POLICY IF EXISTS "authenticated delete merchant equipment" ON merchant_equipment;
CREATE POLICY "authenticated delete merchant equipment"
  ON merchant_equipment
  FOR DELETE
  TO authenticated
  USING (TRUE);

-- 설치 구성 행 삭제도 111번 삭제 감사 로그에 스냅샷을 남기기 위해 entity_type을 확장한다.
ALTER TABLE deletion_logs DROP CONSTRAINT IF EXISTS deletion_logs_entity_type_check;
ALTER TABLE deletion_logs ADD CONSTRAINT deletion_logs_entity_type_check CHECK (entity_type IN (
  'franchise_application',
  'installation',
  'change_request',
  'merchant',
  'merchant_equipment'
));
