-- 수정 요청 당시의 문의 내용·해결 절차 스냅샷
--
-- 지금은 요청 뒤 담당자가 무엇을 어떻게 고쳤는지 볼 방법이 없다. 요청을 보낼 때 그때의 값을
-- 같이 남겨 두고, 관리 화면에서 지금 값과 나란히 보여준다. 기존 요청은 비어 있어
-- "변경 전 기록 없음"으로 표시된다.

ALTER TABLE ticket_revision_requests
  ADD COLUMN IF NOT EXISTS before_title TEXT,
  ADD COLUMN IF NOT EXISTS before_steps TEXT;

-- 확인용: 컬럼이 보이면 성공
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'ticket_revision_requests' AND column_name IN ('before_title', 'before_steps');
