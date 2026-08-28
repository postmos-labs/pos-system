-- 가맹점 삭제가 막히던 문제 해결
--
-- change_requests.merchant_id 와 installation_post_history.merchant_id 는
-- 둘 다 "선택 연결"로 설계됐는데(052 파일 주석 참고) ON DELETE 규칙을 붙이지 않았다.
-- 규칙이 없으면 Postgres 기본값 NO ACTION 이 적용돼, 이 두 표에 기록이 하나라도 있는
-- 가맹점은 삭제가 거부된다. 나머지 7개 참조 표는 CASCADE / SET NULL 로 이미 처리돼 있다.
--
-- 변경관리 건과 설치 후 메모는 그 자체로 업무 이력이므로 함께 지우지 않는다.
-- 가맹점 연결만 끊는다(SET NULL).
--
-- 제약 이름을 직접 쓰지 않고 컬럼에 실제로 걸려 있는 FK 를 찾아 지운다.
-- 이름이 기본값(<표>_<컬럼>_fkey)과 다르더라도 안전하게 처리되고,
-- 표가 아직 없는 환경에서는 그냥 건너뛴다.

DO $$
DECLARE
  t TEXT;
  c TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['change_requests', 'installation_post_history']
  LOOP
    IF to_regclass(t) IS NULL THEN
      RAISE NOTICE '표 %가 없어 건너뜁니다.', t;
      CONTINUE;
    END IF;

    FOR c IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      JOIN pg_attribute att
        ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
      WHERE con.contype = 'f'
        AND ns.nspname = 'public'
        AND rel.relname = t
        AND att.attname = 'merchant_id'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, c);
      RAISE NOTICE '% 의 기존 제약 % 를 제거했습니다.', t, c;
    END LOOP;

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (merchant_id)
         REFERENCES public.merchants(id) ON DELETE SET NULL',
      t, t || '_merchant_id_fkey'
    );
    RAISE NOTICE '% 에 ON DELETE SET NULL 을 적용했습니다.', t;
  END LOOP;
END $$;

-- 확인용: 두 줄 모두 delete_rule 이 SET NULL 로 나와야 한다.
SELECT
  tc.table_name,
  tc.constraint_name,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name
 AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('change_requests', 'installation_post_history')
  AND tc.constraint_name LIKE '%merchant_id%'
ORDER BY tc.table_name;
