-- 자체리드 — 가맹접수 등록 폼과 같은 항목 추가
--
-- 배경: 152로 리드를 원본 대장으로 바꿨지만 등록 폼이 가맹접수보다 훨씬 작았다.
-- "가맹접수와 똑같이" 요청에 따라 가맹접수 등록 폼(FranchiseCreateDialog)의 항목을 리드에도 둔다.
-- 가맹접수로 전환할 때 이 값들이 그대로 등록 폼에 채워진다.
-- 선택지는 src/types/index.ts(APPLICANT_TYPE_LABEL·FranchiseChannel·PROGRAMS·VAN_COMPANIES)와
-- src/app/(app)/leads/lead.ts(LEAD_INTERNET_PROVIDERS·LEAD_EQUIPMENT_CATALOG)를 따른다.
-- 152 다음에 실행한다.

-- 사업자 유형 (가맹접수 applicant_type과 같은 값)
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS applicant_type TEXT NOT NULL DEFAULT 'individual';
ALTER TABLE own_leads DROP CONSTRAINT IF EXISTS own_leads_applicant_type_check;
ALTER TABLE own_leads ADD CONSTRAINT own_leads_applicant_type_check
  CHECK (applicant_type IN ('individual', 'corporate', 'giga_individual', 'giga_corporate'));

-- 사업자번호 (000-00-00000, 하이픈 포함 저장 — 가맹접수와 같음)
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS business_number TEXT;

-- 채널 (가맹접수 channel과 같은 값, 선택 안함이면 NULL)
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE own_leads DROP CONSTRAINT IF EXISTS own_leads_channel_check;
ALTER TABLE own_leads ADD CONSTRAINT own_leads_channel_check
  CHECK (channel IS NULL OR channel IN ('direct_sales', 'toss_lead', 'toss_premium_lead'));

-- 옵션
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS is_rental BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS is_installment BOOLEAN NOT NULL DEFAULT FALSE;

-- 날짜들
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS reception_date DATE;
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS card_apply_date DATE;
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS install_date DATE;
-- 기존 건의 접수날짜는 등록일(KST)로 채운다
-- 재실행할 때는 이 UPDATE는 건너뛴다. 화면에서 일부러 비운 접수날짜가 등록일로 되살아난다.
UPDATE own_leads
SET reception_date = (created_at AT TIME ZONE 'Asia/Seoul')::date
WHERE reception_date IS NULL;

-- 인터넷 업체 · 사용 프로그램 · VAN사 (자유 문자열, 가맹접수와 같음)
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS internet TEXT;
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS program TEXT;
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS van_company TEXT;

-- 상품 [{ name, quantity }]
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS equipment_items JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 주소
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE own_leads ADD COLUMN IF NOT EXISTS address_detail TEXT;

-- 확인용
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'own_leads'
ORDER BY ordinal_position;
