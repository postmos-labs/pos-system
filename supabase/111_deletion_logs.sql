-- 삭제 감사 로그
-- 가맹접수/설치건/변경접수/가맹점을 삭제하면 관련 이력 테이블도 ON DELETE CASCADE로 함께 사라져
-- "누가 무엇을 지웠는지" 추적할 수단이 전혀 없었다. 삭제 직전 스냅샷을 별도 테이블에 남긴다.
-- entity_id는 이미 삭제된 행을 가리키므로 외래키를 걸지 않는다.

CREATE TABLE IF NOT EXISTS deletion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'franchise_application',
    'installation',
    'change_request',
    'merchant'
  )),
  entity_id UUID NOT NULL,
  subject TEXT,
  snapshot JSONB,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deletion_logs_created_at_idx ON deletion_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS deletion_logs_entity_idx ON deletion_logs (entity_type, entity_id);

-- 075에서 만든 공용 트리거 재사용: user_name이 비어 있으면 profiles에서 채운다
DROP TRIGGER IF EXISTS deletion_logs_fill_user_name ON deletion_logs;
CREATE TRIGGER deletion_logs_fill_user_name
  BEFORE INSERT ON deletion_logs
  FOR EACH ROW EXECUTE FUNCTION public.fill_audit_user_name();

ALTER TABLE deletion_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read deletion logs" ON deletion_logs;
CREATE POLICY "authenticated read deletion logs"
  ON deletion_logs FOR SELECT TO authenticated USING (TRUE);

-- 감사 로그는 위조/삭제를 막기 위해 authenticated에게 INSERT/UPDATE/DELETE 권한을 주지 않는다.
-- 기록은 서버 액션에서 service_role(admin client)로만 남긴다.
