-- 자체리드 → 가맹접수(직접 영업) 일괄 이관 (데이터 이동, 스키마 변경 없음)
--
-- 배경: 자체리드 메뉴가 가맹접수의 채널 "직접 영업"과 겹쳐 메뉴를 내린다(2026-09-17).
-- 진행 중인 리드는 몇 건 안 되므로 SQL로 가맹접수에 옮기고, 앞으로는 가맹접수에 채널 "직접 영업"으로
-- 바로 등록한 뒤 비고에 "대표님 리드건"·"상무님 리드건"처럼 출처를 적는다.
--
-- 옮기는 대상: 아직 가맹접수로 이관되지 않았고(converted_franchise_id IS NULL) 완료도 안 된(closed_at IS NULL) 리드.
-- 이미 이관된 건은 가맹접수에 원본이 있으니 건드리지 않는다. 완료된 건(상담 종료·접수아님)은 접수 대상이 아니라 옮기지 않는다.
-- own_leads·own_lead_logs 표는 이력으로 남긴다(삭제하지 않음).

-- ─────────────────────────────────────────────────────────────
-- 1단계. 옮길 대상 확인 (실행만 하고 결과를 본다)
--   같은 전화번호의 가맹접수 건이 이미 있으면 dup_franchise에 상호가 나온다. 그 건은 2단계에서 자동으로 건너뛴다.
-- ─────────────────────────────────────────────────────────────
SELECT
  'L-' || lpad(l.lead_no::text, 4, '0') AS 원본번호,
  l.business_name AS 상호,
  l.owner_name    AS 대표자,
  l.phone         AS 연락처,
  l.source        AS 유입경로,
  l.lead_type     AS 리드구분,
  l.assignee_name AS 담당자,
  l.decision      AS 접수판단,
  (l.created_at AT TIME ZONE 'Asia/Seoul')::date AS 등록일,
  (
    SELECT string_agg(f.business_name, ', ')
    FROM franchise_applications f
    WHERE l.phone IS NOT NULL
      AND regexp_replace(f.phone, '\D', '', 'g') = regexp_replace(l.phone, '\D', '', 'g')
  ) AS dup_franchise
FROM own_leads l
WHERE l.closed_at IS NULL
  AND l.converted_franchise_id IS NULL
ORDER BY l.created_at;

-- ─────────────────────────────────────────────────────────────
-- 2단계. 가맹접수로 옮기기 (1단계 결과를 확인한 뒤 실행)
--   - 상태는 서류대기, 채널·접수채널은 직접 영업, 구분은 신규
--   - 비고 맨 앞에 출처 한 줄을 스탬프 형식([작성자 YYYY. MM. DD. HH:mm])으로 붙여 메모 이력에서 제대로 나뉘게 한다
--   - 같은 전화번호의 가맹접수 건이 이미 있는 리드는 건너뛴다(중복 등록 방지). 필요하면 화면에서 직접 처리
--   - 옮긴 리드에는 이관 표시(converted_franchise_id·converted_at)와 히스토리를 남긴다
--   한 번에 전부 되거나 전부 안 되도록 하나의 문장으로 쓴다. 다시 실행해도 이미 옮긴 건은 대상에서 빠진다.
-- ─────────────────────────────────────────────────────────────
WITH src AS MATERIALIZED (
  SELECT l.*, gen_random_uuid() AS new_franchise_id
  FROM own_leads l
  WHERE l.closed_at IS NULL
    AND l.converted_franchise_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM franchise_applications f
      WHERE l.phone IS NOT NULL
        AND regexp_replace(f.phone, '\D', '', 'g') = regexp_replace(l.phone, '\D', '', 'g')
    )
),
ins AS (
  INSERT INTO franchise_applications (
    id, business_name, owner_name, phone, business_number,
    equipment_items, address, address_detail,
    cs_id, applicant_type, status,
    reception_channel, channel, case_type, is_rental, is_installment,
    reception_date, card_apply_date, open_date, install_date,
    van_company, internet, program, memo, created_by, created_at
  )
  SELECT
    s.new_franchise_id, s.business_name, s.owner_name, s.phone, s.business_number,
    COALESCE(s.equipment_items, '[]'::jsonb), s.address, s.address_detail,
    s.assignee_id, COALESCE(s.applicant_type, 'individual'), 'doc_waiting',
    '직접 영업', 'direct_sales', 'new', COALESCE(s.is_rental, FALSE), COALESCE(s.is_installment, FALSE),
    -- 가맹접수의 접수날짜는 글자(YYYY-MM-DD), 나머지 날짜는 DATE
    to_char(COALESCE(s.reception_date, (s.created_at AT TIME ZONE 'Asia/Seoul')::date), 'YYYY-MM-DD'),
    s.card_apply_date, s.open_date, s.install_date,
    s.van_company, s.internet, s.program,
    '[' || COALESCE(s.created_by_name, '자체리드') || ' '
      || to_char(s.created_at AT TIME ZONE 'Asia/Seoul', 'YYYY. MM. DD. HH24:MI') || '] '
      || s.source || ' 리드건 (자체리드 L-' || lpad(s.lead_no::text, 4, '0') || ' 이관, 구분 ' || s.lead_type || ')'
      || CASE WHEN btrim(COALESCE(s.note, '')) <> '' THEN E'\n' || s.note ELSE '' END,
    s.created_by, s.created_at
  FROM src s
  RETURNING id
),
upd AS (
  UPDATE own_leads l
  SET converted_franchise_id = s.new_franchise_id,
      converted_at = now(),
      decision = '접수대상'
  FROM src s
  WHERE l.id = s.id
    AND EXISTS (SELECT 1 FROM ins WHERE ins.id = s.new_franchise_id)
  RETURNING l.id, s.new_franchise_id
)
INSERT INTO own_lead_logs (lead_id, user_name, action, to_value)
SELECT u.id, '일괄 이관(154)', 'convert', u.new_franchise_id::text
FROM upd u;

-- ─────────────────────────────────────────────────────────────
-- 3단계. 결과 확인
-- ─────────────────────────────────────────────────────────────
-- 옮겨진 건 (가맹접수 쪽)
SELECT f.business_name AS 상호, f.owner_name AS 대표자, f.phone AS 연락처, f.status AS 상태,
       left(f.memo, 60) AS 비고_앞부분
FROM franchise_applications f
JOIN own_leads l ON l.converted_franchise_id = f.id
WHERE l.converted_at >= now() - interval '10 minutes'
ORDER BY f.created_at;

-- 전화번호 중복으로 남은 리드 (있으면 화면에서 직접 확인)
SELECT 'L-' || lpad(l.lead_no::text, 4, '0') AS 원본번호, l.business_name AS 상호, l.phone AS 연락처
FROM own_leads l
WHERE l.closed_at IS NULL AND l.converted_franchise_id IS NULL;

-- 되돌리기(필요할 때만): 방금 옮긴 가맹접수 건을 지우고 리드의 이관 표시를 푼다.
-- DELETE FROM franchise_applications f USING own_lead_logs g
--   WHERE g.user_name = '일괄 이관(154)' AND g.to_value = f.id::text;
-- UPDATE own_leads SET converted_franchise_id = NULL, converted_at = NULL
--   WHERE id IN (SELECT lead_id FROM own_lead_logs WHERE user_name = '일괄 이관(154)');
