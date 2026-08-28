-- 인입경로에 '토스 프리미엄 리드'(toss_premium_lead) 추가
--
-- 화면 드롭다운은 src/types/index.ts의 FRANCHISE_CHANNEL_LABEL에서 파생되고,
-- DB는 franchise_applications_channel_check 제약이 허용값을 제한한다.
-- 둘이 어긋나면 새 값 선택 시 저장이 실패하므로 제약을 함께 넓힌다.

ALTER TABLE franchise_applications
  DROP CONSTRAINT IF EXISTS franchise_applications_channel_check;

ALTER TABLE franchise_applications
  ADD CONSTRAINT franchise_applications_channel_check
  CHECK (channel IS NULL OR channel IN ('direct_sales', 'toss_lead', 'toss_premium_lead'));

-- 확인용: 아래에 'toss_premium_lead'가 포함돼 있으면 성공
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'franchise_applications_channel_check';
