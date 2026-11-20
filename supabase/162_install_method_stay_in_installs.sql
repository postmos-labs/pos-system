-- 설치 방식 변경이 탭을 옮기지 않게 바꾸면서, 이미 넘어가 버린 건을 원래 자리로 되돌린다.
--
-- 이전 동작(2026-11-20 이전)은 설치관리에서 방식을 자가설치·외부기사로 바꾸면 delivery_type을
-- 'delivery'로 덮어써 그 건을 택배발송 탭으로 넘겼다. 이제는 install_method만 바꾸고
-- delivery_type(탭 소속)은 그대로 두므로, 넘어간 건을 'install'로 되돌린다.
--
-- 대상 판별: 마지막 방식 변경 로그가 from='visit' → to=self/external 이고 지금 delivery_type='delivery'인 건.
--   - 설치관리 건을 자가·외부기사로 바꾼 경우만 from이 'visit'이다.
--   - 원래 택배발송 건(칸이 비어 판단상 self)을 external로 바꾼 경우는 from='self'라 손대지 않는다.
--     그 행은 택배발송 탭에 남는 게 맞다.
--   - 전환 건은 delivery_type이 'transfer'로 남아 있어 대상이 아니다.
-- install_method는 그대로 두므로 되돌린 뒤에도 화면에는 자가설치·외부기사로 보이고 [택배발송] 버튼을 쓴다.

-- 1) 미리보기 — 실행 전에 건수와 대상을 확인한다.
WITH latest AS (
  SELECT DISTINCT ON (installation_id)
    installation_id,
    details,
    created_at
  FROM installation_activity_logs
  WHERE details->>'source' = 'install_method'
  ORDER BY installation_id, created_at DESC
)
SELECT
  i.id,
  i.install_no,
  i.customer_name,
  i.status,
  i.install_method,
  l.details->>'from' AS from_method,
  l.details->>'to' AS to_method,
  l.created_at AS changed_at
FROM installations i
JOIN latest l ON l.installation_id = i.id
WHERE i.delivery_type = 'delivery'
  AND l.details->>'from' = 'visit'
  AND l.details->>'to' IN ('self', 'external')
ORDER BY l.created_at DESC;

-- 2) 되돌리기
WITH latest AS (
  SELECT DISTINCT ON (installation_id)
    installation_id,
    details,
    created_at
  FROM installation_activity_logs
  WHERE details->>'source' = 'install_method'
  ORDER BY installation_id, created_at DESC
),
target AS (
  SELECT i.id
  FROM installations i
  JOIN latest l ON l.installation_id = i.id
  WHERE i.delivery_type = 'delivery'
    AND l.details->>'from' = 'visit'
    AND l.details->>'to' IN ('self', 'external')
)
UPDATE installations i
SET delivery_type = 'install',
    updated_at = NOW()
FROM target t
WHERE i.id = t.id;

-- 3) 확인 — 되돌린 건이 설치관리(delivery_type <> 'delivery')로 돌아왔는지, 바로 보낸 건이 남지 않았는지
SELECT
  count(*) FILTER (WHERE delivery_type = 'install') AS restored_to_installs,
  count(*) FILTER (WHERE delivery_type = 'delivery') AS still_delivery
FROM installations
WHERE install_method IN ('self', 'external')
  AND status IN ('received', 'preparing', 'delivery_sent');
