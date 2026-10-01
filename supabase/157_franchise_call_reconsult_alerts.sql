-- 가맹접수 통화기록 '재상담' + 재상담·취소 알림 받을 사람 설정
--
-- 통화기록창에 '재상담'(reconsult) 종류를 추가하고, 재상담·취소 처리 때
-- 미리 정해 둔 사람들에게 내부 팝업 알림(notifications)을 보낸다.
-- 받을 사람은 이벤트(reconsult / cancel)당 한 행으로 franchise_call_alert_settings에 저장한다.
-- Supabase SQL Editor에서 수동 실행.
--
-- 실행 전에도 화면은 열린다. 재상담 저장만 실패하고, 취소는 알림 없이 그대로 처리된다.

-- 1) 통화기록 종류에 reconsult 추가 (기존 제약 이름이 확실치 않아 call_type CHECK를 모두 지우고 다시 만든다)
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'franchise_application_call_logs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%call_type%'
  LOOP
    EXECUTE format('ALTER TABLE franchise_application_call_logs DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE franchise_application_call_logs
  ADD CONSTRAINT franchise_application_call_logs_call_type_check
  CHECK (call_type IN ('missed', 'completed', 'reconsult'));

-- 2) 알림 받을 사람 설정 (이벤트당 한 행)
CREATE TABLE IF NOT EXISTS franchise_call_alert_settings (
  event TEXT PRIMARY KEY CHECK (event IN ('reconsult', 'cancel')),
  recipient_ids UUID[] NOT NULL DEFAULT '{}',
  notify_sales BOOLEAN NOT NULL DEFAULT FALSE,
  notify_cs BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE franchise_call_alert_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read call alert settings" ON franchise_call_alert_settings;
CREATE POLICY "authenticated read call alert settings"
  ON franchise_call_alert_settings FOR SELECT TO authenticated USING (TRUE);
-- 쓰기 정책은 두지 않는다. 저장은 서버 액션(service_role)만 하고 권한 검사는 코드(canEditFranchiseCallAlerts)에서 한다.

INSERT INTO franchise_call_alert_settings (event) VALUES ('reconsult'), ('cancel')
ON CONFLICT (event) DO NOTHING;

-- 확인
SELECT event, recipient_ids, notify_sales, notify_cs FROM franchise_call_alert_settings;
