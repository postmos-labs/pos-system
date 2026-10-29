-- 가맹접수 이메일
--
-- 가맹접수 신규등록·상세에서 대표자 이메일을 받아 둔다. 형식은 화면에서만 가볍게 확인하고 DB는 TEXT로 둔다.
-- src/types/index.ts의 FranchiseApplication.email과 같이 간다.
--
-- 실행 전에도 화면은 열린다. 이메일을 비워 두면 신규등록도 그대로 되고, 이메일을 입력해 저장할 때만 실패한다.

ALTER TABLE franchise_applications ADD COLUMN IF NOT EXISTS email TEXT;

-- 확인
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'franchise_applications' AND column_name = 'email';
