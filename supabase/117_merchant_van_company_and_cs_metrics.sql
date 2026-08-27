-- ============================================
-- KICC 계약 대응 + CS 월간 보고 지표 수집
--
-- 목적
--   1) 가맹점이 어느 VAN사 건인지 구분 (코세스 / KICC 등) — 보고서를 VAN사별로 가르기 위함
--   2) CS 이력을 집계 가능한 형태로 기록 — 장애 유형 / 해결 방식 / 반복 여부
--
-- 안전성
--   - 전부 nullable 컬럼 "추가"만 한다. DROP / 타입 변경 / 기존 데이터 UPDATE 없음.
--   - 기존 행은 모두 NULL이 되며, 이 마이그레이션을 실행하지 않아도 앱은 그대로 동작한다
--     (앱 코드가 컬럼 없음 에러를 잡아 신규 필드를 뺀 채 재시도한다).
--   - CHECK 제약은 NULL을 통과시키므로 기존 행이 걸리지 않는다.
-- ============================================

-- 1) 가맹점 VAN사 --------------------------------------------------
-- franchise_applications.van_company와 같은 성격의 TEXT 컬럼.
-- 값 목록은 앱(src/types/index.ts VAN_COMPANIES)에서 관리하므로 CHECK를 걸지 않는다.
-- VAN사가 늘어도 마이그레이션 없이 값만 추가하면 된다.
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS van_company TEXT;

CREATE INDEX IF NOT EXISTS merchants_van_company_idx
  ON merchants (van_company);

-- 2) CS 이력 집계 필드 ----------------------------------------------
-- merchant_memo_entries.entry_type(as/claim/general/etc)은 이미 있고,
-- 여기에 "무엇이 문제였고 어떻게 끝났는지"를 더한다.
ALTER TABLE merchant_memo_entries
  ADD COLUMN IF NOT EXISTS issue_category TEXT,
  ADD COLUMN IF NOT EXISTS resolution TEXT,
  ADD COLUMN IF NOT EXISTS is_repeat BOOLEAN;

ALTER TABLE merchant_memo_entries
  DROP CONSTRAINT IF EXISTS merchant_memo_entries_issue_category_check;
ALTER TABLE merchant_memo_entries
  ADD CONSTRAINT merchant_memo_entries_issue_category_check
  CHECK (issue_category IN ('payment', 'pos', 'device', 'install', 'usage', 'etc'));

ALTER TABLE merchant_memo_entries
  DROP CONSTRAINT IF EXISTS merchant_memo_entries_resolution_check;
ALTER TABLE merchant_memo_entries
  ADD CONSTRAINT merchant_memo_entries_resolution_check
  CHECK (resolution IN ('phone', 'guide', 'remote', 'onsite', 'unresolved'));

-- 월간 집계는 "기간 + 유형"으로 훑으므로 created_at을 선두에 둔다.
CREATE INDEX IF NOT EXISTS merchant_memo_entries_metrics_idx
  ON merchant_memo_entries (created_at DESC, entry_type, resolution, issue_category);
