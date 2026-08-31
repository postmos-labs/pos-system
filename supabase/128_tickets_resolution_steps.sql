-- 기술지원 인입내역의 "해결 절차" 칸
--
-- 지금은 progress_note(답변내용) 한 칸에 두 가지를 같이 적게 되어 있다.
--   · 이번 건에 무슨 일이 있었는지 (경위 — 가맹점별 상황이 섞인다)
--   · 같은 문제가 또 왔을 때 따라 할 순서 (재사용 — 챗봇 학습에 뽑아 쓴다)
-- 두 성격이 충돌해 한 칸으로는 어느 쪽도 제대로 안 남는다.
--
-- progress_note는 "처리 내용"으로 그대로 두고, 재사용 가능한 절차만 이 컬럼에 따로 받는다.
-- 챗봇 학습 자료는 이 컬럼에서만 뽑으므로 가맹점 식별 정보가 섞이지 않는다.
-- 기술지원팀(team = 'tech') 건에서만 입력받으며, 기존 데이터는 비어 있는 채로 시작한다.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS resolution_steps TEXT;

-- 확인용: 컬럼이 보이면 성공
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'tickets'
   AND column_name IN ('progress_note', 'resolution_steps')
 ORDER BY column_name;
