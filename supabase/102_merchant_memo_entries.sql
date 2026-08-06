-- 가맹점 누적 메모 이력
-- 주의: 이 파일은 검토용으로만 생성합니다. Supabase에 실행하지 않습니다.

CREATE TABLE IF NOT EXISTS merchant_memo_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS merchant_memo_entries_merchant_idx
  ON merchant_memo_entries (merchant_id, created_at DESC);

ALTER TABLE merchant_memo_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read merchant memo entries"
  ON merchant_memo_entries;
CREATE POLICY "authenticated read merchant memo entries"
  ON merchant_memo_entries
  FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "authenticated insert own merchant memo entries"
  ON merchant_memo_entries;
CREATE POLICY "authenticated insert own merchant memo entries"
  ON merchant_memo_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());
