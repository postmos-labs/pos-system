-- 090: franchise-receipts 1차 배치 리팩토링
-- 대상: docs/feature/franchise-receipts/db-plan.md 최종 확정본
-- 범위: 공통코드 테이블, 접수채널/구분/옵션 재구성, van_company 배열화,
--       updated_by/deleted_at, 메모 정규화
-- 범위 밖(2차 배치): equipment_items/equipment_select_token/selected_equipment/equipment_selected_at
--                    (/api/franchise/equipment-select 라우트 점검 후 별도 진행)
-- 이 스크립트는 공유 dev DB에서 여러 번 실행돼도 안전하도록 가능한 곳에 IF NOT EXISTS/가드를 넣음.

-- ============================================================
-- 1. 공통코드 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS codes (
  group_code  text NOT NULL,
  code        text NOT NULL,
  label       text NOT NULL,
  sort_order  integer,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_code, code),
  UNIQUE (code)
);

INSERT INTO codes (group_code, code, label, sort_order) VALUES
  ('RECEPTION_CHANNEL', 'DIRECT_SALES', '직접 영업', 1),
  ('RECEPTION_CHANNEL', 'TOSS_LEAD',    '토스 리드', 2),
  ('CASE_TYPE', 'NEW',          '신규', 1),
  ('CASE_TYPE', 'CONVERT',      '전환', 2),
  ('CASE_TYPE', 'SUCCESSION',   '승계', 3),
  ('CASE_TYPE', 'NAME_CHANGE',  '명변', 4),
  ('FRANCHISE_OPTION', 'RENTAL',      '렌탈', 1),
  ('FRANCHISE_OPTION', 'INSTALLMENT', '할부', 2),
  ('VAN_COMPANY', 'KOCES2',        '코세스2', 1),
  ('VAN_COMPANY', 'KOCES1',        '코세스1', 2),
  ('VAN_COMPANY', 'KOVEN',         '코벤',   3),
  ('VAN_COMPANY', 'GIGA_FRANCHISE','기가맹', 4)
ON CONFLICT (group_code, code) DO NOTHING;

-- ============================================================
-- 2. franchise_applications 변경
-- ============================================================

-- 2-1. legacy rename (아직 rename 전이면 실행, 이미 됐으면 skip)
--      legacy 컬럼의 "부재"로 판단한다 — reception_date의 "존재"로 판단하면 재실행 시
--      2-2에서 새로 만든 reception_date(date)를 또 legacy로 rename하려다 에러가 난다.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'franchise_applications' AND column_name = 'reception_date_legacy') THEN
    ALTER TABLE franchise_applications RENAME COLUMN reception_date TO reception_date_legacy;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'franchise_applications' AND column_name = 'reception_channel_legacy') THEN
    ALTER TABLE franchise_applications RENAME COLUMN reception_channel TO reception_channel_legacy;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'franchise_applications' AND column_name = 'van_company_legacy') THEN
    ALTER TABLE franchise_applications RENAME COLUMN van_company TO van_company_legacy;
  END IF;
END $$;

-- 2-2. 신규 컬럼
ALTER TABLE franchise_applications ADD COLUMN IF NOT EXISTS reception_date          date;
ALTER TABLE franchise_applications ADD COLUMN IF NOT EXISTS reception_channel_code  text REFERENCES codes(code);
ALTER TABLE franchise_applications ADD COLUMN IF NOT EXISTS case_type_code          text REFERENCES codes(code);
ALTER TABLE franchise_applications ADD COLUMN IF NOT EXISTS option_code             text REFERENCES codes(code);
ALTER TABLE franchise_applications ADD COLUMN IF NOT EXISTS original_application_id uuid REFERENCES franchise_applications(id);
ALTER TABLE franchise_applications ADD COLUMN IF NOT EXISTS van_company_codes       text[] NOT NULL DEFAULT '{}';
ALTER TABLE franchise_applications ADD COLUMN IF NOT EXISTS updated_by              uuid REFERENCES profiles(id);
ALTER TABLE franchise_applications ADD COLUMN IF NOT EXISTS deleted_at              timestamptz;

-- 2-3. 전환/승계/명변은 반드시 원본 참조 필요
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'franchise_applications' AND constraint_name = 'case_type_requires_origin'
  ) THEN
    ALTER TABLE franchise_applications ADD CONSTRAINT case_type_requires_origin
      CHECK (case_type_code = 'NEW' OR case_type_code IS NULL OR original_application_id IS NOT NULL);
  END IF;
END $$;

-- 2-4. updated_by 자동 기록 트리거
--      주의: 기존 franchise_applications_updated_at 트리거(update_updated_at() 함수, 여러 테이블 공용 추정)는
--      건드리지 않는다. updated_by만 별도 함수/트리거로 채운다.
--      (createAdminClient()로 실행되는 관리자/서버 액션 경로는 auth.uid()가 NULL일 수 있음 — 정상)
CREATE OR REPLACE FUNCTION set_franchise_application_updated_by()
RETURNS trigger AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS franchise_applications_set_updated_by ON franchise_applications;
CREATE TRIGGER franchise_applications_set_updated_by
  BEFORE UPDATE ON franchise_applications
  FOR EACH ROW EXECUTE FUNCTION set_franchise_application_updated_by();

-- 2-5. 소프트 삭제용 활성 행 뷰
CREATE OR REPLACE VIEW franchise_applications_active AS
  SELECT * FROM franchise_applications WHERE deleted_at IS NULL;

-- ============================================================
-- 3. franchise_application_memos (신규)
-- ============================================================
CREATE TABLE IF NOT EXISTS franchise_application_memos (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  franchise_application_id  uuid NOT NULL REFERENCES franchise_applications(id) ON DELETE CASCADE,
  user_id                   uuid REFERENCES profiles(id),
  author_name               text, -- user_id 매칭 실패/모호한 경우를 위한 원문 작성자명 fallback (과거 메모 블롭엔 이름만 있고 user_id가 없었음)
  content                   text NOT NULL,
  pinned_at                 timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  deleted_at                timestamptz
);

CREATE INDEX IF NOT EXISTS idx_franchise_application_memos_application_id
  ON franchise_application_memos (franchise_application_id)
  WHERE deleted_at IS NULL;

-- 기존 franchise_applications에도 쓰이는 공용 update_updated_at() 함수를 재사용
DROP TRIGGER IF EXISTS franchise_application_memos_updated_at ON franchise_application_memos;
CREATE TRIGGER franchise_application_memos_updated_at
  BEFORE UPDATE ON franchise_application_memos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 4. RLS — franchise_applications 기존 정책과 동일한 패턴(인증된 사용자 전체 CRUD,
--    세부 권한은 앱 레벨에서 체크)을 따르되, codes는 참조 데이터라 쓰기는 앱에 안 열어둠
-- ============================================================

ALTER TABLE codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated read" ON codes;
CREATE POLICY "authenticated read" ON codes FOR SELECT TO authenticated USING (true);
-- insert/update/delete 정책 없음 = authenticated로는 못 바꿈, service_role(마이그레이션/관리 스크립트)만 가능

ALTER TABLE franchise_application_memos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated read" ON franchise_application_memos;
DROP POLICY IF EXISTS "authenticated insert" ON franchise_application_memos;
DROP POLICY IF EXISTS "authenticated update" ON franchise_application_memos;
DROP POLICY IF EXISTS "authenticated delete" ON franchise_application_memos;
CREATE POLICY "authenticated read"   ON franchise_application_memos FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert" ON franchise_application_memos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update" ON franchise_application_memos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "authenticated delete" ON franchise_application_memos FOR DELETE TO authenticated USING (true);
