<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# pos-system

포스모스 내부 운영 관리 시스템. 가맹점 접수부터 심사·설치·인터넷 개통·정산까지의 업무 흐름을 한곳에서 처리한다.

## 스택

|            |                                                   |
| ---------- | ------------------------------------------------- |
| 프레임워크 | Next.js 16.2 (App Router, Turbopack) · React 19.2 |
| 언어       | TypeScript 5                                      |
| 스타일     | Tailwind CSS 4 · Radix UI · lucide-react          |
| DB / 인증  | Supabase (Postgres + RLS + Realtime)              |
| 알림       | Solapi (카카오 알림톡 / SMS)                      |
| 배포       | Vercel                                            |

## 폴더 구조

```
src/
  app/
    (app)/          로그인 후 화면 — 라우트 하나가 업무 도메인 하나
      franchise/      가맹접수    installs/     설치관리
      internet/       인터넷관리  merchants/    가맹점 360
      approvals/      승인함      admin/        사용자·권한·로그
      dashboard/ kpi/ calendar/ inventory/ contracts/ tickets/ ...
    api/            라우트 핸들러
    login/ sign/ equipment-select/ install-status/   비로그인 진입점
  components/       공용 UI
  lib/
    supabase/       client(브라우저) · server(SSR) · admin(service_role)
    auth/           권한 가드
    solapi.ts       알림톡 발송 + 템플릿 매핑
    franchiseStatusEffects.ts   가맹접수 상태 변경 부수효과
    kpi.ts  approvalNotes.ts  pdf/  ...
  types/index.ts    도메인 타입 · 상태 라벨 · 상태 색상
supabase/           번호순 마이그레이션 SQL (수동 실행)
docs/feature/       기능별 설계 기록
```

## 명령어

```bash
npm run dev            # 개발 서버
npm run build          # 프로덕션 빌드
npx tsc --noEmit       # 타입 검사
npx eslint <파일>       # 린트
npm run format:check   # 포맷 검사 (전체)
```

`.env`가 없으면 `npm run build`는 컴파일·타입 검사까지 통과한 뒤 페이지 데이터 수집 단계에서 `supabaseUrl is required`로 실패한다. 자격증명 없는 환경에서는 정상이며, 코드 검증은 `tsc --noEmit`으로 판단한다.

커밋 시 husky가 자동으로 돈다 — `pre-commit`은 lint-staged(prettier), `commit-msg`는 커밋 메시지 형식 검사.

# 작업 진행 방식

속도와 정확도를 함께 잡기 위해 역할을 나눈다.

## 1. 설계 — Opus가 직접

파악·계획·의사결정은 위임하지 않는다. 손대려는 코드와 관련 테이블을 먼저 읽고, 무엇을 어디까지 바꿀지 정한 뒤 사용자와 공유한다. 판단이 어려우면 추론 강도를 올려서라도 Opus가 끝까지 본다.

**위임 전에 영향 범위를 전수 조사한다.** 같은 로직이 화면·클라이언트 가드·서버 액션에 흩어져 있는 경우가 많다. `grep`으로 전부 찾아 목록을 만든 다음 위임한다. 일부만 지시하면 나머지가 남아 "버튼은 보이는데 누르면 에러" 같은 어중간한 상태가 된다.

## 2. 구현 — Sonnet 5 서브에이전트에게 위임

Agent 호출 시 `model: "sonnet"`을 지정한다. 서로 의존하지 않는 작업은 한 메시지에 여러 개 띄워 병렬로 돌린다.

위임 프롬프트에 반드시 담을 것:

- 배경 한 문단 — 왜 이 변경이 필요한지
- 고칠 위치 전부 — 파일 경로 + 줄번호 + 현재 코드 + 바꿀 내용
- 건드리면 안 되는 것 — 인접한 유사 코드, 반대 방향 분기
- 금지 사항 — 리팩토링·포맷 변경·주석 정리 금지, 최소 변경
- 실행할 검증 명령과 보고 형식 (`git diff` 원문 요구)

## 3. 검토 — Opus가 마지막에 한 번

서브에이전트 보고를 그대로 믿지 않는다. 반드시 직접 확인한다.

- `git diff`를 직접 읽는다
- `npx tsc --noEmit` / `npx eslint <바뀐 파일>` / `npx prettier --check <바뀐 파일>`을 직접 돌린다
- 린트 오류가 나오면 **바뀐 줄에 걸린 것인지** 확인한다. 기존 문제는 건드리지 않는다
- 권한·상태 분기를 바꿨으면 **경우의 수를 표로 만들어 전부 추적한다.** 화면에 보이는 조건과 서버가 허용하는 조건이 어긋나지 않아야 한다
- 빠진 곳이 있으면 다시 위임하고, 다시 검토한다

검토를 통과하기 전에는 커밋하지 않는다.

# 리팩토링 / DB 스키마 변경 작업 규칙

코드 리팩토링과 DB 스키마 변경을 함께 진행할 때는 아래 순서를 따른다.

1. **코드 및 DB 스키마 확인** — 손대려는 영역의 현재 코드와 관련 테이블 구조를 먼저 파악
2. **계획 수립** — 코드 리팩토링 계획과 DB 변경 계획을 세우고 공유
3. **진행** — 실제 구현. 마이그레이션은 `supabase/`에 SQL 파일로 **작성만** 하고, 실행은 사용자가 Supabase SQL Editor에서 직접 한다. 에이전트에게는 DB 접근 권한이 없으므로(저장소에 자격증명 없음) 임의로 적용하거나 적용된 것으로 가정하지 않는다. 마이그레이션이 아직 적용되지 않은 상태에서도 화면이 500으로 죽지 않고 빈 값으로 뜨도록 코드를 작성한다.
4. **flow 및 문서 작성** — 진행하면서 결정 사항을 그때그때 기록. 다 끝난 뒤 몰아서 쓰지 않기 (이유를 잊어버리기 쉬움)
5. **마이그레이션 정리** — 작업 중엔 새 스키마 변경을 `supabase/`에 가장 큰 번호 다음 번호로 계속 이어 붙인다. 정리는 아래 중 하나가 **실제로 발생했을 때만** 한다 — 새 개발 환경을 세워야 할 때, 순차 실행이 깨질 때, 스키마 파악이 막혀 작업이 지연될 때. 그 전까진 파일이 쌓여도 그대로 둔다. 정리 시점이 오면 라이브 스키마 덤프를 기준으로 `001_user.sql`, `002_franchise.sql`처럼 도메인별 클린 스키마 세트를 새로 작성하고, 기존 번호 매긴 마이그레이션 전체는 삭제하지 않고 `supabase/archive/`로 이동해 운영 반영 이력으로 보존한다. 클린 스키마 세트는 빈 DB를 처음부터 세우는 용도이며 운영 DB에 실행하는 파일이 아니다.

**DB 스키마 변경 원칙**

- 컬럼 삭제/타입 변경보다 추가 위주로 먼저 진행하고, 삭제는 되돌리기 어려우니 가장 마지막에
- 새 컬럼을 붙일 땐 기존 값을 지우지 말고 병행 기간을 둔다. 화면을 새 컬럼으로 다 옮긴 뒤에 옛 값을 정리한다

# 코드 작성 시 주의

**상태값과 권한은 여러 곳에 흩어져 있다.** 하나를 바꾸면 나머지도 같이 봐야 한다.

- 상태 타입·라벨·색상은 `src/types/index.ts`, DB 쪽은 `supabase/`의 `CHECK` 제약. **둘이 어긋나면 저장이 실패한다.** 상태를 더하거나 뺄 땐 양쪽을 함께 고친다
- 상태 변경은 고객 알림톡 발송을 유발한다 (`franchiseStatusEffects.ts` → `solapi.ts`). 상태를 합치거나 없애면 알림톡도 함께 사라지므로 영향을 먼저 확인한다
- 승인 권한은 `approval_role`(cs_manager / cs_responsible / tech_manager / tech_responsible / team_lead)로 갈린다. **버튼 노출 조건과 서버 액션 가드가 항상 같아야 한다.** 한쪽만 고치면 버튼은 보이는데 눌리지 않는다
- `service_role` 키를 쓰는 `lib/supabase/admin.ts`는 RLS를 우회한다. 서버 액션에서 쓸 땐 권한 검사를 코드로 직접 해야 한다

# 커밋

[docs/commit-convention.md](./docs/commit-convention.md)를 따른다.

```
<prefix>: <요약>
- <상세 항목>
```

- 한글, 명사형 종결
- prefix: `feat` `fix` `refactor` `docs` `style` `chore` `test` `design`
- 하나의 커밋은 하나의 목적만. 목적이 다르면 커밋을 나눈다
