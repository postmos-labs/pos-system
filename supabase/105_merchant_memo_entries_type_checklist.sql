-- 가맹점 메모 히스토리 테이블 신규 생성 + 유형/체크리스트 컬럼
-- 참고: 102_merchant_memo_entries.sql은 검토용 초안으로 실제 적용되지 않았다.
-- 이 마이그레이션이 merchant_memo_entries를 처음으로 실제 생성한다.

CREATE TABLE IF NOT EXISTS merchant_memo_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  entry_type TEXT NOT NULL DEFAULT 'general'
    CHECK (entry_type IN ('as', 'claim', 'general', 'etc')),
  checklist JSONB,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 102 초안이 먼저 실행된 환경(다른 세션 등)을 대비해 컬럼이 없으면 추가한다.
ALTER TABLE merchant_memo_entries
  ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'general';
ALTER TABLE merchant_memo_entries
  DROP CONSTRAINT IF EXISTS merchant_memo_entries_entry_type_check;
ALTER TABLE merchant_memo_entries
  ADD CONSTRAINT merchant_memo_entries_entry_type_check
  CHECK (entry_type IN ('as', 'claim', 'general', 'etc'));
ALTER TABLE merchant_memo_entries
  ADD COLUMN IF NOT EXISTS checklist JSONB;

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
