-- ============================================
-- 가맹접수(franchise_applications) ↔ 매장(merchants) 연결 재설계
-- 설계 문서: docs/feature/franchise-receipts/{flow.md, db-schema.md, decisions.md}
--
-- 원칙: additive-only. 기존 컬럼(reception_channel 등)은 rename/reset하지 않고 그대로 둔다.
-- (feat/franchise-receipts 브랜치가 별도로 090을 쓰고 있어, 병합 시점에 번호 재조율 필요 —
--  decisions.md 2026-07-28 "브랜치 확인 + additive-only 확정" 참고)
--
-- 이 스크립트는 공유 dev DB에서 여러 번 실행돼도 안전하도록 IF NOT EXISTS/가드를 넣음.
-- ============================================

-- ============================================
-- 1. franchise_applications 신규 컬럼
-- ============================================

ALTER TABLE franchise_applications
  ADD COLUMN IF NOT EXISTS channel TEXT,              -- direct_sales / toss_lead
  ADD COLUMN IF NOT EXISTS case_type TEXT,             -- new / conversion / succession / name_change
  ADD COLUMN IF NOT EXISTS is_rental BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_installment BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_snapshot JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'franchise_applications' AND constraint_name = 'franchise_applications_channel_check'
  ) THEN
    ALTER TABLE franchise_applications
      ADD CONSTRAINT franchise_applications_channel_check
      CHECK (channel IS NULL OR channel IN ('direct_sales', 'toss_lead'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'franchise_applications' AND constraint_name = 'franchise_applications_case_type_check'
  ) THEN
    ALTER TABLE franchise_applications
      ADD CONSTRAINT franchise_applications_case_type_check
      CHECK (case_type IS NULL OR case_type IN ('new', 'conversion', 'succession', 'name_change'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS franchise_applications_merchant_id_idx ON franchise_applications(merchant_id);

-- ============================================
-- 2. merchants 신규 컬럼
-- ============================================

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS open_date DATE;

-- ============================================
-- 3. 매장 생성/갱신 트리거
--    franchise_applications.status가 card_done/toss_review_done으로 바뀌는 시점에
--    DB가 무조건 처리 (클라이언트 여러 곳에서 각자 호출하다 빠지는 경로가 생기는 문제 방지)
-- ============================================

CREATE OR REPLACE FUNCTION sync_merchant_on_franchise_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_merchant_id UUID;
  v_pos_model TEXT;
BEGIN
  IF NEW.status NOT IN ('card_done', 'toss_review_done') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT string_agg(
    (item->>'name') || ' x' || (item->>'quantity'),
    ', '
  )
  INTO v_pos_model
  FROM jsonb_array_elements(COALESCE(NEW.equipment_items, '[]'::jsonb)) AS item;

  IF NEW.merchant_id IS NULL THEN
    INSERT INTO merchants (
      business_name, owner_name, business_number, phone, address, address_detail,
      pos_model, open_date, memo, sales_id, franchise_application_id
    ) VALUES (
      NEW.business_name, NEW.owner_name, NEW.business_number, NEW.phone, NEW.address,
      NEW.address_detail, v_pos_model, NEW.open_date, NEW.memo, NEW.sales_id, NEW.id
    )
    RETURNING id INTO v_merchant_id;

    UPDATE franchise_applications SET merchant_id = v_merchant_id WHERE id = NEW.id;
  ELSE
    UPDATE merchants SET
      business_name = NEW.business_name,
      owner_name = NEW.owner_name,
      business_number = NEW.business_number,
      phone = NEW.phone,
      address = NEW.address,
      address_detail = NEW.address_detail,
      pos_model = v_pos_model,
      open_date = NEW.open_date,
      memo = NEW.memo,
      updated_at = NOW()
    WHERE id = NEW.merchant_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS franchise_applications_sync_merchant ON franchise_applications;
CREATE TRIGGER franchise_applications_sync_merchant
  AFTER UPDATE OF status ON franchise_applications
  FOR EACH ROW EXECUTE FUNCTION sync_merchant_on_franchise_completion();

-- 이 트리거가 들어가면 클라이언트의 autoRegisterMerchant() 호출은 전부 제거 대상이 됨
-- (src/lib/franchiseStatusEffects.ts, 이번 배치 코드 작업에서 정리)
