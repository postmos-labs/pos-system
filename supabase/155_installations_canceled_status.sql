-- 설치건 "취소" 상태 추가
--
-- 설치관리·택배발송에서 진행하지 않기로 한 건을 취소로 내리고, 필터로 따로 볼 수 있게 한다.
-- 반려(rejected, 기술지원이 이관을 되돌린 것)와는 다른 상태다. 취소는 이관은 맞았으나 일이 없어진 경우다.
-- 화면 쪽 상태값은 src/app/(app)/installs/installStatus.ts의 STATUS_LABELS와 같이 간다.
--
-- installations.status에는 이 저장소의 마이그레이션이 만든 CHECK 제약이 없다(표가 이 파일들 밖에서 생겼다).
-- 그래서 이 파일은 "제약이 있으면 취소를 넣어 다시 만들고, 없으면 아무것도 하지 않는다".
-- 제약이 없는 운영 DB에서는 실행해도 바뀌는 것이 없고, 실행하지 않아도 화면은 그대로 동작한다.

DO $$
DECLARE
  c_name TEXT;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'installations'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%'
  LIMIT 1;

  IF c_name IS NULL THEN
    RAISE NOTICE 'installations.status에 CHECK 제약이 없어 그대로 둡니다. 코드 쪽만 반영하면 됩니다.';
  ELSE
    EXECUTE format('ALTER TABLE installations DROP CONSTRAINT %I', c_name);
    EXECUTE $q$
      ALTER TABLE installations ADD CONSTRAINT installations_status_check
      CHECK (status IN (
        'received', 'preparing', 'scheduled', 'in_transit',
        'delivery_sent', 'completed', 'rejected', 'canceled'
      ))
    $q$;
    RAISE NOTICE '제약 %를 지우고 canceled를 포함해 다시 만들었습니다.', c_name;
  END IF;
END $$;

-- 확인: 현재 남아 있는 CHECK 제약
SELECT conname, pg_get_constraintdef(oid) AS 정의
FROM pg_constraint
WHERE conrelid = 'installations'::regclass AND contype = 'c';

-- 확인: 상태별 건수 (취소는 화면에서 내린 뒤부터 쌓인다)
SELECT status, count(*) FROM installations GROUP BY status ORDER BY count(*) DESC;
