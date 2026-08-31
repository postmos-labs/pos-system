-- 직원 계정을 삭제해도 활동 로그에 "누가 했는지"가 남게 한다
--
-- 075_audit_log_hardening.sql이 같은 문제를 이미 풀었지만 3개 테이블에만 적용됐다.
-- 나머지 로그는 user_id/created_by만 들고 있어서, 계정 삭제로 그 값이 NULL이 되면
-- 작성자가 영구히 "알 수 없음"이 된다. 감사 로그의 존재 이유와 맞지 않는다.
--
--   이름이 남던 것 : franchise_application_logs / installation_activity_logs /
--                    notification_logs / change_request_logs / deletion_logs
--   이름을 잃던 것 : ticket_logs / inventory_logs / franchise_application_call_logs /
--                    merchant_memo_entries / installation_post_history   ← 이번 대상
--
-- 기존 컬럼은 건드리지 않는다. 새 컬럼을 추가하고 그 컬럼만 채운다.
-- 실행 순서가 중요하다: 컬럼 추가 -> 트리거 연결 -> 백필.
-- 백필을 먼저 하면 백필과 트리거 사이에 들어온 행이 빈 채로 남는다.

-- ── 1. 컬럼 추가 ──────────────────────────────────────────
-- nullable + 기본값 없음이라 테이블 재작성 없이 메타데이터만 바뀐다.

ALTER TABLE ticket_logs                     ADD COLUMN IF NOT EXISTS user_name TEXT;
ALTER TABLE inventory_logs                  ADD COLUMN IF NOT EXISTS user_name TEXT;
ALTER TABLE franchise_application_call_logs ADD COLUMN IF NOT EXISTS user_name TEXT;
-- 이 둘은 사용자 컬럼 이름이 created_by라 author_name으로 맞춘다.
ALTER TABLE merchant_memo_entries           ADD COLUMN IF NOT EXISTS author_name TEXT;
ALTER TABLE installation_post_history       ADD COLUMN IF NOT EXISTS author_name TEXT;

-- ── 2. created_by용 트리거 함수 ────────────────────────────
-- user_id를 보는 075의 fill_audit_user_name()은 그대로 재사용하고(덮어쓰지 않는다),
-- created_by를 보는 판만 새로 만든다.
-- 이름을 못 찾으면 NULL로 둔다 — 화면에 보여줄 문구는 코드 한 곳에서만 정한다.

CREATE OR REPLACE FUNCTION public.fill_audit_author_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.author_name IS NULL AND NEW.created_by IS NOT NULL THEN
    SELECT name INTO NEW.author_name FROM profiles WHERE id = NEW.created_by;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3. 트리거 연결 ────────────────────────────────────────

DROP TRIGGER IF EXISTS ticket_logs_fill_user_name ON ticket_logs;
CREATE TRIGGER ticket_logs_fill_user_name
  BEFORE INSERT ON ticket_logs
  FOR EACH ROW EXECUTE FUNCTION public.fill_audit_user_name();

DROP TRIGGER IF EXISTS inventory_logs_fill_user_name ON inventory_logs;
CREATE TRIGGER inventory_logs_fill_user_name
  BEFORE INSERT ON inventory_logs
  FOR EACH ROW EXECUTE FUNCTION public.fill_audit_user_name();

DROP TRIGGER IF EXISTS call_logs_fill_user_name ON franchise_application_call_logs;
CREATE TRIGGER call_logs_fill_user_name
  BEFORE INSERT ON franchise_application_call_logs
  FOR EACH ROW EXECUTE FUNCTION public.fill_audit_user_name();

DROP TRIGGER IF EXISTS memo_entries_fill_author_name ON merchant_memo_entries;
CREATE TRIGGER memo_entries_fill_author_name
  BEFORE INSERT ON merchant_memo_entries
  FOR EACH ROW EXECUTE FUNCTION public.fill_audit_author_name();

DROP TRIGGER IF EXISTS post_history_fill_author_name ON installation_post_history;
CREATE TRIGGER post_history_fill_author_name
  BEFORE INSERT ON installation_post_history
  FOR EACH ROW EXECUTE FUNCTION public.fill_audit_author_name();

-- ── 4. 기존 행 백필 ───────────────────────────────────────
-- 아직 살아 있는 계정의 이름을 지금 박아둔다. 계정이 지워진 뒤에는 복구할 수 없다.
-- IS NULL 조건이 있어 여러 번 실행해도 이미 채워진 값은 건드리지 않는다.

UPDATE ticket_logs l SET user_name = p.name
  FROM profiles p WHERE l.user_id = p.id AND l.user_name IS NULL;

UPDATE inventory_logs l SET user_name = p.name
  FROM profiles p WHERE l.user_id = p.id AND l.user_name IS NULL;

UPDATE franchise_application_call_logs l SET user_name = p.name
  FROM profiles p WHERE l.user_id = p.id AND l.user_name IS NULL;

UPDATE merchant_memo_entries m SET author_name = p.name
  FROM profiles p WHERE m.created_by = p.id AND m.author_name IS NULL;

UPDATE installation_post_history h SET author_name = p.name
  FROM profiles p WHERE h.created_by = p.id AND h.author_name IS NULL;

-- ── 확인용 ───────────────────────────────────────────────
-- 이름이 채워진 비율. 작성자 계정이 이미 삭제된 행은 채워지지 않는다(복구 불가).
SELECT 'ticket_logs' AS 테이블,
       count(*) AS 전체, count(user_name) AS 이름있음 FROM ticket_logs
UNION ALL SELECT 'inventory_logs', count(*), count(user_name) FROM inventory_logs
UNION ALL SELECT 'call_logs', count(*), count(user_name) FROM franchise_application_call_logs
UNION ALL SELECT 'memo_entries', count(*), count(author_name) FROM merchant_memo_entries
UNION ALL SELECT 'post_history', count(*), count(author_name) FROM installation_post_history;
