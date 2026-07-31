-- 가맹접수 탭 "다음 확인일" 컬럼을 위한 별도 테이블
-- franchise_applications 1건당 다음 확인일 0~1개 (1:1, 지정한 건만 row 생성)

CREATE TABLE IF NOT EXISTS public.franchise_next_check_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  franchise_application_id UUID NOT NULL UNIQUE
    REFERENCES public.franchise_applications(id) ON DELETE CASCADE,
  next_check_date DATE NOT NULL,
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS franchise_next_check_dates_updated_at
  ON public.franchise_next_check_dates;
CREATE TRIGGER franchise_next_check_dates_updated_at
  BEFORE UPDATE ON public.franchise_next_check_dates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.franchise_next_check_dates ENABLE ROW LEVEL SECURITY;

-- franchise_applications 자체가 authenticated 전체 개방 정책이라 동일하게 맞춘다
DROP POLICY IF EXISTS "authenticated full access" ON public.franchise_next_check_dates;
CREATE POLICY "authenticated full access" ON public.franchise_next_check_dates
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.franchise_next_check_dates TO authenticated;
