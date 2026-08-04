-- 가맹접수 상태에 "취소"(canceled) 추가
-- 접수가 취소된 경우 표시 (고객 안내 메시지 발송 없이 상태만 변경)

ALTER TABLE franchise_applications DROP CONSTRAINT IF EXISTS franchise_applications_status_check;
ALTER TABLE franchise_applications ADD CONSTRAINT franchise_applications_status_check CHECK (status IN (
  'doc_waiting',
  'doc_incomplete',
  'card_apply_done',
  'internet_apply_done',
  'card_internet_apply_done',
  'card_done',
  'internet_done',
  'toss_review_apply_done',
  'toss_review_done',
  'completed',
  'hold',
  'persistent_absence',
  'canceled'
));
