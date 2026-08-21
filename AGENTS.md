<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 리팩토링 / DB 스키마 변경 작업 규칙

코드 리팩토링과 DB 스키마 변경을 함께 진행할 때는 아래 순서를 따른다.

1. **코드 및 DB 스키마 확인** — 손대려는 영역의 현재 코드와 관련 테이블 구조를 먼저 파악
2. **계획 수립** — 코드 리팩토링 계획과 DB 변경 계획을 세우고 공유
3. **진행** — 실제 구현. 마이그레이션은 `supabase/`에 SQL 파일로 **작성만** 하고, 실행은 사용자가 Supabase SQL Editor에서 직접 한다. 에이전트에게는 DB 접근 권한이 없으므로(저장소에 자격증명 없음) 임의로 적용하거나 적용된 것으로 가정하지 않는다. 마이그레이션이 아직 적용되지 않은 상태에서도 화면이 500으로 죽지 않고 빈 값으로 뜨도록 코드를 작성한다.
4. **flow 및 문서 작성** — 진행하면서 결정 사항을 그때그때 기록. 다 끝난 뒤 몰아서 쓰지 않기 (이유를 잊어버리기 쉬움)
5. **마이그레이션 정리** — 작업 중엔 새 스키마 변경을 `supabase/`에 가장 큰 번호 다음 번호로 계속 이어 붙인다. 정리는 아래 중 하나가 **실제로 발생했을 때만** 한다 — 새 개발 환경을 세워야 할 때, 순차 실행이 깨질 때, 스키마 파악이 막혀 작업이 지연될 때. 그 전까진 파일이 쌓여도 그대로 둔다. 정리 시점이 오면 라이브 스키마 덤프를 기준으로 `001_user.sql`, `002_franchise.sql`처럼 도메인별 클린 스키마 세트를 새로 작성하고, 기존 번호 매긴 마이그레이션 전체는 삭제하지 않고 `supabase/archive/`로 이동해 운영 반영 이력으로 보존한다. 클린 스키마 세트는 빈 DB를 처음부터 세우는 용도이며 운영 DB에 실행하는 파일이 아니다.

**DB 스키마 변경 원칙**

- 컬럼 삭제/타입 변경보다 추가 위주로 먼저 진행하고, 삭제는 되돌리기 어려우니 가장 마지막에
- 커밋 컨벤션은 [docs/commit-convention.md](./docs/commit-convention.md) 따름
