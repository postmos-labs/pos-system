-- 자체리드 v2 — 가맹접수와 같은 구조로 관리, 이관·완료 후에도 원본 보존
--
-- 배경: 149에서 자체리드를 "접수 전 대기실"로 만들었더니, 가맹접수로 전환된 건이 곧바로 종결되어
-- 아무 칸도 고칠 수 없었다. 기획안(POSMOS_자체리드건_이관_완료이력보존_기획안.pptx)대로
-- 리드는 원본 대장으로 남기고, 이관(가맹접수 전환)과 완료를 별개 사건으로 기록한다.
--
--   진행중(open)      closed_at IS NULL AND converted_franchise_id IS NULL
--   이관됨(converted) closed_at IS NULL AND converted_franchise_id IS NOT NULL
--   완료(closed)      closed_at IS NOT NULL   ← 완료 처리·상담 종료·접수아님
--
-- 상태값은 src/app/(app)/leads/lead.ts의 LEAD_TYPES · VAN_STATUSES · INTERNET_STATUSES와 같이 간다.

-- ── 1. 원본번호 ──────────────────────────────────────────────
-- 기존 건은 등록순으로 번호를 매기고, 새 건은 시퀀스로 이어 붙인다. 화면에는 L-0001처럼 보인다.
CREATE SEQUENCE IF NOT EXISTS own_leads_lead_no_seq;
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS lead_no INTEGER;
UPDATE own_leads AS l
SET lead_no = sub.rn
FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM own_leads) AS sub
WHERE l.id = sub.id AND l.lead_no IS NULL;
SELECT setval('own_leads_lead_no_seq', COALESCE((SELECT max(lead_no) FROM own_leads), 0) + 1, false);
ALTER TABLE own_leads ALTER COLUMN lead_no SET DEFAULT nextval('own_leads_lead_no_seq');
ALTER TABLE own_leads ALTER COLUMN lead_no SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS own_leads_lead_no_idx ON own_leads (lead_no);

-- ── 2. 기획안 항목 추가 ──────────────────────────────────────
-- 리드 구분: 무슨 건인지 (유입경로는 "누가 줬나"라 별도 유지)
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS lead_type TEXT NOT NULL DEFAULT '기타';
ALTER TABLE own_leads DROP CONSTRAINT IF EXISTS own_leads_lead_type_check;
ALTER TABLE own_leads ADD CONSTRAINT own_leads_lead_type_check
  CHECK (lead_type IN ('인터넷', '지시건', '패키지', '기타'));

-- VAN 접수 여부
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS van_status TEXT NOT NULL DEFAULT '미접수';
ALTER TABLE own_leads DROP CONSTRAINT IF EXISTS own_leads_van_status_check;
ALTER TABLE own_leads ADD CONSTRAINT own_leads_van_status_check
  CHECK (van_status IN ('미접수', '접수', '완료'));

-- 인터넷 진행 여부
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS internet_status TEXT NOT NULL DEFAULT '해당없음';
ALTER TABLE own_leads DROP CONSTRAINT IF EXISTS own_leads_internet_status_check;
ALTER TABLE own_leads ADD CONSTRAINT own_leads_internet_status_check
  CHECK (internet_status IN ('해당없음', '미진행', '진행중', '완료'));

-- 오픈 예정일
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS open_date DATE;

-- 이관일 (가맹접수 전환 시각). 완료(closed_at)와 분리한다
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

-- 완료 처리자
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS completed_by_name TEXT;

-- ── 3. 기존 데이터 보정 ──────────────────────────────────────
-- 149에서는 가맹접수 전환 = 종결이었다. 전환된 건은 "이관됨"으로 되돌려 다시 열고, 전환 시각을 이관일로 옮긴다.
-- (150·151 사후 연결 건의 close_reason은 '가맹접수 전환 (사후 연결)' 이라 LIKE로 잡는다)
UPDATE own_leads
SET converted_at = COALESCE(converted_at, closed_at),
    closed_at = NULL,
    close_reason = NULL
WHERE converted_franchise_id IS NOT NULL
  AND closed_at IS NOT NULL
  AND (close_reason IS NULL OR close_reason LIKE '가맹접수 전환%');

CREATE INDEX IF NOT EXISTS own_leads_stage_idx ON own_leads (closed_at, converted_franchise_id, created_at DESC);

-- ── 4. 처리 히스토리 ─────────────────────────────────────────
-- 누가·언제·어떤 칸을 어떻게 바꿨는지. 쓰기는 서버 액션(service_role)만 하므로 쓰기 정책을 두지 않는다.
CREATE TABLE IF NOT EXISTS own_lead_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES own_leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_name TEXT,
  -- create / update / close / reopen / convert  (lead.ts의 LeadLogAction)
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'close', 'reopen', 'convert')),
  -- update일 때 바뀐 열 이름 (lead.ts의 LeadEditableField)
  field TEXT,
  from_value TEXT,
  to_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS own_lead_logs_lead_idx ON own_lead_logs (lead_id, created_at DESC);

ALTER TABLE own_lead_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_lead_logs_select" ON own_lead_logs;
CREATE POLICY "own_lead_logs_select" ON own_lead_logs
  FOR SELECT TO authenticated USING (TRUE);

-- 확인용: 단계별 건수
SELECT
  CASE WHEN closed_at IS NOT NULL THEN '완료'
       WHEN converted_franchise_id IS NOT NULL THEN '이관됨'
       ELSE '진행중' END AS stage,
  count(*)
FROM own_leads
GROUP BY 1;
