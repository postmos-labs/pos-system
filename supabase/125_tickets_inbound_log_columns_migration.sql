-- ============================================
-- 인입내역 로그 컬럼 보강
-- 001 스키마의 tickets에는 reception_channel/progress_note가 없다 (옛 작업 등록 폼
-- 시절부터 코드만 참조하고 마이그레이션이 없었음). 인입내역 등록이 이 컬럼에
-- 쓰기를 하므로 없으면 등록이 42703으로 실패한다.
-- ============================================

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS reception_channel TEXT,   -- 인입 채널 (채널톡/유선 등)
  ADD COLUMN IF NOT EXISTS progress_note TEXT;       -- 답변내용
