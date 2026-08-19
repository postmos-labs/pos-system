-- 가맹접수 통화기록(부재/완료) 추적 — posmos-new의 applications 통화기록 기능을 이식
-- 부재중 통화 3회 누적 시 접수를 자동으로 canceled 상태로 전환한다.

ALTER TABLE franchise_applications
  ADD COLUMN IF NOT EXISTS missed_call_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_call_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

CREATE TABLE IF NOT EXISTS franchise_application_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  franchise_application_id UUID NOT NULL REFERENCES franchise_applications(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  call_type TEXT NOT NULL CHECK (call_type IN ('missed', 'completed')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS franchise_application_call_logs_app_idx
  ON franchise_application_call_logs (franchise_application_id, created_at DESC);

ALTER TABLE franchise_application_call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read call logs" ON franchise_application_call_logs;
CREATE POLICY "authenticated read call logs"
  ON franchise_application_call_logs
  FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "authenticated insert call logs" ON franchise_application_call_logs;
CREATE POLICY "authenticated insert call logs"
  ON franchise_application_call_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (TRUE);

-- 부재중 통화 기록: 카운트 +1, 로그 적재, 3회 도달 시 자동 취소
CREATE OR REPLACE FUNCTION record_franchise_missed_call(
  p_application_id UUID,
  p_user_id UUID,
  p_cancel_reason TEXT DEFAULT NULL
)
RETURNS franchise_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row franchise_applications;
BEGIN
  INSERT INTO franchise_application_call_logs (franchise_application_id, user_id, call_type)
  VALUES (p_application_id, p_user_id, 'missed');

  UPDATE franchise_applications
  SET
    missed_call_count = missed_call_count + 1,
    status = CASE WHEN missed_call_count + 1 >= 3 THEN 'canceled' ELSE status END,
    cancel_reason = CASE WHEN missed_call_count + 1 >= 3 THEN COALESCE(p_cancel_reason, cancel_reason) ELSE cancel_reason END
  WHERE id = p_application_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- 완료 통화 기록: 카운트 +1, 로그 적재
CREATE OR REPLACE FUNCTION record_franchise_completed_call(
  p_application_id UUID,
  p_user_id UUID
)
RETURNS franchise_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row franchise_applications;
BEGIN
  INSERT INTO franchise_application_call_logs (franchise_application_id, user_id, call_type)
  VALUES (p_application_id, p_user_id, 'completed');

  UPDATE franchise_applications
  SET completed_call_count = completed_call_count + 1
  WHERE id = p_application_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION record_franchise_missed_call(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION record_franchise_completed_call(UUID, UUID) TO authenticated;
