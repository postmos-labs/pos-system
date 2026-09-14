-- 자체리드 사후 연결 (데이터 보정, 스키마 변경 없음)
--
-- 자체리드 화면이 생기기 전(또는 전환 버튼을 쓰기 전)에 가맹접수에 바로 등록된 대표님 리드 건을
-- 자체리드 목록에 "가맹접수 전환됨"으로 넣어 이력을 맞춘다. 전화번호로 가맹접수 건을 찾고,
-- 이미 연결된 리드가 있으면 건너뛴다. 여러 번 실행해도 중복이 생기지 않는다.
--
-- 대상은 아래 VALUES 목록이다. 건을 더 넣으려면 같은 형식으로 줄을 추가하고 다시 실행한다.
--   (전화번호 숫자만, 유입경로, 비고)

WITH targets(phone_digits, source, note) AS (
  VALUES
    ('01089986001', '대표님',      E'우리리드건\n엑티브접수\n오픈 9/21\n인터넷 9/18\n포스기 9/18\n포스기 + 현금20만원'),
    ('01040487283', '상무님 리드건', E'01040487283\n엑티브소개건\n포스기1set 주방프린트 2대\n가맹접수진행요청'),
    ('01071820013', '상무님 리드건', E'서류 들어오면 인터넷 접수 진행해야함\n500m.ai전화.cctv1대')
),
matched AS (
  -- 같은 번호로 접수가 여러 건이면 가장 최근 것에 붙인다.
  SELECT DISTINCT ON (t.phone_digits)
    t.phone_digits, t.source, t.note,
    f.id AS franchise_id, f.business_name, f.owner_name, f.phone, f.cs_id, f.created_at
  FROM targets t
  JOIN franchise_applications f
    ON regexp_replace(coalesce(f.phone, ''), '\D', '', 'g') = t.phone_digits
  ORDER BY t.phone_digits, f.created_at DESC
)
INSERT INTO own_leads (
  business_name, owner_name, phone, source,
  assignee_id, assignee_name,
  contact_status, doc_status, decision,
  note, converted_franchise_id, closed_at, close_reason,
  created_by_name, created_at
)
SELECT
  coalesce(nullif(m.business_name, ''), '상호 미입력'),
  m.owner_name,
  m.phone,
  m.source,
  m.cs_id,
  p.name,
  '연락완료', '미확인', '접수대상',
  m.note,
  m.franchise_id,
  now(),
  '가맹접수 전환 (사후 연결)',
  '시스템 보정',
  m.created_at
FROM matched m
LEFT JOIN profiles p ON p.id = m.cs_id
WHERE NOT EXISTS (
  SELECT 1 FROM own_leads l WHERE l.converted_franchise_id = m.franchise_id
);

-- 확인용: 몇 건이 연결됐는지, 못 찾은 번호는 무엇인지
SELECT t.phone_digits,
       CASE WHEN l.id IS NULL THEN '가맹접수 건을 못 찾음' ELSE '연결됨: ' || l.business_name END AS result
FROM (VALUES ('01089986001'), ('01040487283'), ('01071820013')) AS t(phone_digits)
LEFT JOIN own_leads l
  ON regexp_replace(coalesce(l.phone, ''), '\D', '', 'g') = t.phone_digits
 AND l.converted_franchise_id IS NOT NULL;
