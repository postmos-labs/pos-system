-- 설치완료 승인 시 재고 자동차감 되살리기 + 가맹점 연결
--
-- 배경: 054번에서 만든 deduct_inventory_on_install RPC는 승인 절차가 도입되면서
-- 호출부가 주석 처리돼 지금은 아무 데서도 불리지 않는다(재고가 깎이지 않음).
-- 이제 팀장 최종승인으로 status가 completed가 되는 시점에 호출한다.
--
-- 함께 바뀌는 것:
--  1) 어느 가맹점으로 나갔는지 함께 남긴다 (132번의 merchant_id/merchant_name 활용).
--     그러면 가맹점 360의 "장비 입출고" 카드에 자동차감분도 같이 뜬다.
--  2) 어느 설치건에서 나왔는지 installation_id로 남긴다. 예전에는 사유 문자열에
--     묻어놨는데, 컬럼으로 두면 중복 차감을 막는 판정에 쓸 수 있다.
--  3) 같은 설치건으로 이미 차감된 이력이 있으면 통째로 건너뛴다(중복 차감 방지).
--     승인 버튼이 두 번 눌리거나 재시도가 일어나도 재고가 두 번 깎이지 않는다.
--
-- AS 건도 장비가 나가므로 배송유형을 가리지 않는다. 품목명이 재고 품목명과
-- 정확히 일치할 때만 차감되고, 못 찾은 품목명은 그대로 돌려줘 화면에서 경고로 띄운다.

ALTER TABLE inventory_logs
  ADD COLUMN IF NOT EXISTS installation_id UUID REFERENCES installations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inventory_logs_installation_idx
  ON inventory_logs (installation_id);

-- 인자가 바뀌므로 기존 함수를 지우고 새로 만든다(같은 이름의 과부하가 생기지 않도록).
DROP FUNCTION IF EXISTS deduct_inventory_on_install(jsonb, uuid, text);

CREATE FUNCTION deduct_inventory_on_install(
  p_items jsonb,
  p_install_id uuid,
  p_note text DEFAULT NULL,
  p_merchant_id uuid DEFAULT NULL,
  p_merchant_name text DEFAULT NULL
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
        item_id, item_name, change, reason, installation_id, merchant_id, merchant_name
      )
      VALUES (
        matched_id,
        it->>'name',
        -qty,
        COALESCE(p_note, '설치완료 자동차감'),
        p_install_id,
        p_merchant_id,
        p_merchant_name
      );
    END IF;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION deduct_inventory_on_install(jsonb, uuid, text, uuid, text) TO authenticated;

-- 확인용: 아래가 5개 인자 버전 하나만 나오면 성공
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'deduct_inventory_on_install';
