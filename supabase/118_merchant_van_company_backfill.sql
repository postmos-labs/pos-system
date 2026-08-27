-- ============================================
-- merchants.van_company 백필
--
-- 목적
--   가맹점 360 목록의 VAN사 필터를 서버에서 걸려면(목록이 페이지 단위로 끊겨 오므로
--   클라이언트 필터로는 "현재 페이지 안"에서만 걸린다) merchants.van_company에 값이 있어야 한다.
--   117에서 컬럼만 만들어 전부 NULL이므로, 연결된 가맹접수의 값을 옮겨 채운다.
--
-- 안전성
--   - van_company IS NULL 인 행만 건드린다. 이미 값이 있는 행은 절대 덮어쓰지 않는다.
--   - 117에서 방금 추가한 컬럼이라 지워질 기존 데이터가 없다.
--   - 연결된 가맹접수가 없거나(franchise_application_id IS NULL) 접수에도 값이 없으면
--     그대로 NULL로 남는다. 화면에서는 "VAN사 전체"에만 나온다.
--   - 몇 번을 다시 실행해도 결과가 같다.
-- ============================================

UPDATE merchants AS m
SET van_company = fa.van_company
FROM franchise_applications AS fa
WHERE m.franchise_application_id = fa.id
  AND m.van_company IS NULL
  AND fa.van_company IS NOT NULL
  AND btrim(fa.van_company) <> '';

-- 실행 후 확인용 — 채워진 건과 남은 건을 함께 본다.
-- SELECT
--   count(*) FILTER (WHERE van_company IS NOT NULL) AS 채워짐,
--   count(*) FILTER (WHERE van_company IS NULL)     AS 비어있음,
--   count(*)                                        AS 전체
-- FROM merchants;
