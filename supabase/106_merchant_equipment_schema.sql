-- 가맹점별 설치 장비 목록 (posmos-new의 equipment 테이블을 참고해 이식)

CREATE TABLE IF NOT EXISTS merchant_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  installation_id UUID REFERENCES installations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  serial_number TEXT,
  status TEXT NOT NULL DEFAULT 'installed'
    CHECK (status IN ('installed', 'as', 'removed')),
  installed_date DATE,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS merchant_equipment_merchant_idx
  ON merchant_equipment (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS merchant_equipment_installation_idx
  ON merchant_equipment (installation_id);

ALTER TABLE merchant_equipment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read merchant equipment" ON merchant_equipment;
CREATE POLICY "authenticated read merchant equipment"
  ON merchant_equipment
  FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "authenticated insert merchant equipment" ON merchant_equipment;
CREATE POLICY "authenticated insert merchant equipment"
  ON merchant_equipment
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "authenticated update merchant equipment" ON merchant_equipment;
CREATE POLICY "authenticated update merchant equipment"
  ON merchant_equipment
  FOR UPDATE
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);
