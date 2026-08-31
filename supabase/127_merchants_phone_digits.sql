-- 가맹점을 전화번호로 찾기 위한 정규화 컬럼
--
-- 상호명은 겹친다("마포노가리포차" 3건 등). 번호가 가게를 더 잘 가르는데,
-- "010-1234-5678"과 "01012345678"은 문자열로는 다른 값이라 그대로는 못 찾는다.
-- 숫자만 남긴 값을 DB가 자동으로 유지하게 해서 형식과 무관하게 일치를 판정한다.
--
-- 생성 컬럼(GENERATED ALWAYS ... STORED)이라 기존 행도 즉시 채워지고,
-- phone을 고치면 자동으로 따라간다. 애플리케이션이 관리할 것이 없다.
--
-- "미입력"처럼 숫자가 없는 값은 빈 문자열이 되며, 코드에서 매칭 대상에서 제외한다.

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS phone_digits TEXT
  GENERATED ALWAYS AS (regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')) STORED;

CREATE INDEX IF NOT EXISTS merchants_phone_digits_idx
  ON merchants (phone_digits)
  WHERE phone_digits <> '';

-- 확인용: 번호가 겹치는 가맹점이 몇 건인지 (여기 나오는 번호는 등록 시 사람이 고르게 된다)
SELECT phone_digits, count(*) AS 가맹점수
  FROM merchants
 WHERE phone_digits <> ''
 GROUP BY phone_digits
HAVING count(*) > 1
 ORDER BY count(*) DESC
 LIMIT 20;
