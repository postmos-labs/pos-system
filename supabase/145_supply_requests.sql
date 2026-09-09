-- 물품요청 게시판
--
-- 직원이 필요한 소모품·비품을 올리고 실장급 이상(실장·상무·대표)이 승인한다.
-- 상태값은 src/app/(app)/supply-requests/supplyRequest.ts의 SUPPLY_REQUEST_STATUSES와 같이 간다.
-- 쓰기는 전부 서버 액션(service_role)이 권한을 검사한 뒤 하므로 쓰기 정책을 두지 않는다.

CREATE TABLE IF NOT EXISTS supply_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit TEXT,
  description TEXT,
  needed_by DATE,
  is_urgent BOOLEAN NOT NULL DEFAULT FALSE,
  requester_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  requester_name TEXT,
  requester_team TEXT,
  -- 요청 → 승인 → 구매중 → 수령완료, 또는 반려
  status TEXT NOT NULL DEFAULT '요청' CHECK (status IN ('요청', '승인', '반려', '구매중', '수령완료')),
  approver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approver_name TEXT,
  approved_at TIMESTAMPTZ,
  approver_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supply_requests_status_idx ON supply_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS supply_requests_requester_idx ON supply_requests (requester_id, created_at DESC);

CREATE OR REPLACE FUNCTION supply_requests_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS supply_requests_set_updated_at ON supply_requests;
CREATE TRIGGER supply_requests_set_updated_at
  BEFORE UPDATE ON supply_requests FOR EACH ROW EXECUTE FUNCTION supply_requests_set_updated_at();

ALTER TABLE supply_requests ENABLE ROW LEVEL SECURITY;

-- 조회는 전 직원 공개. 누가 무엇을 요청했는지 팀이 같이 봐야 중복 요청이 준다.
DROP POLICY IF EXISTS "supply_requests_select" ON supply_requests;
CREATE POLICY "supply_requests_select" ON supply_requests
  FOR SELECT TO authenticated USING (TRUE);

-- 확인용: 표가 보이면 성공
SELECT count(*) AS supply_requests_rows FROM supply_requests;
