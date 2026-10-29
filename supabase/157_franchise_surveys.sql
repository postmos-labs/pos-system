-- 가맹점 리서치 설문 (정수기·배민·테이블오더·키오스크 관심 조사)
--
-- 가맹접수 상세에서 "리서치 발송"을 누르면 가맹점마다 1회용 링크(token)를 만들어 알림톡으로 보낸다.
-- 알림톡 버튼 4개는 모두 /survey/<token>?item=<항목>으로 열리고, 고객이 항목을 골라 한 번만 제출한다.
-- 항목 키는 src/lib/survey.ts의 SURVEY_ITEMS와 같이 간다.
--
-- 가맹점 하나에 한 줄. 재발송은 같은 토큰을 쓰고 기한만 늘린다.
-- 쓰기는 서버(service_role)만 하므로 쓰기 정책을 두지 않는다.
--
-- 실행 전에도 화면은 열린다. 가맹접수 상세의 리서치 칸과 리서치 응답 목록이 "준비 중"으로 뜨고 발송만 막힌다.

CREATE TABLE IF NOT EXISTS franchise_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  franchise_application_id UUID NOT NULL UNIQUE REFERENCES franchise_applications(id) ON DELETE CASCADE,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),

  -- 발송
  sent_at TIMESTAMPTZ,
  sent_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sent_by_name TEXT,
  send_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,

  -- 고객 반응: 처음 링크를 연 시각과 그때 누른 버튼
  opened_at TIMESTAMPTZ,
  entry_item TEXT,

  -- 제출 (한 번만)
  picks TEXT[],
  submitted_at TIMESTAMPTZ,

  -- 영업 연락 처리
  contacted_at TIMESTAMPTZ,
  contacted_by_name TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE franchise_surveys DROP CONSTRAINT IF EXISTS franchise_surveys_entry_item_check;
ALTER TABLE franchise_surveys ADD CONSTRAINT franchise_surveys_entry_item_check
  CHECK (entry_item IS NULL OR entry_item IN ('water_purifier', 'baemin', 'table_order', 'kiosk'));

ALTER TABLE franchise_surveys DROP CONSTRAINT IF EXISTS franchise_surveys_picks_check;
ALTER TABLE franchise_surveys ADD CONSTRAINT franchise_surveys_picks_check
  CHECK (picks IS NULL OR picks <@ ARRAY['water_purifier', 'baemin', 'table_order', 'kiosk']::TEXT[]);

CREATE INDEX IF NOT EXISTS franchise_surveys_submitted_idx ON franchise_surveys (submitted_at DESC);

ALTER TABLE franchise_surveys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "franchise_surveys_select" ON franchise_surveys;
CREATE POLICY "franchise_surveys_select" ON franchise_surveys
  FOR SELECT TO authenticated USING (TRUE);

-- 확인
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'franchise_surveys'
ORDER BY ordinal_position;
