-- 인입내역 종류(type)를 담당팀 기준으로 보정
--
-- 인입내역 등록 폼이 type을 'install'(신규 설치)로 고정 저장해 왔다. 가맹점 360 업무 이력과
-- 목록의 종류 배지가 이 값을 읽으므로 기술지원 건은 'as', CS 건은 'consult'로 맞춘다.
-- team이 비어 있는 옛 작업 관리 시절 건은 실제 설치 건일 수 있어 건드리지 않는다.
-- type CHECK (001_schema.sql): 'install' | 'as' | 'consult' | 'other'

UPDATE tickets SET type = 'as'      WHERE team = 'tech' AND type = 'install';
UPDATE tickets SET type = 'consult' WHERE team = 'cs'   AND type = 'install';

-- 확인용: team이 있는 건에 'install'이 남아 있지 않아야 한다
SELECT team, type, COUNT(*) FROM tickets WHERE team IS NOT NULL GROUP BY team, type ORDER BY team, type;
