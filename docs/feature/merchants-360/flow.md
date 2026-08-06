# 가맹점 360도 뷰 흐름

## 조회 흐름

1. `/merchants` 서버 컴포넌트가 로그인 사용자를 확인하고 기존 페이지네이션 목록을 조회한다.
2. `id`가 없으면 현재 페이지의 첫 가맹점을 기본 선택한다. 클라이언트는 선택 시 `router.replace('/merchants?id=...')`로 URL만 갱신한다.
3. 선택된 가맹점의 상세 컬럼과 접수/설치/AS/변경/설치 후 히스토리를 서버에서 조회한다.
4. 각 원본을 `WorkHistoryItem`으로 변환해 날짜 내림차순으로 정렬한다. 우측 패널은 6개 카테고리 탭으로 이 배열을 필터링한다.

## 설치 후 메모 흐름

1. `installations.status`가 `completed` 또는 `delivery_sent`인 행에만 `완료 이후 메모` 버튼을 표시한다.
2. 버튼을 누르면 설치건 ID로 새 테이블을 조회한다. 테이블이 아직 없으면 사용 가능한 메모가 없는 것으로 처리하고 화면 오류를 내지 않는다.
3. 저장 서버 액션은 설치건의 최종 상태를 다시 검증한다.
4. `installations.franchise_application_id`에서 가맹점 ID를 역조회한 후 `installation_post_history`에 `content`, `created_by`, `merchant_id`를 저장한다.
5. 저장 후 `/installs`와 `/merchants`를 재검증한다. 테이블이 아직 없으면 저장은 무동작으로 종료한다.

## 검증 범위

- SQL 마이그레이션은 실행하지 않는다.
- `npx tsc --noEmit`로 타입체크한다.
- `npm run dev`에서 가맹점 검색/선택/페이지 이동, 타임라인 탭, 일괄 삭제 회귀와 설치 최종 상태 메모 버튼을 확인한다.

## 검증 기록

- `tsc --noEmit`: 통과.
- 새로 작성·수정한 핵심 파일 ESLint: 통과.
- `next build`: 최적화 빌드와 TypeScript 단계는 통과했으나, 저장소 `.env`의 Supabase URL/키가 빈 문자열이라 페이지 데이터 수집 단계에서 중단됐다.
- `npm run dev`: 동일한 빈 Supabase 환경값으로 서버 컴포넌트 요청이 500이 되어 로그인 이후 화면을 직접 확인할 수 없었다. 이 검증을 위해 환경값을 채우거나 Supabase에 연결하지 않았으며, SQL 마이그레이션도 실행하지 않았다.

## 2026-08-06 current audit

- Already present: the `/merchants` two-column shell, `?id=` selection, merchant search, detail grid, and the five source queries for reception/install/AS/change/post-history.
- Partial: memo entries were included in `WorkHistoryItem[]` and exposed as extra tabs. Phase 1 removes those memo categories so the work-history tabs are exactly six (`all`, reception, install, AS, change, post-history); Phase 3 owns the independent memo section.
- Unchanged: `supabase/100_installation_post_history.sql` is reused and no Phase 1 migration is created.
