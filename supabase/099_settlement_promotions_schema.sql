-- 공통 대시보드 정산 프로모션 수동 등록
-- 프로모션별 조건과 달성 건수를 담당자가 직접 관리한다.

CREATE TABLE IF NOT EXISTS settlement_promotions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  unit_rate INTEGER NOT NULL CHECK (unit_rate >= 0),
  achieved_count INTEGER NOT NULL DEFAULT 0 CHECK (achieved_count >= 0),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  memo TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

DROP TRIGGER IF EXISTS settlement_promotions_updated_at ON settlement_promotions;
CREATE TRIGGER settlement_promotions_updated_at BEFORE UPDATE ON settlement_promotions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE settlement_promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read" ON settlement_promotions;
CREATE POLICY "authenticated read" ON settlement_promotions FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "authenticated insert" ON settlement_promotions;
CREATE POLICY "authenticated insert" ON settlement_promotions FOR INSERT TO authenticated WITH CHECK (TRUE);
DROP POLICY IF EXISTS "authenticated update" ON settlement_promotions;
CREATE POLICY "authenticated update" ON settlement_promotions FOR UPDATE TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "authenticated delete" ON settlement_promotions;
CREATE POLICY "authenticated delete" ON settlement_promotions FOR DELETE TO authenticated USING (TRUE);

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE settlement_promotions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
