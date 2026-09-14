-- 자체리드 사후 연결 2 — 비고 문구로 찾기 (데이터 보정, 스키마 변경 없음)
--
-- 150은 전화번호 3건만 다뤘다. 가맹접수 쪽에는 "리드에서 온 건"이라는 칸이 없어서, CS가 비고에
-- 적어 둔 "리드건" 문구로 후보를 찾는다. 1단계 조회로 눈으로 확인한 뒤 2단계 INSERT를 실행한다.
-- 이미 자체리드에 연결된 접수 건은 건너뛰므로 여러 번 실행해도 중복이 없다.

-- ─────────────────────────────────────────────────────────────
-- 1단계. 후보 확인 (실행만 하고 결과를 본다)
--   linked = '연결됨'이면 이미 자체리드에 있는 건, '없음'이면 이번에 들어갈 건.
--   찾는 문구를 바꾸려면 아래 ILIKE 패턴을 고친다.
-- ─────────────────────────────────────────────────────────────
SELECT
  f.created_at::date AS 접수일,
  f.business_name    AS 상호,
  f.owner_name       AS 대표자,
  f.phone            AS 연락처,
  f.reception_channel AS 접수경로,
  left(regexp_replace(coalesce(f.memo, ''), E'\\s+', ' ', 'g'), 80) AS 비고_앞부분,
  CASE WHEN l.id IS NULL THEN '없음' ELSE '연결됨' END AS linked
FROM franchise_applications f
LEFT JOIN own_leads l ON l.converted_franchise_id = f.id
WHERE f.memo ILIKE '%리드건%'
   OR f.memo ILIKE '%리드 건%'
   OR f.memo ILIKE '%대표님%'
   OR f.memo ILIKE '%상무님%'
ORDER BY f.created_at DESC;

-- ─────────────────────────────────────────────────────────────
-- 2단계. 1단계에서 본 후보 중 linked='없음'인 건을 자체리드에 "가맹접수 전환됨"으로 넣는다.
--   유입경로는 비고에 "상무님"이 있으면 '상무님 리드건', 아니면 '대표님'.
--   비고는 가맹접수 비고를 그대로 옮긴다.
-- ─────────────────────────────────────────────────────────────
INSERT INTO own_leads (
  business_name, owner_name, phone, source,
  assignee_id, assignee_name,
  contact_status, doc_status, decision,
  note, converted_franchise_id, closed_at, close_reason,
  created_by_name, created_at
)
SELECT
  coalesce(nullif(f.business_name, ''), '상호 미입력'),
  f.owner_name,
  f.phone,
  CASE WHEN f.memo ILIKE '%상무님%' THEN '상무님 리드건' ELSE '대표님' END,
  f.cs_id,
  p.name,
  '연락완료', '미확인', '접수대상',
  nullif(f.memo, ''),
  f.id,
  now(),
  '가맹접수 전환 (사후 연결)',
  '시스템 보정',
  f.created_at
FROM franchise_applications f
LEFT JOIN profiles p ON p.id = f.cs_id
WHERE (f.memo ILIKE '%리드건%'
    OR f.memo ILIKE '%리드 건%'
    OR f.memo ILIKE '%대표님%'
    OR f.memo ILIKE '%상무님%')
  AND NOT EXISTS (SELECT 1 FROM own_leads l WHERE l.converted_franchise_id = f.id);

-- 확인: 자체리드에 "가맹접수 전환됨"으로 들어간 건 전체
SELECT l.created_at::date AS 접수일, l.business_name AS 상호, l.phone AS 연락처, l.source AS 유입경로, l.close_reason
FROM own_leads l
WHERE l.converted_franchise_id IS NOT NULL
ORDER BY l.created_at DESC;

-- 잘못 들어간 건을 되돌리려면 (사후 연결로 넣은 것만 지운다):
-- DELETE FROM own_leads WHERE close_reason = '가맹접수 전환 (사후 연결)';
