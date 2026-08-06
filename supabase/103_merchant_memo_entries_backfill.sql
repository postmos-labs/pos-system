-- 기존 merchants.memo를 누적 메모 이력의 최초 1건으로 이관
-- 주의: 이 파일은 검토용으로만 생성합니다. Supabase에 실행하지 않습니다.
-- 기존 memo에는 별도 작성 시각이 없으므로 merchant.created_at을 최초 메모 시각으로 사용한다.

INSERT INTO merchant_memo_entries (merchant_id, content, created_at)
SELECT
  m.id,
  m.memo,
  COALESCE(m.created_at, now())
FROM merchants AS m
WHERE NULLIF(BTRIM(m.memo), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM merchant_memo_entries AS e
    WHERE e.merchant_id = m.id
      AND e.content = m.memo
  );
