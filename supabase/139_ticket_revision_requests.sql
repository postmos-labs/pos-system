-- 인입내역 수정 요청 기록
--
-- 지금은 마스터가 수정 요청을 보내면 알림으로만 나가고 어디에도 남지 않아,
-- 보낸 뒤 실제로 고쳐졌는지 확인할 방법이 없다. 요청을 표로 남겨 처리 여부를 관리한다.
--
-- 완료 판정은 마스터가 한다. 담당자가 고친 내용을 마스터가 보고 직접 닫는다.

CREATE TABLE IF NOT EXISTS ticket_revision_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  -- open: 수정 대기 / resolved: 마스터가 확인해 닫음
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  requested_by_name TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_by_name TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_note TEXT
);

-- 대기 중인 요청을 최신순으로 훑는 화면이 기본이다.
CREATE INDEX IF NOT EXISTS ticket_revision_requests_status_idx
  ON ticket_revision_requests (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS ticket_revision_requests_ticket_idx
  ON ticket_revision_requests (ticket_id, requested_at DESC);

ALTER TABLE ticket_revision_requests ENABLE ROW LEVEL SECURITY;

-- 조회는 전 직원 공개 — 담당자가 자기 건에 어떤 요청이 왔는지 봐야 한다.
DROP POLICY IF EXISTS "ticket_revision_requests_select" ON ticket_revision_requests;
CREATE POLICY "ticket_revision_requests_select" ON ticket_revision_requests
  FOR SELECT TO authenticated USING (TRUE);

-- 생성·수정은 마스터만. 서버 액션에서도 같은 조건으로 막는다.
DROP POLICY IF EXISTS "ticket_revision_requests_write" ON ticket_revision_requests;
CREATE POLICY "ticket_revision_requests_write" ON ticket_revision_requests
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'master'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'master'));

-- 확인용: 표가 보이면 성공
SELECT count(*) AS ticket_revision_requests_rows FROM ticket_revision_requests;
