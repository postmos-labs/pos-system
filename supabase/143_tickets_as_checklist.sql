-- 기술지원 인입내역의 AS 응대 원칙 체크리스트
--
-- 가맹점 360 메모(merchant_memo_entries.checklist)와 같은 체크리스트를 인입내역 등록에서도 받는다.
-- 항목 id → true 꼴의 JSON. 기술지원팀(team = 'tech') 건에서만 채우며 기존 데이터는 비어 있다.
-- 항목 정의는 src/lib/asChecklist.ts 한 곳에 둔다.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS as_checklist JSONB;

-- 확인용: 컬럼이 보이면 성공
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'tickets'
   AND column_name = 'as_checklist';
