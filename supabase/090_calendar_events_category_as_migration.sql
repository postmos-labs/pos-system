-- ============================================
-- 캘린더 수동 일정 구분에 'AS'(사후관리) 항목 추가
-- calendar_events_category_migration.sql 적용 이후에 실행
-- ============================================

ALTER TABLE calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_category_check;
ALTER TABLE calendar_events
  ADD CONSTRAINT calendar_events_category_check
  CHECK (category IN ('일정', '설치', '오픈', '카드신청', '택배발송', 'AS', '메모'));
