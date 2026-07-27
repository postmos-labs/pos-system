-- 090_franchise_receipts_restructure.sql 롤백용 (dev 전용, 번호 없는 파일)
-- 090이 문제가 있어서 되돌려야 할 때만 실행. live 마이그레이션 순서에는 포함되지 않음.
-- 090을 다시 적용하기 전에 이 스크립트로 완전히 원상복구되는지 먼저 확인할 것.

-- 3. franchise_application_memos 제거
DROP TRIGGER IF EXISTS franchise_application_memos_updated_at ON franchise_application_memos;
DROP TABLE IF EXISTS franchise_application_memos;

-- 2-5. 뷰 제거
DROP VIEW IF EXISTS franchise_applications_active;

-- 2-4. updated_by 트리거/함수 제거
DROP TRIGGER IF EXISTS franchise_applications_set_updated_by ON franchise_applications;
DROP FUNCTION IF EXISTS set_franchise_application_updated_by();

-- 2-3. 제약 제거
ALTER TABLE franchise_applications DROP CONSTRAINT IF EXISTS case_type_requires_origin;

-- 2-2. 신규 컬럼 제거
ALTER TABLE franchise_applications DROP COLUMN IF EXISTS reception_date;
ALTER TABLE franchise_applications DROP COLUMN IF EXISTS reception_channel_code;
ALTER TABLE franchise_applications DROP COLUMN IF EXISTS case_type_code;
ALTER TABLE franchise_applications DROP COLUMN IF EXISTS option_code;
ALTER TABLE franchise_applications DROP COLUMN IF EXISTS original_application_id;
ALTER TABLE franchise_applications DROP COLUMN IF EXISTS van_company_codes;
ALTER TABLE franchise_applications DROP COLUMN IF EXISTS updated_by;
ALTER TABLE franchise_applications DROP COLUMN IF EXISTS deleted_at;

-- 2-1. legacy 이름 원복
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'franchise_applications' AND column_name = 'reception_date_legacy') THEN
    ALTER TABLE franchise_applications RENAME COLUMN reception_date_legacy TO reception_date;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'franchise_applications' AND column_name = 'reception_channel_legacy') THEN
    ALTER TABLE franchise_applications RENAME COLUMN reception_channel_legacy TO reception_channel;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'franchise_applications' AND column_name = 'van_company_legacy') THEN
    ALTER TABLE franchise_applications RENAME COLUMN van_company_legacy TO van_company;
  END IF;
END $$;

-- 1. codes 테이블 제거
-- 주의: 이 시점에 franchise 외 다른 도메인이 이미 codes를 같이 쓰기 시작했다면 이 줄은 건너뛸 것
DROP TABLE IF EXISTS codes;
