-- 설치건 인입경로 (가맹접수와 연결되지 않은 설치건용)
--
-- 설치관리·택배발송의 "인입경로" 열은 원래 연결된 가맹접수의 channel을 보여 준다.
-- 가맹접수에서 넘어온 건은 드롭다운으로 고르면 가맹접수의 channel에 저장한다(승인함·대시보드도 같이 맞춰진다).
-- 직접 만든 설치건(AS, 우국상 이관 등)은 가맹접수가 없어 저장할 곳이 없으므로 이 칸을 쓴다.
-- 허용값은 franchise_applications_channel_check(122)와 같다. src/types/index.ts의 FranchiseChannel과 같이 간다.
--
-- 실행 전에도 화면은 열린다. 가맹접수와 연결된 건은 지정이 되고, 직접 만든 설치건만 저장이 실패한다.

ALTER TABLE installations ADD COLUMN IF NOT EXISTS channel TEXT;

ALTER TABLE installations DROP CONSTRAINT IF EXISTS installations_channel_check;
ALTER TABLE installations ADD CONSTRAINT installations_channel_check
  CHECK (channel IS NULL OR channel IN ('direct_sales', 'toss_lead', 'toss_premium_lead'));

-- 확인
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'installations' AND column_name = 'channel';
