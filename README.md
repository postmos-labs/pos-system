<p align="center">
  <img src="public/posmos-mark.svg" width="72" alt="POSMOS" />
</p>

<h1 align="center">POSMOS 운영 관리 시스템</h1>

<p align="center">
  가맹점 접수부터 심사·설치·인터넷 개통·정산까지, 포스모스의 업무 흐름을 한곳에서 처리하는 내부 운영 시스템
</p>

<p align="center">
  <a href="https://pos-system-ten-phi.vercel.app"><img alt="운영 사이트" src="https://img.shields.io/badge/운영_사이트-열기-86BE72?style=flat-square&logo=vercel&logoColor=white" /></a>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=nextdotjs&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript_5-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" />
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=white" />
</p>

---

## 무엇을 하는 시스템인가

CS·기술지원·관리자가 각자의 업무 화면에서 일하고, 그 결과가 가맹점 한 건의 기록으로 모입니다.
접수 → 심사 → 설치 → 개통 → 정산으로 이어지는 흐름에서 **누가·언제·어디까지 처리했는지**가 항상 남습니다.

| 영역         | 화면                                                                                           | 하는 일                                                             |
| ------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **CS 업무**  | CS 대시보드 · 가맹 접수 · 우국상 관리 · 변경 관리 · 인터넷 관리                                | 리드 확인부터 가맹 접수, 서류·VAN·심사 진행, 인터넷 개통까지        |
| **기술지원** | 기술지원 대시보드 · 설치 관리 · 택배 발송 · 기사 페이지 · 완료사진 · 외부 기사 · 재고 · 설계도 | 설치 일정, 기사 배정, 발송, 완료 확인, 재고 실사                    |
| **공통**     | 승인함 · 대시보드 · KPI · CS 리포트 · 캘린더 · 가맹점 360 · 인입내역 · 계약서/서명 · 물품요청  | 팀 간 승인 흐름, 지표, 가맹점 단위 통합 조회, 고객 문의와 계약 서명 |
| **관리**     | 직원 관리 · 활동 로그 · 승인 로그                                                              | 사용자·권한 관리와 감사 기록                                        |

고객이 직접 여는 화면도 있습니다. 전자 서명(`/sign`), 장비 선택(`/equipment-select`), 설치 현황 조회(`/install-status`)는 로그인 없이 링크로 진입합니다.
상태가 바뀌면 카카오 알림톡(Solapi)으로 고객에게 안내가 나갑니다.

## 기술 스택

|            |                                                     |
| ---------- | --------------------------------------------------- |
| 프레임워크 | Next.js 16 (App Router, Turbopack) · React 19       |
| 언어       | TypeScript 5                                        |
| 스타일     | Tailwind CSS 4 · Radix UI · lucide-react            |
| 데이터     | Supabase — Postgres · Row Level Security · Realtime |
| 알림       | Solapi (카카오 알림톡 / SMS)                        |
| 배포       | Vercel (`vercel.json`에 리전과 크론 설정)           |

## 시작하기

```bash
npm install
cp .env.example .env   # Supabase·Solapi 값 채우기
npm run dev
```

http://localhost:3000 에서 확인합니다. 개발용 Supabase 프로젝트 만들기와 환경 변수 설명은
[docs/dev-environment.md](./docs/dev-environment.md)에 있습니다.

| 명령                   | 설명                                   |
| ---------------------- | -------------------------------------- |
| `npm run dev`          | 개발 서버                              |
| `npm run build`        | 프로덕션 빌드                          |
| `npx tsc --noEmit`     | 타입 검사                              |
| `npm run lint`         | 린트                                   |
| `npm run format:check` | 포맷 검사 (커밋 시 lint-staged가 실행) |

`.env` 없이 `npm run build`를 돌리면 페이지 데이터 수집 단계에서 실패합니다. 자격증명 없는 환경에서는 정상이며, 코드 검증은 `tsc --noEmit`으로 봅니다.

## 폴더 구조

```
src/
  app/
    (app)/          로그인 후 화면 — 라우트 하나가 업무 도메인 하나
    api/            라우트 핸들러 (인증 · 계약 · 크론 · 가맹접수 · 설치)
    login/ sign/ equipment-select/ install-status/   비로그인 진입점
  components/       공용 UI
  lib/
    supabase/       client(브라우저) · server(SSR) · admin(service_role)
    auth/           권한 가드
    solapi.ts       알림톡 발송 + 템플릿 매핑
  types/index.ts    도메인 타입 · 상태 라벨 · 상태 색상
supabase/           번호순 마이그레이션 SQL (SQL Editor에서 수동 실행)
docs/feature/       기능별 설계 기록
```

## 데이터베이스

스키마 변경은 `supabase/`에 **번호순 SQL 파일**로 쌓고, Supabase SQL Editor에서 직접 실행합니다.
자동 적용 도구는 쓰지 않으므로 코드는 마이그레이션이 아직 적용되지 않은 환경에서도 빈 값으로 동작해야 합니다.

- 상태값은 `src/types/index.ts`와 SQL의 `CHECK` 제약이 같이 갑니다. 한쪽만 바꾸면 저장이 실패합니다.
- 승인 권한은 `approval_role`로 갈리며, 버튼 노출 조건과 서버 액션 가드를 항상 같게 유지합니다.
- `service_role` 키를 쓰는 서버 액션은 RLS를 우회하므로 권한 검사를 코드에서 직접 합니다.

## 문서

- [개발 환경 세팅](./docs/dev-environment.md)
- [커밋 컨벤션](./docs/commit-convention.md) — `<prefix>: <요약>` 한 줄 + 상세 항목, 한글 명사형
- [기능별 설계 기록](./docs/feature/) — 왜 그렇게 만들었는지를 결정 시점에 남깁니다
- [AGENTS.md](./AGENTS.md) — 코드 작성 시 지켜야 할 규칙

## 배포

`main`에 푸시하면 Vercel이 자동 배포합니다. 리전은 시드니(`syd1`)이고, 가맹접수 알림 크론이 매일 자정(UTC)에 돕니다.
