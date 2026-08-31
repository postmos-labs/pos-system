-- 사내 공지 발송 기록
--
-- 공지는 받는 사람 수만큼 notifications 행이 생긴다. 그걸 그대로 활동 로그에 쓰면
-- 한 번 보낸 공지가 인원수만큼 줄줄이 뜨고, 누가 보냈는지도 알 수 없다
-- (notifications에는 보낸 사람 컬럼이 없다).
-- 그래서 "발송"이라는 사건 자체를 한 줄로 남기는 표를 따로 둔다.
--
-- deletion_logs(111번)와 같은 모양이다. sender_name을 텍스트로 함께 저장해
-- 보낸 사람 계정이 지워져도 누가 보냈는지가 남는다(129번과 같은 원칙).

CREATE TABLE IF NOT EXISTS notice_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  -- 발송 시점의 수신 인원. 이후 계정이 지워져도 그때 몇 명에게 갔는지가 남는다.
  recipient_count INTEGER NOT NULL,
  sent_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notice_logs_created_idx ON notice_logs (created_at DESC);

ALTER TABLE notice_logs ENABLE ROW LEVEL SECURITY;

-- 활동 로그 화면이 마스터 전용이라 읽기는 로그인한 직원 기준으로 열어둔다
-- (다른 로그 테이블과 같은 수준). 쓰기는 서버 액션의 service_role로만 한다.
DROP POLICY IF EXISTS "authenticated read notice logs" ON notice_logs;
CREATE POLICY "authenticated read notice logs"
  ON notice_logs
  FOR SELECT
  TO authenticated
  USING (TRUE);

-- 확인용: 표가 보이면 성공
SELECT count(*) AS notice_logs_rows FROM notice_logs;
