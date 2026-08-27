# KICC 대응 · VAN사 구분과 CS 리포트 흐름

결정 배경은 [decisions.md](./decisions.md) 참고.

---

## 1. VAN사 값이 채워지는 경로

```
가맹접수 등록 ─ VanMultiSelect ─→ franchise_applications.van_company
                                         │
                              (기술지원 이관 시 트리거)
                                         ↓
                                  merchants.van_company
                                  ※ 118 마이그레이션이 기존 213건을 백필
```

- 가맹점 상세에서도 직접 고칠 수 있다 (`MerchantInfoCard`)
- 가맹점 값이 비어 있으면 화면에서는 **연결된 가맹접수 값으로 폴백**한다
  (`MerchantInfoCard`의 `effectiveVanCompany`). 덕분에 백필하지 않은 건도 바로 보인다
- 다만 **목록 필터는 폴백이 안 된다.** 서버에서 걸러야 해서 `merchants.van_company`에 값이
  있어야 한다. 118 백필이 필요했던 이유

## 2. 계열 필터가 걸리는 곳

세 화면 모두 `전체 / 토스계열 / KICC` 카드(가맹점은 좁은 패널이라 세그먼트)를 쓴다.

```
가맹접수   화면에서 필터 ─ 서버가 전체 행을 이미 가져옴
가맹점     ?van= ─→ 서버 필터 + count 3종
설치관리   ?van= ─→ 서버 필터(franchise_applications 조인) + count 3종
```

- 판정: `KICC` 포함 여부. 쉼표로 여러 개인 값도 처리된다
- 목록 각 행의 배지는 `VanBadge` 공용 컴포넌트 — 토스계열 파랑, KICC 초록
- 설치관리 조인은 **필터가 걸렸을 때만 `!inner`**. 전체 조회에 `!inner`를 쓰면 가맹접수와
  연결되지 않은 설치건이 사라진다

## 3. CS 기록이 쌓이는 경로

```
가맹점 상세 ─ 메모 히스토리 ─ 유형 선택
                                │
                       AS · 클레임이면
                                ↓
              무엇이 문제였나 / 어떻게 해결했나 / 처음인가
                                │
                    셋 다 골라야 저장 버튼 활성화
                                ↓
              merchant_memo_entries
                (issue_category, resolution, is_repeat)
```

- 일반·기타 유형에서는 묻지 않고 `null`로 저장된다
- 기본값이 없다. 자동으로 값이 들어가면 보고서가 거짓말이 된다
- 마이그레이션 미적용 환경에서는 신규 3필드를 뺀 채 저장이 재시도된다

## 4. 리포트가 만들어지는 경로

```
/cs-report?month=YYYY-MM&van=toss|kicc
        │
        ├─ merchants        ─ 관리 가맹점 수 (계열 필터 적용)
        ├─ merchant_memo_entries ─ 이번 달 + 전월 (as·claim만 집계 대상)
        └─ merchant_equipment    ─ status='as' → 교체 필요 장비
                    │
                    ↓
          lib/csReport.ts  computeCsReportMetrics()
                    │
                    ↓
   총 CS · 원격 해결률 · 출장 · 전월 대비 · 반복 장애 상위 5
   장애 유형별 · 해결 방식별 · 개선 필요 브랜드 · 미입력 건수
                    │
                    ↓
              엑셀 내려받기 (4시트)
```

집계 함수는 DB 접근이 없는 순수 함수다. 조회는 `page.tsx`가 하고 계산만 넘긴다.

**조회는 1000행씩 끝까지 읽는다.** 한 번에 다 가져오면 Supabase 상한에 걸려 숫자가 조용히 줄고,
그 숫자를 KICC에 보내게 된다.

### 안전장치

| 상황           | 화면                               |
| -------------- | ---------------------------------- |
| 조회 실패      | 빨간 배너 + **내려받기 버튼 숨김** |
| 117 미적용     | 노란 배너 + 내려받기 버튼 숨김     |
| 분모 0         | `0%`가 아니라 `-`                  |
| 미입력 건 있음 | 경고 카드로 건수 표시              |

## 5. 알림이 나가는 경로

```
매일 KST 09:00
        │
Vercel Cron ─ Authorization: Bearer $CRON_SECRET
        │
/api/cron/franchise-alerts
        │
        ├─ open_date가 오늘+7 / +3 / +1  ─→ 그 건의 CS·영업 담당자
        └─ updated_at 7일 경과 & 진행 중  ─→ 그 건의 CS·영업 담당자
                    │
        한 사람이 여러 건을 담당하면 한 통으로 묶음
                    │
                    ↓
              notifications 생성
              notification_logs로 사용자별 하루 1회 제한
```

- 이전에는 **가맹접수 화면을 열 때** 생성돼서, 아무도 안 열면 알림이 아예 안 갔다
- 수신자가 "화면을 연 사람"에서 "각 건의 담당자"로 바뀌었다. 관리자·마스터도 자기가 담당인
  건만 받는다 — 전체를 받으면 매일 수십 건이라 오히려 안 보게 된다
- 장기 미처리 제외 상태: `card_done` `internet_done` `completed` `canceled` `hold`
  `persistent_absence`. 끝났거나 의도적으로 멈춰둔 건에 매일 알림을 보내지 않는다
- `CRON_SECRET`이 없으면 401로 막힌다 — 값이 설정돼야 알림이 나간다

## 6. 관련 파일

| 파일                                         | 역할                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `src/types/index.ts`                         | `VAN_COMPANIES` · `VanGroup` · `VAN_GROUP_LABEL` · `KICC_VAN_COMPANY` |
| `src/components/ui/VanBadge.tsx`             | 목록 배지 — 계열 판정과 색을 여기서만 정한다                          |
| `src/app/(app)/merchants/merchant360.ts`     | CS 지표 타입·라벨 · `REMOTE_RESOLUTIONS`                              |
| `src/lib/csReport.ts`                        | 집계 순수 함수                                                        |
| `src/app/(app)/cs-report/`                   | 리포트 화면 + 엑셀 내보내기                                           |
| `src/app/api/cron/franchise-alerts/route.ts` | 매일 도는 알림                                                        |
| `supabase/117` · `118`                       | 컬럼 추가 · 가맹점 VAN사 백필                                         |
| `supabase/119` · `120`                       | CRM 과거 데이터 이관 (보류 중)                                        |
