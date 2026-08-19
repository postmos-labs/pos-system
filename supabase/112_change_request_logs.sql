-- 변경접수(통장/상호/대표자/주소/업종 변경) 처리 이력
-- 지금까지는 created_by(접수자)만 남아 "누가 처리/완료했는지"를 알 수 없었다.
-- 가맹접수(franchise_application_logs)와 동일한 구조로 상태 변경 이력을 남긴다.

CREATE TABLE IF NOT EXISTS change_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_request_id UUID NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS change_request_logs_request_idx
  ON change_request_logs (change_request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS change_request_logs_created_at_idx
  ON change_request_logs (created_at DESC);

DROP TRIGGER IF EXISTS change_request_logs_fill_user_name ON change_request_logs;
CREATE TRIGGER change_request_logs_fill_user_name
  BEFORE INSERT ON change_request_logs
  FOR EACH ROW EXECUTE FUNCTION public.fill_audit_user_name();

ALTER TABLE change_request_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read change request logs" ON change_request_logs;
CREATE POLICY "authenticated read change request logs"
  ON change_request_logs FOR SELECT TO authenticated USING (TRUE);

-- 다른 사용자를 행위자로 위조하지 못하도록 본인 명의 기록만 허용 (075의 감사 로그 정책과 동일)
DROP POLICY IF EXISTS "authenticated insert own change request logs" ON change_request_logs;
CREATE POLICY "authenticated insert own change request logs"
  ON change_request_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
