-- 택배 발송 체크리스트와 재고 이력 유형
--
-- 지금은 완료 시점에 접수 때 고른 장비 목록(installations.items)을 그대로 재고에서 뺀다.
-- 택배 건은 실제 보낸 장비가 접수와 다른 경우가 잦고, 목록이 비어 있으면 아무것도 안 빠진다.
-- "제품준비" 단계에서 실제 발송 장비·수량을 체크리스트로 확정하고 그 값을 items에 덮어써
-- 완료 수량과 출고 수량을 같게 만든다. 재고 이력에는 유형을 붙여 택배출고·설치출고·수동출고를
-- 구분해 검색한다. 유형 값은 src/app/(app)/installs/deliveryChecklist.ts와 같이 간다.

ALTER TABLE installations
  ADD COLUMN IF NOT EXISTS delivery_checklist JSONB;

ALTER TABLE inventory_logs
  ADD COLUMN IF NOT EXISTS log_type TEXT
  CHECK (log_type IN ('in', 'delivery_out', 'install_out', 'manual_out', 'audit_adjust', 'return'));

-- 기존 이력 보정: 설치건이 연결된 차감은 배송 유형에 따라 택배출고/설치출고, 나머지는 부호로 입고/수동출고
UPDATE inventory_logs l
   SET log_type = CASE WHEN i.delivery_type = 'delivery' THEN 'delivery_out' ELSE 'install_out' END
  FROM installations i
 WHERE l.installation_id = i.id AND l.log_type IS NULL;
UPDATE inventory_logs SET log_type = 'in'         WHERE log_type IS NULL AND change > 0;
UPDATE inventory_logs SET log_type = 'manual_out' WHERE log_type IS NULL AND change < 0;

CREATE INDEX IF NOT EXISTS inventory_logs_type_idx ON inventory_logs (log_type, created_at DESC);

-- 차감 RPC에 이력 유형 인자 추가. 인자가 바뀌므로 기존 함수를 지우고 다시 만든다.
DROP FUNCTION IF EXISTS deduct_inventory_on_install(jsonb, uuid, text, uuid, text);

CREATE FUNCTION deduct_inventory_on_install(
  p_items jsonb,
  p_install_id uuid,
  p_note text DEFAULT NULL,
  p_merchant_id uuid DEFAULT NULL,
  p_merchant_name text DEFAULT NULL,
  p_log_type text DEFAULT 'install_out'
)
RETURNS TABLE(unmatched_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it jsonb;
  matched_id uuid;
  qty int;
BEGIN
  -- 이미 이 설치건으로 차감한 적이 있으면 아무것도 하지 않는다.
  IF EXISTS (
    SELECT 1 FROM inventory_logs WHERE installation_id = p_install_id
  ) THEN
    RETURN;
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    qty := COALESCE((it->>'quantity')::int, 0);
    IF qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT id INTO matched_id FROM inventory_items WHERE name = (it->>'name') LIMIT 1;

    IF matched_id IS NULL THEN
      unmatched_name := it->>'name';
      RETURN NEXT;
    ELSE
      UPDATE inventory_items
      SET quantity = quantity - qty, last_checked = CURRENT_DATE
      WHERE id = matched_id;

      INSERT INTO inventory_logs (
        item_id, item_name, change, reason, installation_id, merchant_id, merchant_name, log_type
      )
      VALUES (
        matched_id,
        it->>'name',
        -qty,
        COALESCE(p_note, '설치완료 자동차감'),
        p_install_id,
        p_merchant_id,
        p_merchant_name,
        p_log_type
      );
    END IF;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION deduct_inventory_on_install(jsonb, uuid, text, uuid, text, text) TO authenticated;

-- 확인용: 아래가 6개 인자 버전 하나만 나오면 성공
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'deduct_inventory_on_install';
