-- 직원 직급 추가
--
-- 지금 권한은 role(메뉴 접근) / team(소속) / approval_role(결재)로 나뉘어 있는데,
-- 조직상의 직급을 담을 곳이 없었다. 직급을 별도 축으로 추가한다.
--
-- 승인 권한(approval_role)은 직급과 무관하게 개인에게 그대로 부여한다.
-- 팀장이어도 승인권이 없을 수 있고, 팀원에게 줄 수도 있다.
--
-- 이번 단계에서는 "표시와 정렬"에만 쓴다. 권한 판정은 기존 role/can_delete 그대로 두어
-- 동작이 바뀌지 않게 한다. 나중에 직급으로 권한을 나눌 때를 위해 등급 숫자를 함께 둔다.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS position TEXT;

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_position_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_position_check
  CHECK (position IS NULL OR position IN ('대표', '상무', '실장', '팀장', '팀원'));

-- 직급 등급. 숫자가 클수록 상위. 목록 정렬과 "○○급 이상" 판정에 쓴다.
-- 미지정(NULL)은 0으로 취급한다.
CREATE OR REPLACE FUNCTION position_rank(p TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p
    WHEN '대표' THEN 100
    WHEN '상무' THEN 80
    WHEN '실장' THEN 60
    WHEN '팀장' THEN 40
    WHEN '팀원' THEN 10
    ELSE 0
  END;
$$;

-- 확인용: 컬럼이 보이고 등급 함수가 동작하면 성공
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'position';

SELECT position_rank('대표') AS 대표, position_rank('팀장') AS 팀장, position_rank(NULL) AS 미지정;
