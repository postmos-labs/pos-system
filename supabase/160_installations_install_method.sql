-- 설치 방식 (방문설치 / 자가설치 / 외부기사 설치)
--
-- 설치·전환 건을 어떻게 설치하는지 구분하는 칸을 새로 둔다. 기존 건은 채우지 않는다(NULL).
--   visit    : 방문설치 — 우리 기사가 방문 (제품준비 → 일정확정 → 이동중 → 설치완료)
--   self     : 자가설치 — 택배로 보내고 고객이 직접 설치. [택배발송] 한 번으로 끝(승인 없음)
--   external : 외부기사 설치 — 택배로 보내고 외부기사가 설치. [택배발송] 한 번으로 끝, 알림톡 없음
-- 화면은 NULL이면 delivery_type으로 대신 판단한다(택배발송 → 자가설치, 설치·전환 → 방문설치).
-- 판단 규칙은 src/lib/installMethod.ts 한 곳에 있다.
--
-- 실행 전에도 화면은 열린다. 방식 변경·외부기사 등록만 실패하고 안내가 뜬다.

ALTER TABLE installations ADD COLUMN IF NOT EXISTS install_method TEXT;

ALTER TABLE installations DROP CONSTRAINT IF EXISTS installations_install_method_check;
ALTER TABLE installations ADD CONSTRAINT installations_install_method_check
  CHECK (install_method IS NULL OR install_method IN ('visit', 'self', 'external'));

-- 확인
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'installations' AND column_name = 'install_method';
