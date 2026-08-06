-- ============================================
-- 기술지원 이관 시점의 merchants 생성/동기화
-- ============================================
--
-- 091번에서 franchise_applications.status(card_done/toss_review_done) 변경을
-- 기준으로 merchants를 만들던 트리거를 제거하고, 실제 기술지원 이관으로
-- installations 행이 생성/재활성화되는 시점으로 기준을 옮긴다.
--
-- 주의: 이 파일은 SQL 리뷰 및 수동 적용을 위한 파일이다.
-- 이 작업에서는 어떤 Supabase 프로젝트에도 실행하지 않는다.

-- 1. 기존 가맹완료 상태 기반 트리거/함수 제거
DROP TRIGGER IF EXISTS franchise_applications_sync_merchant ON franchise_applications;
DROP FUNCTION IF EXISTS sync_merchant_on_franchise_completion();

-- 2. 기술지원 이관 설치 행 기준 merchants 동기화 함수
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

  -- 신규 이관은 INSERT, rejected 건 재이관은 rejected -> received UPDATE만 처리한다.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM 'rejected'
       OR NEW.status IS DISTINCT FROM 'received' THEN
      RETURN NEW;
    END IF;
  END IF;

  -- installations에는 이관 시점에 필요한 접수 정보가 모두 복사되지 않는다.
  -- 원본 franchise_applications를 다시 읽어 사업자번호/상세주소/영업담당자/
  -- 오픈예정일 등의 최신 값을 merchants에 반영한다. 원본 값이 비어 있는
  -- nullable 컬럼(business_number, address_detail, sales_id, open_date)은 NULL로 남는다.
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

  -- 정상 연결은 merchants.franchise_application_id로 찾고,
  -- 이전 데이터에서 역참조만 남은 경우 franchise_applications.merchant_id를 보조로 사용한다.
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

  -- 양방향 연결을 항상 최신 상태로 유지한다.
  UPDATE franchise_applications
  SET merchant_id = v_merchant_id
  WHERE id = NEW.franchise_application_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS installations_sync_merchant_on_tech_transfer ON installations;
CREATE TRIGGER installations_sync_merchant_on_tech_transfer
  AFTER INSERT OR UPDATE OF status ON installations
  FOR EACH ROW EXECUTE FUNCTION sync_merchant_on_tech_transfer();
