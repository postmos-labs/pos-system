-- 외부 기사 명단 (기술지원 > 외부 기사 관리)
--
-- 화면(src/app/(app)/external-techs)은 예전에 만들어졌지만 테이블을 만드는 마이그레이션이 없어
-- 운영 DB에 external_techs가 없었다. 등록하면 "Could not find the table 'public.external_techs'"가 났다.
-- 화면이 쓰는 칼럼(name, phone, specialty[], area, available, notes)대로 만든다.
-- 화면은 브라우저 클라이언트로 직접 읽고 쓰므로, 페이지 접근 권한(master·admin·cs·tech)과 같은 기준으로 RLS를 둔다.

CREATE TABLE IF NOT EXISTS external_techs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  specialty TEXT[] NOT NULL DEFAULT '{}',
  area TEXT,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE external_techs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "external_techs_staff_all" ON external_techs;
CREATE POLICY "external_techs_staff_all" ON external_techs
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('master', 'admin', 'cs', 'tech')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('master', 'admin', 'cs', 'tech')
  ));

-- PostgREST가 새 테이블을 바로 인식하도록 스키마 캐시를 새로 읽게 한다.
NOTIFY pgrst, 'reload schema';

-- 확인
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'external_techs'
ORDER BY ordinal_position;
