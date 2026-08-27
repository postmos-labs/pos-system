-- ============================================
-- 고객관리대장 CRM CSV → 가맹접수 이관 · 1단계 (가맹접수만)
--
-- 전제: _import_crm 임시 테이블에 crm_staging.csv가 올라가 있어야 한다.
-- 이 파일은 franchise_applications에만 INSERT 한다.
--   설치관리(installations)와 가맹점(merchants)은 2단계에서 별도로 넣는다.
--
-- 되돌리기: 맨 아래 롤백 블록 참고. import_batch 도장 하나로 전부 지운다.
--
-- 실행 순서: [1] → [2] → [3](눈으로 확인) → [4]
-- [3]에서 값이 이상하면 [4]를 실행하지 말 것. 여기까지는 진짜 테이블을 건드리지 않는다.
-- ============================================

-- ────────────────────────────────────────────
-- [1] 도장 칸 만들기 (되돌리기용)
-- ────────────────────────────────────────────
ALTER TABLE franchise_applications
  ADD COLUMN IF NOT EXISTS import_batch TEXT;

CREATE INDEX IF NOT EXISTS franchise_applications_import_batch_idx
  ON franchise_applications (import_batch);

-- ────────────────────────────────────────────
-- [2] 임시 테이블에 정리된 값 채우기
--     진짜 테이블은 아직 안 건드린다. 여기서 계산만 해둔다.
-- ────────────────────────────────────────────
ALTER TABLE _import_crm
  ADD COLUMN IF NOT EXISTS van_norm      TEXT,
  ADD COLUMN IF NOT EXISTS status_target TEXT,
  ADD COLUMN IF NOT EXISTS make_install  BOOLEAN,
  ADD COLUMN IF NOT EXISTS created_ts    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS memo_final    TEXT,
  ADD COLUMN IF NOT EXISTS dedup_key     TEXT,
  ADD COLUMN IF NOT EXISTS keep_flag     BOOLEAN;

-- 2-1. VAN사 정규화
--   · 코밴 → 코벤
--   · 여러 개 적힌 건 쉼표로 (앱이 원래 "코세스2,코벤" 형태를 지원한다)
--   · '코세스2 12/1'처럼 날짜가 붙은 것도 LIKE로 걸러진다
--   · 섹타나인/나이스/플릭 등 모르는 VAN사는 NULL로 남고 원본은 메모에 들어간다
UPDATE _import_crm SET van_norm = (
  SELECT string_agg(k.x, ',' ORDER BY k.ord)
  FROM (VALUES
    ('코세스2', 1), ('코세스1', 2), ('코벤', 3), ('기가맹', 4), ('KICC', 5)
  ) AS k(x, ord)
  WHERE replace(replace(coalesce(_import_crm.van, ''), ' ', ''), '코밴', '코벤')
        LIKE '%' || k.x || '%'
);

-- 2-2. 숫자 없는 '코세스'는 코세스1로 (사용자 확정)
UPDATE _import_crm
SET van_norm = coalesce(nullif(van_norm, '') || ',', '') || '코세스1'
WHERE replace(replace(coalesce(van, ''), ' ', ''), '코밴', '코벤') LIKE '%코세스%'
  AND replace(replace(coalesce(van, ''), ' ', ''), '코밴', '코벤') NOT LIKE '%코세스1%'
  AND replace(replace(coalesce(van, ''), ' ', ''), '코밴', '코벤') NOT LIKE '%코세스2%';

-- 2-3. 상태 — 접수취소만 취소, 나머지는 전부 완료 (사용자 확정)
UPDATE _import_crm
SET status_target = CASE WHEN btrim(coalesce(progress, '')) = '접수취소'
                         THEN 'canceled' ELSE 'completed' END,
    make_install  = (btrim(coalesce(progress, '')) = '설치완료');

-- 2-4. 접수날짜 '24. 1. 26' → 2024-01-26
--
--   1,888건 중 738건(39%)은 접수날짜가 비어 있다. 전부 같은 날로 몰면 목록과 통계가
--   그 날짜에 뭉쳐서 이상해진다. 대신 "바로 윗행의 날짜"를 물려받는다 —
--   이 파일은 접수 순서대로 정렬돼 있어(채워진 값의 99%가 오름차순) 실제 시기에 가깝다.
--   물려받은 행은 date_estimated = TRUE로 표시하고 메모에도 남긴다.
ALTER TABLE _import_crm ADD COLUMN IF NOT EXISTS date_estimated BOOLEAN;

WITH base AS (
  SELECT row_no,
         row_no::int AS rn,
         CASE WHEN m[1] IS NOT NULL
              THEN make_timestamptz(2000 + m[1]::int, m[2]::int, m[3]::int, 9, 0, 0, 'Asia/Seoul')
         END AS ts
  FROM (
    SELECT row_no,
           regexp_match(coalesce(reception_date, ''), '(\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})') AS m
    FROM _import_crm
  ) x
),
grp AS (
  -- count()는 NULL을 세지 않으므로, 값이 나올 때마다 그룹 번호가 하나씩 올라간다.
  -- 같은 그룹 = "직전에 채워진 값 하나 + 그 뒤의 빈 값들"
  SELECT row_no, rn, ts, count(ts) OVER (ORDER BY rn) AS g FROM base
),
filled AS (
  SELECT row_no, rn, ts,
         first_value(ts) OVER (PARTITION BY g ORDER BY rn) AS ts_carried
  FROM grp
)
UPDATE _import_crm c
SET created_ts = coalesce(
      f.ts_carried,
      -- 첫 채워진 값보다 앞에 있는 행(이 파일엔 0건)은 파일 전체의 가장 이른 날짜로
      (SELECT min(ts) FROM base WHERE ts IS NOT NULL)
    ),
    date_estimated = (f.ts IS NULL)
FROM filled f
WHERE c.row_no = f.row_no;

-- 2-5. 메모 — 우리 칸에 못 담는 원본을 전부 모아둔다.
--      담당자 이름, 원본 진행상황, 원본 VAN, 인터넷 상품, 자유텍스트 날짜들.
UPDATE _import_crm
SET memo_final = nullif(concat_ws(E'\n',
  nullif(btrim(coalesce(memo1, '')), ''),
  nullif(btrim(coalesce(memo2, '')), ''),
  CASE WHEN btrim(coalesce(manager, '')) <> ''       THEN '[원본] 담당자: '     || btrim(manager) END,
  CASE WHEN btrim(coalesce(reception_date, '')) <> '' THEN '[원본] 접수날짜: '  || btrim(reception_date) END,
  CASE WHEN date_estimated THEN '[추정] 접수날짜 — 원본이 비어 있어 윗행 날짜를 물려받음' END,
  CASE WHEN btrim(coalesce(progress, '')) <> ''      THEN '[원본] 진행상황: '   || btrim(progress) END,
  CASE WHEN btrim(coalesce(van, '')) <> ''           THEN '[원본] VAN: '        || btrim(van) END,
  CASE WHEN btrim(coalesce(product, '')) <> ''       THEN '[원본] 상품: '       || btrim(product) END,
  CASE WHEN btrim(coalesce(internet_open, '')) <> '' THEN '[원본] 인터넷개통: ' || btrim(internet_open) END,
  CASE WHEN btrim(coalesce(card_apply, '')) <> ''    THEN '[원본] 카드접수일: ' || btrim(card_apply) END,
  CASE WHEN btrim(coalesce(install_wish, '')) <> ''  THEN '[원본] 설치희망: '   || btrim(install_wish) END,
  CASE WHEN btrim(coalesce(open_expected, '')) <> '' THEN '[원본] 오픈예정: '   || btrim(open_expected) END,
  CASE WHEN btrim(coalesce(pos_expected, '')) <> ''  THEN '[원본] 포스기예정: ' || btrim(pos_expected) END,
  CASE WHEN btrim(coalesce(easy_pay, '')) <> ''      THEN '[원본] 간편결제: '   || btrim(easy_pay) END,
  CASE WHEN btrim(coalesce(category, '')) <> ''      THEN '[원본] 분류: '       || btrim(category) END,
  CASE WHEN btrim(coalesce(baemin, '')) <> ''        THEN '[원본] 배민: '       || btrim(baemin) END,
  CASE WHEN btrim(coalesce(pos_program, '')) <> ''   THEN '[원본] 포스프로그램: ' || btrim(pos_program) END
), '');

-- 2-6. 파일 안 중복 제거 — 사업자번호 우선, 없으면 연락처, 둘 다 없으면 행 번호
UPDATE _import_crm
SET dedup_key = CASE
  WHEN coalesce(biz_digits, '')   <> '' THEN 'B:' || biz_digits
  WHEN coalesce(phone_digits, '') <> '' THEN 'P:' || phone_digits
  ELSE 'R:' || row_no
END;

UPDATE _import_crm SET keep_flag = FALSE;

UPDATE _import_crm c
SET keep_flag = TRUE
FROM (
  SELECT DISTINCT ON (dedup_key) row_no
  FROM _import_crm
  WHERE btrim(coalesce(business_name, '')) <> ''
    AND btrim(coalesce(owner_name, ''))    <> ''
    AND btrim(coalesce(phone, ''))         <> ''
  ORDER BY dedup_key, row_no::int          -- 같은 가게가 여러 줄이면 첫 줄만 남긴다
) s
WHERE c.row_no = s.row_no;

-- ────────────────────────────────────────────
-- [3] 넣기 전에 눈으로 확인 — 여기까지는 진짜 테이블을 안 건드렸다
-- ────────────────────────────────────────────

-- 3-1. 몇 건이 들어갈지
SELECT
  count(*)                                                   AS "전체 줄",
  count(*) FILTER (WHERE keep_flag)                          AS "넣을 대상",
  count(*) FILTER (WHERE keep_flag AND status_target = 'completed') AS "완료로",
  count(*) FILTER (WHERE keep_flag AND status_target = 'canceled')  AS "취소로",
  count(*) FILTER (WHERE keep_flag AND make_install)          AS "2단계 설치 대상",
  count(*) FILTER (WHERE keep_flag AND van_norm IS NOT NULL)  AS "VAN사 붙음",
  count(*) FILTER (WHERE keep_flag AND date_estimated)        AS "날짜 물려받음(추정)",
  min(created_ts) FILTER (WHERE keep_flag)::date              AS "가장 이른 접수일",
  max(created_ts) FILTER (WHERE keep_flag)::date              AS "가장 늦은 접수일"
FROM _import_crm;

-- 3-1b. 물려받은 날짜가 제대로 퍼졌는지 — 연-월별로 몇 건씩인지 본다.
--       한 날짜에 뭉쳐 있으면 물려받기가 안 된 것이다.
SELECT to_char(created_ts AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS "연-월",
       count(*)                                    AS "건수",
       count(*) FILTER (WHERE date_estimated)      AS "그중 추정"
FROM _import_crm
WHERE keep_flag
GROUP BY 1
ORDER BY 1;

-- 3-2. VAN 정규화가 제대로 됐는지 원본과 나란히
SELECT van AS "원본", van_norm AS "정리됨", count(*) AS "건수"
FROM _import_crm
WHERE keep_flag AND coalesce(van, '') <> ''
GROUP BY van, van_norm
ORDER BY count(*) DESC
LIMIT 40;

-- 3-3. 실제로 들어갈 값 10줄 미리보기
SELECT business_name AS "상호명", owner_name AS "대표자", phone AS "연락처",
       van_norm AS "VAN", status_target AS "상태",
       created_ts::date AS "접수일", left(memo_final, 60) AS "메모(앞부분)"
FROM _import_crm
WHERE keep_flag
ORDER BY row_no::int
LIMIT 10;

-- ────────────────────────────────────────────
-- [4] 진짜 넣기 — 위 [3] 결과가 멀쩡할 때만 실행
--     이미 DB에 있는 건(사업자번호 또는 연락처 일치)은 자동으로 빠진다.
-- ────────────────────────────────────────────

-- 4-0. 두 번 실행 방지.
--   아래 INSERT는 사업자번호/연락처로 중복을 거르지만, 둘 다 없는 몇 건은 못 거른다.
--   실수로 두 번 돌리면 그만큼 중복이 생기므로 아예 막는다.
--   다시 넣어야 하면 롤백(맨 아래)을 먼저 실행할 것.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM franchise_applications WHERE import_batch = 'crm-2026-08') THEN
    RAISE EXCEPTION '이미 crm-2026-08 배치가 들어가 있습니다. 다시 넣으려면 먼저 롤백하세요.';
  END IF;
END $$;

INSERT INTO franchise_applications (
  business_name, owner_name, phone, business_number, address,
  van_company, status, reception_date, memo, import_batch, created_at, updated_at
)
SELECT
  btrim(c.business_name),
  btrim(c.owner_name),
  btrim(c.phone),
  nullif(btrim(coalesce(c.business_number, '')), ''),
  nullif(btrim(coalesce(c.address, '')), ''),
  c.van_norm,
  c.status_target,
  -- reception_date는 TEXT지만 앱이 'YYYY-MM-DD'로 쓴다(날짜 필터가 이 형식을 비교한다).
  -- 원본 '24. 1. 26'을 그대로 넣으면 표시도 필터도 깨지므로 변환해서 넣는다.
  -- 원본 문자열은 메모의 [원본] 항목으로 남는다.
  to_char(c.created_ts AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD'),
  c.memo_final,
  'crm-2026-08',
  c.created_ts,
  c.created_ts
FROM _import_crm c
WHERE c.keep_flag
  -- 이미 있는 가맹접수와 사업자번호가 같으면 제외
  AND NOT EXISTS (
    SELECT 1 FROM franchise_applications f
    WHERE coalesce(c.biz_digits, '') <> ''
      AND regexp_replace(coalesce(f.business_number, ''), '\D', '', 'g') = c.biz_digits
  )
  -- 사업자번호가 없으면 연락처로 한 번 더 확인
  AND NOT EXISTS (
    SELECT 1 FROM franchise_applications f
    WHERE coalesce(c.biz_digits, '') = ''
      AND coalesce(c.phone_digits, '') <> ''
      AND regexp_replace(coalesce(f.phone, ''), '\D', '', 'g') = c.phone_digits
  );

-- 넣은 결과 확인
SELECT count(*) AS "이번에 들어간 건수"
FROM franchise_applications
WHERE import_batch = 'crm-2026-08';

-- ────────────────────────────────────────────
-- [롤백] 잘못됐을 때 — 1단계만 넣은 상태라면 이 한 줄이면 된다
-- ────────────────────────────────────────────
-- DELETE FROM franchise_applications WHERE import_batch = 'crm-2026-08';
--
-- 2단계(설치관리)까지 넣은 뒤라면 반드시 아래 순서를 지킬 것.
-- 가맹점을 먼저 지워야 한다. 가맹접수를 먼저 지우면 연결이 끊겨(SET NULL)
-- 어느 가맹점이 이번 것인지 찾을 수 없게 된다.
--
-- DELETE FROM merchants
--  WHERE franchise_application_id IN (
--    SELECT id FROM franchise_applications WHERE import_batch = 'crm-2026-08');
-- DELETE FROM installations
--  WHERE franchise_application_id IN (
--    SELECT id FROM franchise_applications WHERE import_batch = 'crm-2026-08');
-- DELETE FROM franchise_applications WHERE import_batch = 'crm-2026-08';
