-- 인입내역 수정 요청 취소
--
-- 잘못 보낸 요청이나 담당자가 바뀐 건을 마스터가 거둬들일 방법이 없었다.
-- 행을 지우면 보냈다는 기록이 사라지고, 완료로 닫으면 실제로 고친 것과 구분이 안 된다.
-- 상태 하나를 더 둔다.
--   open: 수정 대기 / resolved: 마스터가 확인해 닫음 / canceled: 마스터가 거둬들임
--
-- 139번의 CHECK는 컬럼에 인라인으로 걸려 있어 이름이 자동으로 붙었다(<표>_<컬럼>_check).
-- 그 이름으로 지우고 다시 건다. 코드 쪽 상태 타입(RevisionRow.status)과 반드시 같이 간다.

ALTER TABLE ticket_revision_requests
  DROP CONSTRAINT IF EXISTS ticket_revision_requests_status_check;
ALTER TABLE ticket_revision_requests
  ADD CONSTRAINT ticket_revision_requests_status_check
  CHECK (status IN ('open', 'resolved', 'canceled'));

-- 누가 언제 왜 거둬들였는지. resolved_* 와 같은 꼴로 나란히 둔다.
ALTER TABLE ticket_revision_requests
  ADD COLUMN IF NOT EXISTS canceled_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS canceled_by_name TEXT,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_note TEXT;

-- 확인용: canceled_ 네 컬럼이 보이면 성공
SELECT column_name
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'ticket_revision_requests'
   AND column_name LIKE 'canceled_%'
 ORDER BY column_name;
