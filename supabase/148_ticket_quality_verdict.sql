-- 인입내역 품질 판정 결과 저장
--
-- 정규식으로 흉내 내던 의미 판단을 모델에 넘기고, 판정 결과와 내용 해시를 저장해 내용이
-- 바뀔 때만 다시 부른다. 컬럼이 없으면 규칙 판정으로 동작한다.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS quality_verdict JSONB,
  ADD COLUMN IF NOT EXISTS quality_hash TEXT;

CREATE INDEX IF NOT EXISTS tickets_quality_hash_idx ON tickets (quality_hash);

-- 확인용
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'tickets' AND column_name IN ('quality_verdict', 'quality_hash');
