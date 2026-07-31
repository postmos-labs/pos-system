-- 채팅 기능(DM/그룹/전체채팅) 미사용 확인 후 Supabase Realtime publication에서 제외.
-- postgres_changes 구독이 WAL 디코딩 부하를 유발하는 것으로 의심되어, 코드/테이블 삭제 전
-- 1단계로 realtime만 먼저 끊어서 CPU 영향을 검증한다. (테이블/데이터는 그대로 보존)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE dm_rooms;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE dm_messages;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE messages;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE group_chat_rooms;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE group_chat_members;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE group_chat_messages;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
