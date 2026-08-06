-- 설치/배송 이후 자유 메모 이력
-- 주의: 이 파일은 검토용으로만 생성합니다. Supabase에 자동/수동 실행하지 않습니다.

CREATE TABLE IF NOT EXISTS installation_post_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id UUID NOT NULL REFERENCES installations(id),
  merchant_id UUID REFERENCES merchants(id),
  content TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS installation_post_history_installation_idx
  ON installation_post_history (installation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS installation_post_history_merchant_idx
  ON installation_post_history (merchant_id, created_at DESC);

ALTER TABLE installation_post_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read installation post history"
  ON installation_post_history;
CREATE POLICY "authenticated read installation post history"
  ON installation_post_history
  FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "authenticated insert own installation post history"
  ON installation_post_history;
CREATE POLICY "authenticated insert own installation post history"
  ON installation_post_history
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());
