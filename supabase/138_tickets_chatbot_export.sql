-- 인입내역 해결 절차 → 챗봇 학습 데이터 파이프라인
--
-- 흐름은 이렇다.
--   1) 기술지원 인입내역의 resolution_steps를 파일로 내보낸다 (외부 LLM에 정제를 맡긴다)
--   2) 정제된 문제상황/해결방법을 chatbot_training_data로 되받는다
--
-- 두 번째 배치부터가 문제다. 이미 내보낸 건을 구분할 방법이 없으면 매번 전체를
-- 다시 내보내게 되고, 같은 절차가 학습 데이터에 중복으로 쌓인다.
-- 내보낸 시각을 티켓에 찍어두고, 다음부터는 안 찍힌 것만 내보낸다.

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS chatbot_exported_at TIMESTAMPTZ;

-- 내보낼 대상을 고르는 조건(해결 절차가 있고 아직 안 내보낸 건) 전용 인덱스
CREATE INDEX IF NOT EXISTS tickets_chatbot_export_pending_idx
  ON public.tickets (created_at DESC)
  WHERE resolution_steps IS NOT NULL AND chatbot_exported_at IS NULL;

-- 정제 결과가 어느 인입내역에서 나왔는지 되짚을 수 있게 남긴다.
-- 정제 과정에서 비슷한 건 여러 개가 하나로 합쳐지므로 1:1이 아니라 배열이다.
-- FK를 걸지 않는 이유 — 티켓이 지워져도 학습 데이터는 남아야 한다.
ALTER TABLE public.chatbot_training_data
  ADD COLUMN IF NOT EXISTS source_ticket_ids UUID[];

-- 수정 화면에서 출처를 건드릴 일은 없으므로 UPDATE 권한은 기존 4개 컬럼 그대로 둔다.
-- (INSERT는 테이블 단위 권한이라 source_ticket_ids도 함께 들어간다)

-- 확인용: 두 컬럼이 보이면 성공
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND (
     (table_name = 'tickets' AND column_name = 'chatbot_exported_at')
     OR (table_name = 'chatbot_training_data' AND column_name = 'source_ticket_ids')
   )
 ORDER BY table_name;
