-- 가맹점 통합정보 "설치 구성" 초안 자동 시딩.
-- 접수 시점 franchise_applications.equipment_items({name, quantity}[])를 카테고리로 묶어
-- merchant_equipment에 source='application' 행으로 넣는다. 이후 담당자가 설치관리 화면에서
-- 실제 설치 구성으로 수정·확정한다. docs/feature/merchant-unified-view/design.md "3. DB 변경 >
-- 115" 참고.
--
-- 주의: 이 파일은 SQL 리뷰 및 수동 적용을 위한 파일이다. 이 작업에서는 어떤 Supabase
-- 프로젝트에도 실행하지 않는다.
--
-- 적용 전 확인한 사항 (design.md가 명시한 경고 2가지):
-- 1) sync_merchant_on_tech_transfer()는 현재 SECURITY DEFINER가 아니다(101번 정의 기준).
--    다만 이 함수를 트리거하는 installations INSERT/UPDATE는 앱 전체에서 예외 없이
--    createAdminClient()(service_role 키)로만 실행된다(approvals/actions.ts,
--    installs/actions.ts 등). Supabase의 service_role 롤은 BYPASSRLS라 세션 전체가 이미
--    RLS를 우회하므로, SECURITY DEFINER가 아니어도 트리거 내부의 merchant_equipment INSERT가
--    막히지 않는다 — design.md가 우려한 상황이 현재 코드 경로상으로는 재현되지 않는다.
-- 2) 그럼에도 이 사실에만 의존하면 나중에 service_role이 아닌 경로로 installations를 쓰는
--    코드가 추가될 때 조용히 깨질 수 있어, design.md 원안대로 SECURITY DEFINER +
--    created_by를 NULL로 두는 방식을 방어적으로 그대로 적용한다. INSERT 정책도 함께
--    created_by IS NULL을 허용하도록 손본다.

-- 1. 접수 품목명 -> 설치 구성 카테고리 매핑.
--    FranchiseClient.tsx의 EQUIPMENT_CATALOG 13개 품목을 전부 커버한다.
--    main_pos(6): 포스기, 토스프론트, 영수증프린터, 주방프린터기, 무선단말기, 금전함
--    kiosk(2):    키오스크, 키오스크리더기
--    table_order(3): 테이블오더, 태블릿, 보조배터리
--    etc(2 + 그 외): 인터넷, 원격
CREATE OR REPLACE FUNCTION merchant_equipment_category_for_item(p_item_name TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE p_item_name
    WHEN '포스기' THEN 'main_pos'
    WHEN '토스프론트' THEN 'main_pos'
    WHEN '영수증프린터' THEN 'main_pos'
    WHEN '주방프린터기' THEN 'main_pos'
    WHEN '무선단말기' THEN 'main_pos'
    WHEN '금전함' THEN 'main_pos'
    WHEN '키오스크' THEN 'kiosk'
    WHEN '키오스크리더기' THEN 'kiosk'
    WHEN '테이블오더' THEN 'table_order'
    WHEN '태블릿' THEN 'table_order'
    WHEN '보조배터리' THEN 'table_order'
    WHEN '인터넷' THEN 'etc'
    WHEN '원격' THEN 'etc'
    ELSE 'etc' -- 카탈로그에 없는 값(그 외)도 etc로 흡수
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. 카테고리별 "세트 수"의 기준이 되는 대표 품목. 우선순위 순서대로 찾다가 없으면
--    카테고리 내 최대 수량으로 대체한다(design.md 3절).
CREATE OR REPLACE FUNCTION merchant_equipment_category_representative(p_category TEXT)
RETURNS TEXT[] AS $$
BEGIN
  RETURN CASE p_category
    WHEN 'main_pos' THEN ARRAY['포스기']
    WHEN 'kiosk' THEN ARRAY['키오스크']
    WHEN 'table_order' THEN ARRAY['테이블오더', '태블릿']
    ELSE ARRAY[]::TEXT[]
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. 실제 시딩 로직. 115(트리거)와 116(백필)이 공유한다.
--    가드: merchant_id에 source='application' 행이 하나라도 있으면 아무것도 하지 않는다
--    (재이관 시 수기 수정본을 덮어쓰지 않기 위함 — decisions.md).
CREATE OR REPLACE FUNCTION seed_merchant_equipment_from_application(
  p_merchant_id UUID,
  p_equipment_items JSONB
) RETURNS VOID AS $$
DECLARE
  v_category TEXT;
  v_rep_quantity INTEGER;
  v_max_quantity INTEGER;
  v_quantity INTEGER;
  v_components TEXT;
BEGIN
  IF p_merchant_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM merchant_equipment
    WHERE merchant_id = p_merchant_id AND source = 'application'
  ) THEN
    RETURN;
  END IF;

  FOREACH v_category IN ARRAY ARRAY['main_pos', 'kiosk', 'table_order', 'etc'] LOOP
    SELECT string_agg(item->>'name', '+')
    INTO v_components
    FROM jsonb_array_elements(COALESCE(p_equipment_items, '[]'::jsonb)) AS item
    WHERE merchant_equipment_category_for_item(item->>'name') = v_category;

    IF v_components IS NULL THEN
      CONTINUE; -- 해당 카테고리에 속하는 접수 품목이 없음
    END IF;

    SELECT NULLIF(item->>'quantity', '')::INTEGER
    INTO v_rep_quantity
    FROM jsonb_array_elements(COALESCE(p_equipment_items, '[]'::jsonb)) AS item
    WHERE (item->>'name') = ANY(merchant_equipment_category_representative(v_category))
    ORDER BY array_position(
      merchant_equipment_category_representative(v_category),
      item->>'name'
    )
    LIMIT 1;

    SELECT MAX(NULLIF(item->>'quantity', '')::INTEGER)
    INTO v_max_quantity
    FROM jsonb_array_elements(COALESCE(p_equipment_items, '[]'::jsonb)) AS item
    WHERE merchant_equipment_category_for_item(item->>'name') = v_category;

    v_quantity := COALESCE(v_rep_quantity, v_max_quantity, 1);

    INSERT INTO merchant_equipment (
      merchant_id, name, category, quantity, components, source, created_by
    ) VALUES (
      p_merchant_id, v_components, v_category, v_quantity, v_components, 'application', NULL
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. sync_merchant_on_tech_transfer()를 확장해 merchants upsert 직후 시딩을 호출한다.
--    본문은 101번 정의를 그대로 두고 SECURITY DEFINER 추가 + 마지막에 시딩 호출만 더한다.
CREATE OR REPLACE FUNCTION sync_merchant_on_tech_transfer()
RETURNS TRIGGER AS $$
DECLARE
  v_merchant_id UUID;
  v_application_merchant_id UUID;
  v_pos_model TEXT;
  v_business_name TEXT;
  v_owner_name TEXT;
  v_business_number TEXT;
  v_phone TEXT;
  v_address TEXT;
  v_address_detail TEXT;
  v_memo TEXT;
  v_sales_id UUID;
  v_open_date DATE;
  v_equipment_items JSONB;
BEGIN
  IF NEW.franchise_application_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM 'rejected'
       OR NEW.status IS DISTINCT FROM 'received' THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT
    business_name,
    owner_name,
    business_number,
    phone,
    address,
    address_detail,
    memo,
    sales_id,
    open_date,
    equipment_items
  INTO
    v_business_name,
    v_owner_name,
    v_business_number,
    v_phone,
    v_address,
    v_address_detail,
    v_memo,
    v_sales_id,
    v_open_date,
    v_equipment_items
  FROM franchise_applications
  WHERE id = NEW.franchise_application_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT string_agg(
    (item->>'name') || ' x' || (item->>'quantity'),
    ', '
  )
  INTO v_pos_model
  FROM jsonb_array_elements(COALESCE(v_equipment_items, '[]'::jsonb)) AS item;

  SELECT id
  INTO v_merchant_id
  FROM merchants
  WHERE franchise_application_id = NEW.franchise_application_id
  LIMIT 1;

  IF v_merchant_id IS NULL THEN
    SELECT merchant_id
    INTO v_application_merchant_id
    FROM franchise_applications
    WHERE id = NEW.franchise_application_id;

    IF v_application_merchant_id IS NOT NULL THEN
      SELECT id
      INTO v_merchant_id
      FROM merchants
      WHERE id = v_application_merchant_id;
    END IF;
  END IF;

  IF v_merchant_id IS NULL THEN
    INSERT INTO merchants (
      business_name,
      owner_name,
      business_number,
      phone,
      address,
      address_detail,
      pos_model,
      open_date,
      memo,
      sales_id,
      franchise_application_id
    ) VALUES (
      COALESCE(v_business_name, '미입력'),
      COALESCE(v_owner_name, '미입력'),
      v_business_number,
      COALESCE(v_phone, '미입력'),
      COALESCE(v_address, '미입력'),
      v_address_detail,
      v_pos_model,
      v_open_date,
      v_memo,
      v_sales_id,
      NEW.franchise_application_id
    )
    RETURNING id INTO v_merchant_id;
  ELSE
    UPDATE merchants
    SET
      business_name = COALESCE(v_business_name, '미입력'),
      owner_name = COALESCE(v_owner_name, '미입력'),
      business_number = v_business_number,
      phone = COALESCE(v_phone, '미입력'),
      address = COALESCE(v_address, '미입력'),
      address_detail = v_address_detail,
      pos_model = v_pos_model,
      open_date = v_open_date,
      memo = v_memo,
      sales_id = v_sales_id,
      franchise_application_id = NEW.franchise_application_id,
      updated_at = NOW()
    WHERE id = v_merchant_id;
  END IF;

  UPDATE franchise_applications
  SET merchant_id = v_merchant_id
  WHERE id = NEW.franchise_application_id;

  PERFORM seed_merchant_equipment_from_application(v_merchant_id, v_equipment_items);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 트리거 자체는 101번과 동일 (함수만 교체되므로 재생성 불필요하지만 안전하게 재선언).
DROP TRIGGER IF EXISTS installations_sync_merchant_on_tech_transfer ON installations;
CREATE TRIGGER installations_sync_merchant_on_tech_transfer
  AFTER INSERT OR UPDATE OF status ON installations
  FOR EACH ROW EXECUTE FUNCTION sync_merchant_on_tech_transfer();

-- 5. INSERT 정책이 created_by = auth.uid()만 허용해 시딩 행(created_by NULL)이 막히지 않도록
--    NULL도 허용한다. 방어적 조치 — 현재 코드 경로에서는 service_role이 이미 RLS를 우회하므로
--    실질적으로 트리거 동작에는 영향이 없지만, 위 1)의 가정이 깨지는 미래 변경에 대비한다.
DROP POLICY IF EXISTS "authenticated insert merchant equipment" ON merchant_equipment;
CREATE POLICY "authenticated insert merchant equipment"
  ON merchant_equipment
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid() OR created_by IS NULL);
