-- ============================================
-- 고객관리대장 CRM 이관 · 2단계 (설치관리 + 가맹점 자동생성)
--
-- 전제: 119번(1단계)이 끝나 franchise_applications에 import_batch='crm-2026-08' 1,872건이 있어야 한다.
--
-- 이 파일은 installations에만 INSERT 한다. merchants와 merchant_equipment는
-- installations_sync_merchant_on_tech_transfer 트리거가 알아서 만든다
-- (트리거의 status 조건은 UPDATE일 때만 걸리므로, INSERT는 상태와 무관하게 동작한다).
--
-- 실행 순서: [1](확인) → [2](진짜 넣기) → [3](결과 확인)
-- ============================================

-- ────────────────────────────────────────────
-- [1] 넣기 전 확인 — 아직 아무것도 안 넣는다
-- ────────────────────────────────────────────

-- 1-1. 설치 대상이 1단계 결과와 제대로 짝지어지는지.
--      "대상"과 "짝지어짐"이 같아야 한다. 짝이 여러 개면 매칭이 잘못된 것이다.
WITH src AS (
  SELECT c.row_no, f.id AS app_id
  FROM _import_crm c
  JOIN franchise_applications f
    ON f.import_batch = 'crm-2026-08'
   AND (
        (coalesce(c.biz_digits, '') <> ''
         AND regexp_replace(coalesce(f.business_number, ''), '\D', '', 'g') = c.biz_digits)
     OR (coalesce(c.biz_digits, '') = ''
         AND coalesce(c.phone_digits, '') <> ''
         AND regexp_replace(coalesce(f.phone, ''), '\D', '', 'g') = c.phone_digits)
   )
  WHERE c.keep_flag AND c.make_install
)
SELECT
  (SELECT count(*) FROM _import_crm WHERE keep_flag AND make_install) AS "설치 대상",
  (SELECT count(DISTINCT row_no) FROM src)                            AS "짝지어진 줄",
  (SELECT count(*) FROM src)                                          AS "짝 개수(같아야 정상)",
  (SELECT count(DISTINCT app_id) FROM src)                            AS "연결된 가맹접수";

-- ────────────────────────────────────────────
-- [2] 진짜 넣기 — 위 [1]에서 "짝지어진 줄"과 "짝 개수"가 같을 때만 실행
--     이 INSERT는 트리거를 통해 가맹점 약 1,386개를 만든다.
-- ────────────────────────────────────────────

-- 2-0. 두 번 실행 방지
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM installations i
    JOIN franchise_applications f ON f.id = i.franchise_application_id
    WHERE f.import_batch = 'crm-2026-08'
  ) THEN
    RAISE EXCEPTION '이미 2단계가 실행됐습니다. 다시 넣으려면 먼저 롤백하세요.';
  END IF;
END $$;

INSERT INTO installations (
  customer_name, customer_phone, address, status, delivery_type,
  franchise_application_id, notes, created_at, updated_at
)
SELECT
  f.business_name,                    -- NOT NULL
  f.phone,
  f.address,
  'completed',
  'install',
  f.id,
  '[이관] 고객관리대장 CRM — 과거 설치완료 건',
  f.created_at,                       -- 1단계에서 정한 접수날짜. 오늘 날짜로 넣으면
  f.created_at                        -- 설치관리 목록(최근 300건)이 과거 데이터로 덮인다.
FROM _import_crm c
JOIN franchise_applications f
  ON f.import_batch = 'crm-2026-08'
 AND (
      (coalesce(c.biz_digits, '') <> ''
       AND regexp_replace(coalesce(f.business_number, ''), '\D', '', 'g') = c.biz_digits)
   OR (coalesce(c.biz_digits, '') = ''
       AND coalesce(c.phone_digits, '') <> ''
       AND regexp_replace(coalesce(f.phone, ''), '\D', '', 'g') = c.phone_digits)
 )
WHERE c.keep_flag AND c.make_install;

-- ────────────────────────────────────────────
-- [3] 결과 확인
-- ────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM installations i
     JOIN franchise_applications f ON f.id = i.franchise_application_id
    WHERE f.import_batch = 'crm-2026-08')                      AS "설치건 생성",
  (SELECT count(*) FROM merchants m
     JOIN franchise_applications f ON f.id = m.franchise_application_id
    WHERE f.import_batch = 'crm-2026-08')                      AS "가맹점 자동생성",
  (SELECT count(*) FROM merchants)                             AS "가맹점 전체",
  (SELECT count(*) FROM merchant_equipment me
     JOIN merchants m ON m.id = me.merchant_id
     JOIN franchise_applications f ON f.id = m.franchise_application_id
    WHERE f.import_batch = 'crm-2026-08')                      AS "장비 자동생성";

-- 설치관리 목록이 과거 데이터로 덮이지 않았는지 — 최근 20건에 이관 건이 섞였나
SELECT to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS "연-월", count(*) AS "건수"
FROM installations
GROUP BY 1 ORDER BY 1 DESC LIMIT 12;

-- ────────────────────────────────────────────
-- [롤백] 반드시 이 순서로. 가맹점을 먼저 지워야 한다 —
--        가맹접수를 먼저 지우면 연결이 끊겨(SET NULL) 어느 가맹점이 이번 것인지 못 찾는다.
-- ────────────────────────────────────────────
-- DELETE FROM merchants
--  WHERE franchise_application_id IN (
--    SELECT id FROM franchise_applications WHERE import_batch = 'crm-2026-08');
-- DELETE FROM installations
--  WHERE franchise_application_id IN (
--    SELECT id FROM franchise_applications WHERE import_batch = 'crm-2026-08');
-- -- 1단계까지 되돌리려면 아래도 실행
-- DELETE FROM franchise_applications WHERE import_batch = 'crm-2026-08';
