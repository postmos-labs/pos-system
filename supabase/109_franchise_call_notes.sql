-- 통화기록(부재/완료)에 메모를 남길 수 있도록 RPC에 note 파라미터 추가
-- franchise_application_call_logs.note 컬럼은 107에서 이미 추가됨

DROP FUNCTION IF EXISTS record_franchise_missed_call(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION record_franchise_missed_call(
  p_application_id UUID,
  p_user_id UUID,
  p_note TEXT DEFAULT NULL,
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
  INSERT INTO franchise_application_call_logs (franchise_application_id, user_id, call_type, note)
  VALUES (p_application_id, p_user_id, 'missed', p_note);

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

DROP FUNCTION IF EXISTS record_franchise_completed_call(UUID, UUID);

CREATE OR REPLACE FUNCTION record_franchise_completed_call(
  p_application_id UUID,
  p_user_id UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS franchise_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row franchise_applications;
BEGIN
  INSERT INTO franchise_application_call_logs (franchise_application_id, user_id, call_type, note)
  VALUES (p_application_id, p_user_id, 'completed', p_note);

  UPDATE franchise_applications
  SET completed_call_count = completed_call_count + 1
  WHERE id = p_application_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION record_franchise_missed_call(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION record_franchise_completed_call(UUID, UUID, TEXT) TO authenticated;
