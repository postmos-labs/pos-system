# 코드베이스 전체 오류 검토 보고서

- 검토일: 2026-07-30
- 검토 방법: `tsc --noEmit`, `eslint .`, `npm audit`, 주요 API 라우트/인증 흐름 수동 리뷰
- 검토 대상: 전체 저장소 (`src/`, `supabase/`, `scripts/`)

> 참고: 저장소가 별도의 `docs/00-pm`~`04-report` PDCA 문서 세트를 아직 사용하지 않는 프로젝트라서, 이 보고서는 PDCA `analyze` 문서 형식이 아닌 일반 감사(audit) 보고서 형식으로 작성했습니다.

## 1. 요약

| 항목                                  | 결과                                            |
| ------------------------------------- | ----------------------------------------------- |
| TypeScript 타입 체크 (`tsc --noEmit`) | ✅ 오류 없음                                    |
| ESLint                                | ❌ 169 errors, 94 warnings (총 263건)           |
| `npm audit`                           | ❌ Critical 1건, High 10건 (모두 의존성 패키지) |
| 인증/보안 수동 리뷰                   | ⚠️ 이슈 3건 발견 (아래 4장)                     |

전반적으로 **타입 시스템 자체는 깨져 있지 않지만**, `any` 타입 남용과 React Hook 규칙 위반이 다수 누적되어 있고, 인증이 없는 API 라우트 중 하나는 실제 악용 가능한 문제로 보입니다.

## 2. TypeScript 타입 체크

`npx tsc --noEmit` 실행 결과 컴파일 오류 없음. 타입 정의 자체는 안정적입니다.

## 3. ESLint 정적 분석

### 3.1 규칙별 집계 (전체 263건)

| 규칙                                       |  건수 | 심각도  | 의미                                                                                       |
| ------------------------------------------ | ----: | ------- | ------------------------------------------------------------------------------------------ |
| `@typescript-eslint/no-explicit-any`       |   122 | error   | `any` 타입 사용 — 타입 안정성 저하                                                         |
| `@typescript-eslint/no-unused-vars`        |    52 | warning | 미사용 변수/함수                                                                           |
| `react-hooks/set-state-in-effect`          |    22 | error   | `useEffect` 내부에서 렌더링 직후 동기적으로 `setState` 호출 → 불필요한 리렌더 캐스케이드   |
| `react-hooks/exhaustive-deps`              |    21 | warning | `useEffect`/`useCallback` 의존성 배열 누락                                                 |
| `@typescript-eslint/no-unused-expressions` |    12 | warning | `cond ? a() : b()` 형태를 문장으로 사용 (대부분 `if/else`로 교체하면 해결되는 스타일 이슈) |
| `react-hooks/static-components`            |    11 | error   | 렌더 함수 내부에서 컴포넌트를 매 렌더마다 새로 정의 → **성능 문제** (아래 3.3-(5))         |
| `react/use` / `react-hooks/refs`           | 8 / 8 | error   | React 19 규칙(Hook 규칙, ref 접근 시점) 위반                                               |
| `@next/next/no-img-element`                |     8 | warning | `<img>` 대신 `next/image` 권장                                                             |
| `react-hooks/purity`                       |     6 | error   | 렌더링 중 `Date.now()` 등 비순수 함수 호출                                                 |

### 3.2 오류가 집중된 파일 (상위)

| 파일                                                                    |                               이슈 수 |
| ----------------------------------------------------------------------- | ------------------------------------: |
| `src/app/(app)/franchise/FranchiseClient.tsx`                           |           26+ (다른 위치 포함 시 40+) |
| `src/app/(app)/blueprints/[id]/BlueprintEditor.tsx`                     |                                    25 |
| `src/app/(app)/installs/InstallsClient.tsx`                             |                                    32 |
| `src/app/(app)/tickets/[id]/page.tsx`                                   |                                    11 |
| `src/app/(app)/dashboard/ExcelDownloadButton.tsx`, `dashboard/page.tsx` |                                    20 |
| `src/app/(app)/woo/WooClient.tsx`                                       | 다수 (`set-state-in-effect` 5건 포함) |

대형 클라이언트 컴포넌트(`*Client.tsx`)에 이슈가 집중되어 있습니다. 파일당 코드량이 많고 `useEffect` 안에서 파생 상태를 `setState`로 동기화하는 패턴이 반복되는 것이 근본 원인입니다.

### 3.3 실제 버그로 이어질 수 있는 항목 (우선순위 높음)

**(1) `react-hooks/set-state-in-effect` — 22건**
`useEffect` 안에서 즉시 `setState`를 호출해 필터/페이지 상태를 "동기화"하는 패턴이 여러 화면에 반복됩니다. 예:

- `src/app/(app)/woo/WooClient.tsx:476` — 검색어/필터가 바뀌면 `setPage(1)`
- `src/app/(app)/woo/WooClient.tsx:497` — `page > totalPages`일 때 `setPage(totalPages)`
- `src/components/layout/ThemeToggle.tsx:29` — 마운트 시 `localStorage`에서 읽은 테마를 `setTheme`

이런 값들은 대부분 `useMemo`로 렌더 중에 직접 계산 가능한데, `useEffect`로 우회하면서 마운트 시 한 번 더 리렌더가 발생하고(깜빡임/초기 레이아웃 시프트 가능), 의존성 배열 누락 시 동기화가 어긋날 위험이 있습니다.

- **개선 시 리스크**: `useEffect` → `useMemo`/렌더 중 계산으로 바꾸면 실행 "타이밍"이 달라집니다. 예를 들어 `WooClient.tsx`의 `setPage(1)`을 렌더 중 계산으로 바꾸면 페이지 상태와 필터 상태가 분리되어 있던 기존 흐름이 바뀌면서, 다른 `useEffect`(하이라이트 이동, 스크롤 등)와의 실행 순서가 꼬여 회귀가 날 수 있습니다. 파일 하나당 화면 전체(검색/필터/페이지네이션)를 다시 수동 QA해야 하는 범위이며, 대상 파일이 6개 화면(`Woo`, `Installs`, `Franchise`, `Transfers`, `Internet`, `Changes`)에 걸쳐 있어 한 번에 다 고치기보다 화면 단위로 나눠 하나씩 고치고 검증하는 것을 권장합니다.

**(2) `react-hooks/purity` — 6건 (렌더 중 `Date.now()` 호출)**

- `src/app/(app)/layout.tsx:36-37` — 서버 컴포넌트 본문에서 `new Date(Date.now() + ...)`로 오늘 날짜 범위를 계산. 서버 컴포넌트이므로 실질적 부작용은 크지 않지만, React 19 purity 규칙 위반으로 향후 캐싱/프리렌더링 최적화 시 문제가 될 수 있습니다.
- `src/components/layout/ScheduleAlertBanner.tsx:66` — 클라이언트 이벤트 핸들러(`dismiss`) 내부라 실질 위험은 낮음(렌더 함수가 아님), 다만 ESLint 규칙상 함수 컴포넌트 스코프 전체를 순수 함수로 취급해 플래그됨.
- **개선 시 리스크**: 낮음. `layout.tsx`는 서버 컴포넌트라 값을 `props`로 넘기거나 요청 시작 시점에 한 번만 계산하도록 옮기면 되고, 동작 자체는 바뀌지 않습니다. 다만 날짜 경계값(`todayStr`, `limitStr`) 계산 위치를 옮길 때 타임존 처리가 기존과 동일한지 확인이 필요합니다.

**(3) `@typescript-eslint/no-explicit-any` — 122건**
API 라우트와 `FranchiseClient.tsx`, `InstallsClient.tsx` 등에 집중. 특히 API 라우트의 `catch (e: any)` 패턴이 반복되어 에러 객체의 실제 shape을 보장하지 못합니다 (`src/app/api/contracts/create/route.ts:65`, `notify/route.ts:44`, `sign/route.ts:128`, `franchise/equipment-select/route.ts:24`, `franchise/notify/route.ts:35`, `installs/schedule-request/route.ts:55` 등).

- **개선 시 리스크**: API 라우트의 `catch (e: any)` → `catch (e: unknown)` 전환은 기계적이지만, `e.message`처럼 바로 접근하던 코드가 타입 가드(`e instanceof Error`) 없이는 컴파일 에러가 나므로 각 라우트를 하나씩 손으로 고쳐야 합니다. 컴포넌트 쪽의 `any`(Supabase 조회 결과를 캐스팅하는 곳 등)는 실제 타입을 좁히는 과정에서 지금까지 눈에 안 띄던 타입 불일치가 드러날 수 있어, 122건을 한 번에 몰아치기보다 API 라우트 → 공용 유틸 → 화면 컴포넌트 순으로 단계적으로 진행하는 것을 권장합니다.

**(4) `@typescript-eslint/no-unused-vars` — `src/app/api/auth/login/route.ts:11` (`password`)**
린트 경고 자체는 사소하지만, 이 경고가 실제로는 4장의 보안 이슈(로그인 API가 비밀번호를 검증하지 않음)를 가리키는 신호였습니다. 아래 4.1 참고.

**(5) `react-hooks/static-components` — 11건, 성능 문제 (전부 한 파일에 집중)**

`src/app/(app)/tickets/[id]/TicketInfoEdit.tsx:77` — 부모 컴포넌트 본문 안에서 `function StatusDot({ field }) { ... }`를 정의하고, 같은 파일 안 11곳(93, 112, 135, 157, 172, 195, 210, 227, 250, 273, 289번 줄)에서 `<StatusDot field="..." />`로 사용하고 있습니다.

```tsx
function TicketInfoEdit(...) {
  ...
  function StatusDot({ field }: { field: string }) {   // 렌더될 때마다 새로 정의됨
    if (saving === field) return <span>저장중...</span>;
    ...
  }

  return (
    <div>
      사업자 구분 <StatusDot field="business_type" />   // React가 매번 "새로운 컴포넌트 타입"으로 인식
      ...
    </div>
  );
}
```

`TicketInfoEdit`이 리렌더될 때마다 `StatusDot`이라는 새 함수(= React 입장에서는 매번 다른 컴포넌트 타입)가 만들어지므로, React는 이전 `StatusDot` 서브트리를 통째로 언마운트하고 새로 마운트합니다. 필드 11개 모두 저장 상태(`saving`/`saveError`/`saved`)가 조금이라도 바뀔 때마다 이 화면 전체에서 이 현상이 반복되어, `set-state-in-effect`보다 체감 성능 영향이 더 클 수 있는 항목입니다.

- 권장: `StatusDot`을 `TicketInfoEdit` 바깥으로 꺼내고, `saving`/`saveError`/`saved` 값을 `field`와 함께 props로 전달.
- **개선 시 리스크**: 낮음 — 원인이 파일 하나, 컴포넌트 하나로 좁게 특정되어 있어 다른 항목들보다 고치기 쉽고 회귀 범위도 작습니다. 다만 `StatusDot`이 클로저로 참조하던 `saving`/`saveError`/`saved`/`canEdit` 등을 모두 props로 넘기도록 호출부 11곳을 함께 수정해야 하며, 하나라도 빠뜨리면 해당 필드만 저장 상태 표시가 깨질 수 있으니 11곳 모두 수정 후 각 필드 저장 시나리오를 훑어보는 것을 권장합니다.

## 4. 보안 수동 리뷰

정적 분석으로 잡히지 않는 인증/인가 흐름을 API 라우트 9개 전수 확인했습니다.

### 4.1 [High] 로그인 API의 이름→이메일 열거(enumeration) 가능

`src/app/api/auth/login/route.ts`

```
const { name, password } = await req.json();   // password를 받지만 전혀 검증하지 않음
...
const { data: profile } = await supabaseAdmin.from("profiles").select("id").eq("name", name).single();
...
return NextResponse.json({ email: userData.user.email });
```

이 라우트는 `name`만으로 프로필을 조회해 해당 사용자의 **이메일 주소를 그대로 반환**합니다. 비밀번호 검증은 클라이언트(`src/app/login/page.tsx`)가 반환된 이메일로 `supabase.auth.signInWithPassword`를 호출할 때 비로소 이루어지므로 설계 자체는 "이름→이메일 조회 후 클라이언트에서 로그인"이라는 의도로 보이지만, **이 API 자체에는 아무 인증/속도 제한이 없어** 누구나 임의의 `name`을 넣어 사내 직원의 이메일을 알아낼 수 있고, 존재하지 않는 이름은 400을 반환하므로 유효한 이름 목록을 완전탐색으로 수집(enumeration)할 수도 있습니다.

- 권장: 이름 존재 여부와 무관하게 항상 동일한 응답 형태를 반환하거나, rate limit을 걸거나, 이 조회 자체를 서버가 대신 로그인까지 수행하는 구조로 바꿔 이메일을 클라이언트에 노출하지 않는 것을 권장합니다.
- **개선 시 리스크**: 전 직원이 매일 사용하는 로그인 경로 자체를 수정하는 것이라 **영향 범위가 가장 큼**. 응답 스펙(예: `{ email }` → 서버가 직접 로그인 처리하는 구조로 변경)을 바꾸면 `src/app/login/page.tsx`도 함께 수정해야 하며, 배포 타이밍이 어긋나면 전사 로그인 장애로 이어질 수 있습니다. dev Supabase 프로젝트에서 먼저 로그인 성공/실패/오탈자 시나리오를 모두 검증한 뒤 반영해야 합니다(`AGENTS.md`의 dev 우선 검증 규칙 참고).

### 4.2 [Medium] 계약서 알림 API가 인증/토큰 검증 없이 임의 번호로 SMS 발송 가능

`src/app/api/contracts/notify/route.ts`

이 라우트는 세션 인증도, `contracts/sign`처럼 만료되는 서명 토큰 검증도 하지 않습니다. `contractId`가 실제 존재하고 `signature_zones`가 채워져 있기만 하면, 요청 바디에 담긴 `signerPhone`/`signerName`/`contractTitle`을 그대로 사용해 Solapi로 SMS를 발송합니다(`sendSignRequest`/`sendSignComplete`). 즉:

- `signerPhone`이 실제 계약서의 서명자 전화번호인지 서버가 검증하지 않음 → 임의의 전화번호로 회사 발신번호를 이용한 SMS 스팸/피싱 문구 발송에 악용될 수 있음(비용 소모 + 발신자 평판 훼손 리스크).
- `contractId`만 알면(또는 추측하면) 누구나 호출 가능.

- 권장: 요청에 `sign_token`(계약서의 `sign_token`)을 함께 받아 서버에서 `contractId`와 매칭 검증, 혹은 이 엔드포인트를 세션 인증이 필요한 내부 전용으로 제한하고 서명자 정보는 DB에서 직접 조회.
- **개선 시 리스크**: 검증을 추가하면 이 API를 호출하는 프론트(계약서 상세/발송 화면)도 `sign_token`을 함께 넘기도록 같이 수정해야 하며, 누락 시 정상적인 서명 요청 SMS까지 막힐 수 있습니다. SMS는 Solapi 실제 발송(과금) API라 dev 환경에서 테스트할 때도 실제 문자가 나갈 수 있으니 테스트용 번호로만 검증하거나 Solapi 호출을 모킹해서 확인해야 합니다.

### 4.3 [Low] 초기 계정 생성 시 기본 비밀번호가 고정값(`"1234"`)

`src/app/api/setup/users/route.ts:33` — `requireAdmin()`으로 보호되어 있어 관리자만 호출 가능하지만, 생성되는 모든 계정의 초기 비밀번호가 `"1234"`로 고정됩니다. 최초 로그인 시 비밀번호 변경을 강제하는 로직이 없다면 약한 기본 비밀번호가 방치될 수 있습니다.

- 권장: 임시 비밀번호를 계정별로 랜덤 생성하거나, 최초 로그인 시 비밀번호 변경을 강제.
- **개선 시 리스크**: 비밀번호 변경 강제 플로우를 추가하면 4.1의 로그인 경로를 다시 건드리게 되므로 두 작업을 함께 계획하는 것이 안전합니다. 이미 `"1234"`로 생성되어 운영 중인 기존 계정과의 정책 정합성(소급 적용 여부)도 별도로 결정해야 합니다.

### 4.4 그 외 확인한 항목 (문제 없음)

- 라우트 그룹 `(app)/layout.tsx`에서 서버 컴포넌트 레벨로 `supabase.auth.getUser()` 체크 후 미인증 시 `/login`으로 리다이렉트 — 별도 `middleware.ts`는 없지만 그룹 레이아웃으로 보호되는 구조는 유효합니다.
- `contracts/sign`, `franchise/equipment-select`, `installs/schedule-request`는 세션 인증 대신 만료 가능한 토큰(`sign_token`, `equipment_select_token`, `status_token`)으로 보호되는 의도된 공개 라우트로 확인됨. 문제 없음.
- `dangerouslySetInnerHTML` 사용처는 `src/app/layout.tsx` 1곳뿐이며 사용자 입력이 아닌 정적 스크립트/JSON-LD로 보여 XSS 위험 없음.
- `eval()` 사용 없음.

## 5. 의존성 취약점 (`npm audit`)

Critical 1건, High 10건 (모두 devDependency 또는 next의 전이 의존성):

| 패키지                                  | 심각도   | 비고                                                                                  |
| --------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| `tar`                                   | Critical | 하드링크 경로 순회를 통한 임의 파일 생성/덮어쓰기 — `npm audit fix`로 해결 가능       |
| `next` (16.2.9 → 권장 16.2.12+)         | High     | SSRF, 캐시 혼동, Server Action DoS 등 다수 — `npm audit fix --force`로 상위 버전 필요 |
| `postcss`, `sharp` (next의 전이 의존성) | High     | `next` 업그레이드에 종속                                                              |
| `js-yaml`                               | High     | 병합 키 체인으로 인한 CPU 소모 — `npm audit fix`로 해결 가능                          |
| `brace-expansion`                       | High     | 정규식 확장 DoS — `npm audit fix`로 해결 가능                                         |

- 즉시 조치 가능: `npm audit fix` (tar, js-yaml, brace-expansion 해결)
- 검토 후 조치: `next`를 16.2.12 이상으로 올리는 것 (breaking change 가능성 있어 `--force` 필요, 별도 회귀 테스트 권장)

**개선 시 리스크**:

- `npm audit fix`(비-force)는 patch/minor 범위 내 업데이트라 상대적으로 안전하지만, 그래도 `package-lock.json`이 바뀌므로 설치 후 `npm run build`가 정상 통과하는지 확인이 필요합니다.
- `next` 업그레이드(`--force`, 16.2.9 → 16.2.12)는 `serverExternalPackages`, `outputFileTracingIncludes`로 커스텀 설정된 `@napi-rs/canvas`/`pdfjs-dist` 번들링(계약서 서명 PDF 렌더링에 사용, `/sign/[token]` 경로)에 영향을 줄 수 있어, 업그레이드 후 반드시 서명 페이지(PDF 로드·서명 합성) 회귀 테스트가 필요합니다. `postcss`/`sharp`는 `next`에 종속되어 있어 별도로 손댈 수 없고 `next` 업그레이드에 묶여서 같이 올라갑니다.

## 6. 권장 조치 우선순위 및 리스크 요약

| 우선순위 | 조치                                                                                      | 근거    | 개선 시 리스크                                                                                                                                    | 영향 범위                                              |
| -------- | ----------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1        | `api/auth/login` 이메일 열거 문제 수정                                                    | 4.1     | **높음** — 전 직원이 쓰는 로그인 경로. 응답 스펙 변경 시 프론트(`login/page.tsx`) 동시 수정 필요, 배포 실수 시 전사 로그인 장애                   | 전사                                                   |
| 2        | `api/contracts/notify` 토큰 검증 추가                                                     | 4.2     | 중간 — 프론트의 발송 호출부도 함께 수정 필요, SMS 실발송 API라 테스트 시 과금/오발송 주의                                                         | 계약서 서명 플로우                                     |
| 3        | `npm audit fix` + `next` 업그레이드                                                       | 5장     | 중간 — `next` 업그레이드는 canvas/pdfjs 관련 서명 PDF 렌더링 회귀 가능성, 별도 회귀 테스트 필요                                                   | 서명 페이지 + 빌드 전체                                |
| 4        | `react-hooks/set-state-in-effect` 22건 리팩터링                                           | 3.3-(1) | 중간 — 상태 동기화 타이밍이 바뀌면서 다른 `useEffect`와 실행 순서가 꼬일 수 있음, 화면 6개에 걸쳐 있어 화면 단위 순차 진행 권장                   | Woo/Installs/Franchise/Transfers/Internet/Changes 화면 |
| 5        | `react-hooks/static-components` 11건 — `StatusDot` 컴포넌트를 렌더 밖으로 이동 (**성능**) | 3.3-(5) | 낮음 — 원인이 파일 1개·컴포넌트 1개로 좁게 특정됨. 다만 호출부 11곳 모두 props 전달로 함께 고쳐야 하며 누락 시 일부 필드 저장 표시만 깨질 수 있음 | `TicketInfoEdit.tsx` 1개 파일                          |
| 6        | API 라우트 `catch (e: any)` → `unknown` 전환                                              | 3.3-(3) | 낮음~중간 — 기계적이지만 타입 가드 누락 시 컴파일 에러, 화면 쪽 `any`는 숨어있던 타입 불일치를 드러낼 수 있음                                     | API 라우트 우선, 이후 컴포넌트                         |
| 7        | 미사용 변수/표현식 정리 (`eslint --fix`)                                                  | 3.1     | 낮음 — 다만 자동 삭제 후 diff를 반드시 확인(디버깅용으로 남겨둔 변수가 섞여 있을 수 있음)                                                         | 전역, 국소적                                           |
| 8        | `setup/users` 기본 비밀번호 랜덤화                                                        | 4.3     | 중간 — 1번(로그인 경로) 작업과 맞물릴 수 있어 함께 계획, 기존 `"1234"` 계정과의 정책 정합성 결정 필요                                             | 신규 계정 생성 플로우                                  |

전반적으로 **1~2번(보안)이 리스크는 크지만 변경 범위는 좁고**, **4번(Hook 리팩터링)은 리스크는 중간이지만 변경 범위가 넓어** 화면별로 쪼개서 진행하는 것이 안전합니다. `AGENTS.md`의 작업 규칙대로 dev Supabase 프로젝트에서 먼저 검증한 뒤 운영에 반영하는 순서를 권장합니다.

## 7. 재현 방법

```bash
npx tsc --noEmit
npx eslint .
npm audit
```
