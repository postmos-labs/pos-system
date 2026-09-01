-- 2026년 9월 일정 일괄 등록 (박은서 대표 / 정희두 상무)
--
-- 이름으로 profiles를 찾아 created_by에 연결한다. 계정이 없으면 created_by는 비우고
-- created_by_name만 남긴다 — 일정은 정상적으로 보이고, 나중에 관리자가 수정할 수 있다.
-- 같은 제목·같은 시작시각이 이미 있으면 건너뛰므로 두 번 실행해도 중복되지 않는다.
--
-- 종료 시각이 원문에 없어 1시간으로 잡았다. 실제와 다르면 화면에서 수정하면 된다.

WITH people AS (
  SELECT '박은서' AS person_name,
         (SELECT id FROM profiles WHERE name = '박은서' LIMIT 1) AS person_id
  UNION ALL
  SELECT '정희두',
         (SELECT id FROM profiles WHERE name = '정희두' LIMIT 1)
),
rows_to_add(person_name, title, category, starts_at, ends_at, location) AS (
  VALUES
    ('박은서', 'CS팀 면접',              '미팅',
     TIMESTAMPTZ '2026-09-02 11:00+09', TIMESTAMPTZ '2026-09-02 12:00+09', NULL),
    ('박은서', '기술2팀 팀장 면접',       '미팅',
     TIMESTAMPTZ '2026-09-03 11:00+09', TIMESTAMPTZ '2026-09-03 12:00+09', NULL),
    ('정희두', '구구스 미팅',            '미팅',
     TIMESTAMPTZ '2026-09-03 14:00+09', TIMESTAMPTZ '2026-09-03 15:00+09', NULL),
    ('정희두', '브이쿨 토스 미팅',        '미팅',
     TIMESTAMPTZ '2026-09-04 10:30+09', TIMESTAMPTZ '2026-09-04 11:30+09', '화성시'),
    ('정희두', '토스플레이스·나이스정보통신 내방', '미팅',
     TIMESTAMPTZ '2026-09-08 17:00+09', TIMESTAMPTZ '2026-09-08 18:00+09', NULL)
)
INSERT INTO staff_schedules
  (title, category, starts_at, ends_at, all_day, location, memo, created_by, created_by_name)
SELECT
  r.title,
  r.category,
  r.starts_at,
  r.ends_at,
  FALSE,
  r.location,
  CASE
    WHEN r.title LIKE '토스플레이스%' THEN '토스플레이스 장성원 팀장, 나이스정보통신 차장 내방'
    ELSE NULL
  END,
  p.person_id,
  r.person_name
FROM rows_to_add r
JOIN people p ON p.person_name = r.person_name
WHERE NOT EXISTS (
  SELECT 1 FROM staff_schedules s
  WHERE s.title = r.title AND s.starts_at = r.starts_at
);

-- 확인용: 등록된 일정과, 계정을 못 찾아 연결이 빈 건이 있는지 함께 본다.
SELECT
  to_char(starts_at AT TIME ZONE 'Asia/Seoul', 'MM-DD HH24:MI') AS 시작,
  created_by_name AS 담당,
  title AS 제목,
  CASE WHEN created_by IS NULL THEN '계정 연결 안 됨' ELSE '연결됨' END AS 계정
FROM staff_schedules
WHERE starts_at >= TIMESTAMPTZ '2026-09-01 00:00+09'
  AND starts_at <  TIMESTAMPTZ '2026-10-01 00:00+09'
ORDER BY starts_at;
