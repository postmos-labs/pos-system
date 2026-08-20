-- 115번은 앞으로 발생하는 기술지원 이관에만 걸린다. 이미 존재하는 가맹점은 여전히
-- merchant_equipment가 0세트다. franchise_applications.equipment_items를 가진 가맹점 중
-- source='application' 행이 하나도 없는 가맹점만 골라 115와 같은 매핑으로 채운다.
-- docs/feature/merchant-unified-view/design.md "2. 기존 가맹점 백필" 참고.
--
-- 주의: 이 파일은 SQL 리뷰 및 수동 적용을 위한 파일이다. 이 작업에서는 어떤 Supabase
-- 프로젝트에도 실행하지 않는다. 115_merchant_equipment_seed_from_application.sql이 먼저
-- 적용되어 seed_merchant_equipment_from_application() 함수가 존재해야 한다.

-- ── 백필 전 확인 ──────────────────────────────────────────────
-- 대상 건수: 접수 연결이 있고 아직 source='application' 행이 없는 가맹점 수
-- SELECT COUNT(*) FROM merchants m
-- WHERE m.franchise_application_id IS NOT NULL
--   AND NOT EXISTS (
--     SELECT 1 FROM merchant_equipment me
--     WHERE me.merchant_id = m.id AND me.source = 'application'
--   );
--
-- 백필 전 merchant_equipment 전체/소스별 건수
-- SELECT source, COUNT(*) FROM merchant_equipment GROUP BY source;
-- ────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_row RECORD;
BEGIN
  FOR v_row IN
    SELECT m.id AS merchant_id, fa.equipment_items
    FROM merchants m
    JOIN franchise_applications fa ON fa.id = m.franchise_application_id
    WHERE m.franchise_application_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM merchant_equipment me
        WHERE me.merchant_id = m.id AND me.source = 'application'
      )
  LOOP
    PERFORM seed_merchant_equipment_from_application(v_row.merchant_id, v_row.equipment_items);
  END LOOP;
END $$;

-- ── 백필 후 확인 ──────────────────────────────────────────────
-- 백필 후 source='application' 행이 생긴 가맹점 수 (위 "대상 건수"와 비교)
-- SELECT COUNT(DISTINCT merchant_id) FROM merchant_equipment WHERE source = 'application';
--
-- 백필 후 merchant_equipment 전체/소스별 건수 (백필 전 값과 비교)
-- SELECT source, COUNT(*) FROM merchant_equipment GROUP BY source;
--
-- 여전히 0세트로 남은 가맹점(접수 연결이 없거나 equipment_items가 비어 있던 경우) 확인
-- SELECT m.id, m.business_name, m.franchise_application_id
-- FROM merchants m
-- WHERE NOT EXISTS (SELECT 1 FROM merchant_equipment me WHERE me.merchant_id = m.id);
-- ────────────────────────────────────────────────────────────
