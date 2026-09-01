-- 직원 일정 (개인 캘린더) — 설치 캘린더와 별개의 새 메뉴
--
-- 설치 캘린더(calendar_events 등)는 업무 진행 일정을 모아 보는 화면이라 날짜 단위다.
-- 직원 일정은 미팅·회의처럼 "몇 시부터 몇 시까지"가 필요해 별도 표로 둔다.
--
-- 공개 범위: 전 직원이 서로의 일정을 본다(누가 언제 자리를 비우는지 알아야 하므로).
-- 수정·삭제: 등록자 본인과 관리자만. RLS로 막고, 화면에서도 버튼을 감춘다.

CREATE TABLE IF NOT EXISTS staff_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '미팅'
    CHECK (category IN ('미팅', '회의', '교육', '외출', '휴가', '기타')),
  -- 시작·종료 시각. 종일 일정은 all_day=TRUE로 두고 시각은 00:00~23:59로 채운다.
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  location TEXT,
  memo TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_schedules_time_order CHECK (ends_at >= starts_at)
);

-- 참석자. 일정이 지워지면 함께 지운다. 같은 사람을 두 번 넣지 못하게 한다.
CREATE TABLE IF NOT EXISTS staff_schedule_participants (
  schedule_id UUID NOT NULL REFERENCES staff_schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (schedule_id, user_id)
);

-- 월 단위로 훑는 화면이라 시작 시각 기준 조회가 기본이다.
CREATE INDEX IF NOT EXISTS staff_schedules_starts_idx ON staff_schedules (starts_at);
CREATE INDEX IF NOT EXISTS staff_schedule_participants_user_idx
  ON staff_schedule_participants (user_id);

ALTER TABLE staff_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_schedule_participants ENABLE ROW LEVEL SECURITY;

-- 조회는 전 직원 공개
DROP POLICY IF EXISTS "staff_schedules_select" ON staff_schedules;
CREATE POLICY "staff_schedules_select" ON staff_schedules
  FOR SELECT TO authenticated USING (TRUE);

-- 등록은 로그인한 직원 누구나. 단 created_by를 남의 것으로 위장할 수 없게 한다.
DROP POLICY IF EXISTS "staff_schedules_insert" ON staff_schedules;
CREATE POLICY "staff_schedules_insert" ON staff_schedules
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- 수정·삭제는 등록자 본인 또는 관리자(admin/master)만
DROP POLICY IF EXISTS "staff_schedules_update" ON staff_schedules;
CREATE POLICY "staff_schedules_update" ON staff_schedules
  FOR UPDATE TO authenticated USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'master')
    )
  );

DROP POLICY IF EXISTS "staff_schedules_delete" ON staff_schedules;
CREATE POLICY "staff_schedules_delete" ON staff_schedules
  FOR DELETE TO authenticated USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'master')
    )
  );

-- 참석자도 같은 기준을 따른다(일정을 손댈 수 있는 사람이 참석자도 손댄다).
DROP POLICY IF EXISTS "staff_schedule_participants_select" ON staff_schedule_participants;
CREATE POLICY "staff_schedule_participants_select" ON staff_schedule_participants
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "staff_schedule_participants_write" ON staff_schedule_participants;
CREATE POLICY "staff_schedule_participants_write" ON staff_schedule_participants
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM staff_schedules s
      WHERE s.id = schedule_id
        AND (
          s.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'master')
          )
        )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff_schedules s
      WHERE s.id = schedule_id
        AND (
          s.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'master')
          )
        )
    )
  );

-- 확인용: 두 표가 나오면 성공
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('staff_schedules', 'staff_schedule_participants')
ORDER BY table_name;
