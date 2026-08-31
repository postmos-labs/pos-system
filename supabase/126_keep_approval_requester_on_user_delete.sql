-- 직원 계정을 삭제해도 승인 이력은 남긴다
--
-- delete_user_account(072번)는 profiles를 참조하는 FK를 훑으면서
--   NULL 허용 컬럼 -> 값만 비움 (행은 남음)
--   NOT NULL 컬럼  -> 행 자체를 삭제
-- 로 처리한다. requested_by가 NOT NULL이라 지금은 승인 요청 행이 통째로 사라진다.
--
-- 승인 이력은 "누가 언제 무엇을 올렸고 누가 승인했는지"의 근거 기록이라
-- 계정 존재 여부와 무관하게 남아야 한다. requested_by_name / approved_by_name에
-- 이름이 텍스트로 이미 저장돼 있어 계정이 없어도 화면에서 읽을 수 있다.
--
-- NULL을 허용하면 072가 알아서 "값만 비우기"로 처리하므로 함수는 고치지 않아도 된다.

ALTER TABLE franchise_transfer_approvals
  ALTER COLUMN requested_by DROP NOT NULL;

ALTER TABLE installation_completion_approvals
  ALTER COLUMN requested_by DROP NOT NULL;

-- 확인용: 두 줄 모두 is_nullable = YES 이면 성공
SELECT table_name, column_name, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND column_name = 'requested_by'
   AND table_name IN ('franchise_transfer_approvals', 'installation_completion_approvals')
 ORDER BY table_name;
