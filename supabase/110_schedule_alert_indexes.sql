-- (app)/layout.tsx의 일정알림 조회(모든 페이지 이동마다 실행)가 날짜 컬럼으로 필터링하는데
-- 해당 컬럼들에 인덱스가 없어 항상 순차 스캔이 발생하고 있었음. 인덱스 추가.

CREATE INDEX IF NOT EXISTS idx_tickets_scheduled_at ON tickets(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_tickets_install_date ON tickets(install_date);
CREATE INDEX IF NOT EXISTS idx_tickets_open_date ON tickets(open_date);
CREATE INDEX IF NOT EXISTS idx_tickets_card_apply_date ON tickets(card_apply_date);

CREATE INDEX IF NOT EXISTS idx_franchise_applications_open_date ON franchise_applications(open_date);
CREATE INDEX IF NOT EXISTS idx_franchise_applications_install_date ON franchise_applications(install_date);
