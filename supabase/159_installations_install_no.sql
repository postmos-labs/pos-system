-- 설치건 고유 번호 (설치관리·택배발송 목록의 No 칸)
--
-- 현장 요청: 목록에 몇 번 건인지 번호를 달아 달라. 화면 순서(위에서 1번)로 매기면 상태 칩·필터를
-- 바꿀 때마다 번호가 바뀌어 "몇 번 건" 으로 부를 수 없으므로, 설치건마다 바뀌지 않는 번호를 둔다.
-- 기존 건은 등록 순서(created_at)대로 1부터 매기고, 새 건은 시퀀스로 이어서 받는다.
--
-- 실행 전에도 화면은 열린다(No 칸이 "-"로 보인다).

ALTER TABLE installations ADD COLUMN IF NOT EXISTS install_no BIGINT;

-- 기존 건: 등록 순서대로 번호 부여 (이미 번호가 있는 건은 건드리지 않는다)
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
  FROM installations
)
UPDATE installations i
SET install_no = o.rn
FROM ordered o
WHERE i.id = o.id AND i.install_no IS NULL;

-- 새 건: 마지막 번호 다음부터 자동 부여
CREATE SEQUENCE IF NOT EXISTS installations_install_no_seq OWNED BY installations.install_no;
SELECT setval(
  'installations_install_no_seq',
  COALESCE((SELECT MAX(install_no) FROM installations), 0) + 1,
  false
);
ALTER TABLE installations
  ALTER COLUMN install_no SET DEFAULT nextval('installations_install_no_seq');

CREATE UNIQUE INDEX IF NOT EXISTS installations_install_no_key ON installations (install_no);

-- 확인: 번호 없는 건 0, 최소·최대 번호
SELECT
  COUNT(*) FILTER (WHERE install_no IS NULL) AS missing,
  MIN(install_no) AS first_no,
  MAX(install_no) AS last_no
FROM installations;
