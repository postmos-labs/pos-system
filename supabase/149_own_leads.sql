-- 자체리드 관리
--
-- 대표님·자체영업으로 들어온 매장 건을 가맹접수 전에 담아 두는 "접수 전 대기실".
-- CS가 담당자를 정하고 고객에게 연락해 접수 여부를 판단한 뒤, 접수대상만 가맹접수로 전환한다.
-- 상태값은 src/app/(app)/leads/lead.ts의 CONTACT_STATUSES · DOC_STATUSES · DECISIONS와 같이 간다.
-- 쓰기는 전부 서버 액션(service_role)이 권한을 검사한 뒤 하므로 쓰기 정책을 두지 않는다.

CREATE TABLE IF NOT EXISTS own_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  owner_name TEXT,
  phone TEXT,
  region TEXT,
  -- 유입경로: 대표님 / 자체영업 / 지인소개 / 기타 (자유 입력 허용)
  source TEXT NOT NULL DEFAULT '대표님',
  assignee_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assignee_name TEXT,
  contact_status TEXT NOT NULL DEFAULT '미연락' CHECK (contact_status IN ('미연락', '연락완료', '부재')),
  doc_status TEXT NOT NULL DEFAULT '미확인' CHECK (doc_status IN ('미확인', '요청', '완료')),
  decision TEXT NOT NULL DEFAULT '미정' CHECK (decision IN ('미정', '접수대상', '상담', '보류', '접수아님')),
  -- 보류면 재연락 예정일, 그 외에는 다음 조치일
  next_action_date DATE,
  note TEXT,
  -- 접수대상으로 판단해 가맹접수로 넘긴 건. 채워지면 종결로 본다
  converted_franchise_id UUID REFERENCES franchise_applications(id) ON DELETE SET NULL,
  -- 상담 종료·접수아님 등으로 닫은 시각. NULL이면 진행 중
  closed_at TIMESTAMPTZ,
  close_reason TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS own_leads_open_idx ON own_leads (closed_at, decision, created_at DESC);
CREATE INDEX IF NOT EXISTS own_leads_assignee_idx ON own_leads (assignee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS own_leads_converted_idx ON own_leads (converted_franchise_id);

CREATE OR REPLACE FUNCTION own_leads_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS own_leads_set_updated_at ON own_leads;
CREATE TRIGGER own_leads_set_updated_at
  BEFORE UPDATE ON own_leads FOR EACH ROW EXECUTE FUNCTION own_leads_set_updated_at();

ALTER TABLE own_leads ENABLE ROW LEVEL SECURITY;

-- 조회는 로그인한 직원 전체. 누가 어떤 건을 확인 중인지 팀이 같이 봐야 한다.
DROP POLICY IF EXISTS "own_leads_select" ON own_leads;
CREATE POLICY "own_leads_select" ON own_leads
  FOR SELECT TO authenticated USING (TRUE);

-- 확인용: 표가 보이면 성공
SELECT count(*) AS own_leads_rows FROM own_leads;
