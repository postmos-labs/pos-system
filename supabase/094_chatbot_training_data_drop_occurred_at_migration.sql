-- 발생일(occurred_at)을 별도 컬럼으로 두지 않고, 등록일(created_at) 하나로 단순화한다.
-- 마이그레이션 시에는 CSV의 원래 날짜를 created_at 에 직접 넣는 방식으로 대체.

ALTER TABLE public.chatbot_training_data
  DROP COLUMN IF EXISTS occurred_at;

GRANT UPDATE (problem_situation, solution, company_name, phone)
  ON public.chatbot_training_data TO authenticated;
