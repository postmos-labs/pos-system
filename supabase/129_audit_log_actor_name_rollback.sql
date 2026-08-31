-- 129 되돌리기
--
-- 129는 새 컬럼을 추가하고 그 컬럼만 채웠을 뿐 기존 데이터를 건드리지 않았다.
-- 따라서 트리거를 떼고 컬럼을 지우면 실행 전 상태로 완전히 돌아간다.
-- 다만 백필로 채워둔 작성자 이름도 함께 사라지므로, 되돌린 뒤 다시 129를 실행하면
-- 그 사이 삭제된 계정의 이름은 복구되지 않는다.

DROP TRIGGER IF EXISTS ticket_logs_fill_user_name ON ticket_logs;
DROP TRIGGER IF EXISTS inventory_logs_fill_user_name ON inventory_logs;
DROP TRIGGER IF EXISTS call_logs_fill_user_name ON franchise_application_call_logs;
DROP TRIGGER IF EXISTS memo_entries_fill_author_name ON merchant_memo_entries;
DROP TRIGGER IF EXISTS post_history_fill_author_name ON installation_post_history;

DROP FUNCTION IF EXISTS public.fill_audit_author_name();

ALTER TABLE ticket_logs                     DROP COLUMN IF EXISTS user_name;
ALTER TABLE inventory_logs                  DROP COLUMN IF EXISTS user_name;
ALTER TABLE franchise_application_call_logs DROP COLUMN IF EXISTS user_name;
ALTER TABLE merchant_memo_entries           DROP COLUMN IF EXISTS author_name;
ALTER TABLE installation_post_history       DROP COLUMN IF EXISTS author_name;
