-- ============================================
-- 091_franchise_receipts_merchant_link.sql 후속 — 레거시 데이터 백필
--
-- 원칙: "명확하게 매핑 가능한 값만" 채운다. 091 도입 시점에 확인한 대로,
-- reception_channel 단독값(예: '랜탈', '전환', '승계')만으로는 새 channel(직접영업/토스리드)이
-- 무엇이었는지 알 수 없는 row가 있어 그 부분은 그대로 NULL로 남긴다.
-- 반대로 값 자체가 명확한 것들(채널 계열 값, 옵션 계열 값, merchants 기존 연결)은 이번에 채운다.
--
-- 이 스크립트는 여러 번 실행돼도 안전하도록 IS NULL 가드를 둔다.
-- ============================================

-- ============================================
-- 1. merchant_id — 기존 merchants.franchise_application_id 역방향 연결
--    (059_merchants_franchise_link_migration.sql에서 만든 관계를 반대로 채워 넣는 것뿐이라 모호함 없음)
-- ============================================

UPDATE franchise_applications fa
SET merchant_id = m.id
FROM merchants m
WHERE m.franchise_application_id = fa.id
  AND fa.merchant_id IS NULL;

-- ============================================
-- 2. case_type — reception_channel 값 자체가 구분을 명시하는 경우만
--    ('랜탈'/'할부'는 구분이 아니라 옵션이라 여기서 안 다룸 — 3번 참고)
-- ============================================

UPDATE franchise_applications
SET case_type = 'conversion'
WHERE case_type IS NULL AND reception_channel = '전환';

UPDATE franchise_applications
SET case_type = 'succession'
WHERE case_type IS NULL AND reception_channel = '승계';

UPDATE franchise_applications
SET case_type = 'name_change'
WHERE case_type IS NULL AND reception_channel = '명변';

-- 채널 계열 값(전환/승계/명변/랜탈/할부가 아닌, 순수 유입 경로를 뜻하는 값)은
-- 소거법으로 신규 건임이 명확하므로 case_type = 'new'로 채운다.
UPDATE franchise_applications
SET case_type = 'new'
WHERE case_type IS NULL
  AND reception_channel IN ('토스 홈페이지', '직접 영업', '토스리드건', '토스프리미엄');

-- ============================================
-- 3. channel — 채널 계열 값만 명확하므로 그것만 채운다
--    ('전환'/'승계'/'명변'/'랜탈'/'할부'는 채널 정보가 없는 값이라 channel은 계속 NULL로 남음)
-- ============================================

UPDATE franchise_applications
SET channel = 'toss_lead'
WHERE channel IS NULL
  AND reception_channel IN ('토스 홈페이지', '토스리드건', '토스프리미엄');

UPDATE franchise_applications
SET channel = 'direct_sales'
WHERE channel IS NULL
  AND reception_channel = '직접 영업';

-- ============================================
-- 4. 옵션 (랜탈/할부) — reception_channel이 그 값 하나뿐이었던 경우
-- ============================================

UPDATE franchise_applications
SET is_rental = TRUE
WHERE is_rental = FALSE AND reception_channel = '랜탈';

UPDATE franchise_applications
SET is_installment = TRUE
WHERE is_installment = FALSE AND reception_channel = '할부';

-- ============================================
-- 5. 남아있는 미확정 건 확인용 (실행 결과 확인만, 데이터 변경 없음)
--    아래 SELECT로 나오는 건수만큼은 case_type/channel이 계속 NULL로 남아있고,
--    이는 reception_channel 값 자체가 모호해서(예: 여러 채널에서 랜탈/할부/전환이 겹쳐 있었을 수 있음)
--    건별 수기 확인이 필요한 건들이다.
-- ============================================

-- SELECT id, business_name, owner_name, reception_channel, created_at
-- FROM franchise_applications
-- WHERE case_type IS NULL AND reception_channel IS NOT NULL
-- ORDER BY created_at DESC;
