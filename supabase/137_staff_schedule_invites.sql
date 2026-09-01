-- 일정 참석 요청(수락/거절) 추가
--
-- 지금은 참석자를 넣으면 알림만 가고, 그 사람이 오는지 아닌지 알 방법이 없었다.
-- 참석자 행에 응답 상태를 붙여 "초대 → 수락/거절"이 되게 한다.
--
-- 기존 참석자는 전부 '대기'로 시작한다. 응답이 없어도 목록에는 그대로 보인다.

ALTER TABLE staff_schedule_participants
  ADD COLUMN IF NOT EXISTS response TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

ALTER TABLE staff_schedule_participants
  DROP CONSTRAINT IF EXISTS staff_schedule_participants_response_check;
ALTER TABLE staff_schedule_participants
  ADD CONSTRAINT staff_schedule_participants_response_check
  CHECK (response IN ('pending', 'accepted', 'declined'));

-- 참석자 본인은 자기 응답만 바꿀 수 있어야 한다. 기존 정책(일정 주인/관리자만 쓰기)은
-- 참석자 추가·삭제용으로 그대로 두고, 본인 응답 수정 정책을 따로 추가한다.
DROP POLICY IF EXISTS "staff_schedule_participants_respond" ON staff_schedule_participants;
CREATE POLICY "staff_schedule_participants_respond" ON staff_schedule_participants
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 확인용: 두 컬럼이 보이면 성공
SELECT column_name, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'staff_schedule_participants'
  AND column_name IN ('response', 'responded_at')
ORDER BY column_name;
