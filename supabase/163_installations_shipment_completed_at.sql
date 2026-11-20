-- 발송완료 표시 (자가설치 / 외부기사)
--
-- 지금까지는 자가설치·외부기사 건에서 [택배발송]을 누르면 상태를 completed로 바꿨다.
-- 그래서 건이 목록에서 완료로 넘어가 버렸다. 앞으로는 상태를 그대로 두고 이 칸에 시각만 남겨,
-- 목록의 설치 방식 옆에 "발송완료" 표시가 붙게 한다.
-- 재고 차감·송장 알림톡은 지금처럼 [택배발송]을 누른 시점에 한 번만 일어난다(완료 처리 시 중복 차감 방지).
--
-- 실행 전에도 화면은 열린다. 다만 [택배발송]을 누르면 163 안내와 함께 실패한다.

ALTER TABLE installations ADD COLUMN IF NOT EXISTS shipment_completed_at TIMESTAMPTZ;

-- 확인
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'installations' AND column_name = 'shipment_completed_at';
