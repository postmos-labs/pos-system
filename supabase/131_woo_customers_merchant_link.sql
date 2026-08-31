-- 우국상 고객이 어느 가맹점이 되었는지 기록
--
-- 우국상 관리(woo_customers)와 가맹점(merchants)은 서로 가리키는 컬럼이 없는
-- 독립된 표라, 인입내역의 가맹점 검색에 우국상 고객이 나오지 않았다.
--
-- 두 표를 합치지는 않는다. 대신 인입내역에서 우국상 고객을 고르면 그 정보로
-- 가맹점을 만들고, 어느 가맹점이 되었는지를 여기에 적어둔다.
-- 다음에 같은 고객을 골라도 이 값을 보고 기존 가맹점에 연결하므로 중복이 생기지 않는다.
--
-- 가맹점이 삭제되면 연결만 끊고 우국상 기록 자체는 남긴다.

ALTER TABLE woo_customers
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS woo_customers_merchant_idx
  ON woo_customers (merchant_id)
  WHERE merchant_id IS NOT NULL;

-- 확인용: 컬럼이 보이면 성공
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'woo_customers'
   AND column_name = 'merchant_id';
