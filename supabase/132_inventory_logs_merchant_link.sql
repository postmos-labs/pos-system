-- 재고 변동에 가맹점 연결 추가
--
-- 재고를 추가·차감할 때 어느 가맹점 때문에 나갔는지 남길 수 있게 한다.
-- 연결은 "선택"이다 — 창고 정리·파손 폐기처럼 가맹점과 무관한 변동도 그대로 기록돼야 한다.
-- 연결된 변동은 가맹점 360 화면의 "장비 입출고" 카드에 표시된다.
--
-- 가맹점이 삭제돼도 재고 변동 이력 자체는 남긴다(SET NULL).
-- 접수 당시 상호명은 merchant_name에 함께 남겨, 연결이 끊겨도 무엇이었는지 알 수 있게 한다.

ALTER TABLE inventory_logs
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merchant_name TEXT;

-- 가맹점 360에서 해당 가맹점의 변동만 최신순으로 뽑는 조회용
CREATE INDEX IF NOT EXISTS inventory_logs_merchant_idx
  ON inventory_logs (merchant_id, created_at DESC);

-- 확인용: 두 컬럼이 보이면 성공
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'inventory_logs'
  AND column_name IN ('merchant_id', 'merchant_name')
ORDER BY column_name;
