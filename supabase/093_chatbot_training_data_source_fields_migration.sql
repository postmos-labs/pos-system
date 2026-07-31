-- 챗봇 학습 데이터에 상호명/연락처/발생일 컬럼 추가
-- 과거 CS 대응 기록(CSV) 마이그레이션을 위해 등록자 지정 트리거를 완화한다.

ALTER TABLE public.chatbot_training_data
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS occurred_at DATE;

-- 기존 트리거는 registered_by/registrant_name을 무조건 auth.uid() 기준으로 덮어썼다.
-- service_role 키로 과거 데이터를 이관할 때는 auth.uid()가 NULL이라 그대로 두면
-- NOT NULL 제약을 위반한다. NEW에 값이 이미 지정된 경우엔 덮어쓰지 않도록 완화한다.
-- (일반 클라이언트는 INSERT 시 registered_by/registrant_name을 보내지 않으므로
-- 기존 동작에는 영향 없음. RLS WITH CHECK (registered_by = auth.uid())가 그대로
-- 남아있어 authenticated 클라이언트가 임의로 다른 사용자를 사칭할 수는 없다.)
CREATE OR REPLACE FUNCTION public.set_chatbot_training_data_registrant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.registered_by IS NULL THEN
    NEW.registered_by := auth.uid();
  END IF;

  IF NEW.registrant_name IS NULL THEN
    SELECT name INTO NEW.registrant_name
    FROM public.profiles
    WHERE id = NEW.registered_by;
  END IF;

  IF NEW.registrant_name IS NULL THEN
    RAISE EXCEPTION '등록자 프로필을 찾을 수 없습니다.';
  END IF;

  RETURN NEW;
END;
$$;

-- UI에서 상호명/연락처/발생일도 수정 가능하도록 컬럼 단위 UPDATE 권한 확장
GRANT UPDATE (problem_situation, solution, company_name, phone, occurred_at)
  ON public.chatbot_training_data TO authenticated;
