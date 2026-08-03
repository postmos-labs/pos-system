-- 가맹접수 상태에 "지속적 부재"(persistent_absence) 추가
-- 고객과 지속적으로 연락이 닿지 않는 경우 표시 (고객 안내 메시지 발송 없이 상태만 변경)

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
  'persistent_absence'
));
