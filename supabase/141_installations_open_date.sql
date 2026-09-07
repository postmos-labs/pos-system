-- 설치건의 확정 오픈일.
--
-- 오픈 예정일은 가맹접수(franchise_applications.open_date, 007번)에 이미 있다. 설치관리는
-- 그 값을 조인해 읽고 복사하지 않는다 — 복사하면 접수 쪽에서 날짜를 고쳤을 때 두 값이
-- 어긋나고, 어느 쪽이 정본인지 알 수 없게 된다.
--
-- 여기 값이 채워지면 그 값이 예정일보다 우선한다. 가맹접수 없이 직접 등록한 설치건
-- (AS·배송·직접 등록)은 예정일이 없으므로 이 컬럼에 직접 입력한다.
ALTER TABLE installations ADD COLUMN IF NOT EXISTS open_date DATE;

COMMENT ON COLUMN installations.open_date IS
  '확정 오픈일. 비어 있으면 가맹접수의 오픈예정일(franchise_applications.open_date)을 따른다.';

-- D-5 / D-3 알림 cron이 오픈일로 설치건을 훑는다. 대부분의 행은 NULL이라 부분 인덱스로 둔다.
CREATE INDEX IF NOT EXISTS installations_open_date_idx
  ON installations (open_date)
  WHERE open_date IS NOT NULL;
