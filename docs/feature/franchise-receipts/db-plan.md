# franchise-receipts — DB 변경 계획 (1차 배치, 090번대)

> 2026-07-27 논의 확정본. 다음 마이그레이션 파일 작성 시 이 문서 기준으로 진행.
> 2차 배치(equipment/토큰 관계 분리)는 `/api/franchise/equipment-select` 라우트 flow 점검 후 별도 진행 — 이번 배치 범위 아님.
> 테이블명(franchise_applications 등) 변경은 이번엔 안 함 — 다른 기능들이 테이블명/FK를 직접 참조하는 지점이 많아 리스크 대비 이득이 낮다고 판단, 전체 안정화 후 별도 마이그레이션으로 분리.

## 1. codes (공통코드 테이블, 신규)

```sql
CREATE TABLE codes (
  group_code  text NOT NULL,
  code        text NOT NULL,
  label       text NOT NULL,
  sort_order  integer,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_code, code),
  UNIQUE (code)
);
```

시드 데이터 (group_code / code / label):

- `RECEPTION_CHANNEL` / `DIRECT_SALES` / 직접 영업
- `RECEPTION_CHANNEL` / `TOSS_LEAD` / 토스 리드
- `CASE_TYPE` / `NEW` / 신규
- `CASE_TYPE` / `CONVERT` / 전환
- `CASE_TYPE` / `SUCCESSION` / 승계
- `CASE_TYPE` / `NAME_CHANGE` / 명변
- `FRANCHISE_OPTION` / `RENTAL` / 렌탈
- `FRANCHISE_OPTION` / `INSTALLMENT` / 할부
- `VAN_COMPANY` / (기존 4개사 코드화 — 실제 코드값은 마이그레이션 작성 시 확정)

franchise 도메인 전용이 아니라 이후 다른 페이지 리팩토링 때도 group_code만 추가해서 재사용하는 공용 테이블.

## 2. franchise_applications 변경

### rename (legacy 보존)

```sql
ALTER TABLE franchise_applications RENAME COLUMN reception_date     TO reception_date_legacy;
ALTER TABLE franchise_applications RENAME COLUMN reception_channel  TO reception_channel_legacy;
ALTER TABLE franchise_applications RENAME COLUMN van_company        TO van_company_legacy;
```

### 신규 컬럼

```sql
ALTER TABLE franchise_applications ADD COLUMN reception_date            date;
ALTER TABLE franchise_applications ADD COLUMN reception_channel_code    text REFERENCES codes(code);
ALTER TABLE franchise_applications ADD COLUMN case_type_code            text REFERENCES codes(code);
ALTER TABLE franchise_applications ADD COLUMN option_code               text REFERENCES codes(code);
ALTER TABLE franchise_applications ADD COLUMN original_application_id   uuid REFERENCES franchise_applications(id);
ALTER TABLE franchise_applications ADD COLUMN van_company_codes         text[] NOT NULL DEFAULT '{}';
ALTER TABLE franchise_applications ADD COLUMN updated_by                uuid REFERENCES profiles(id);
ALTER TABLE franchise_applications ADD COLUMN deleted_at                timestamptz;

ALTER TABLE franchise_applications ADD CONSTRAINT case_type_requires_origin
  CHECK (case_type_code = 'NEW' OR case_type_code IS NULL OR original_application_id IS NOT NULL);
```

### updated_by / updated_at 자동화 트리거

```sql
CREATE OR REPLACE FUNCTION set_updated_meta()
RETURNS trigger AS $$
BEGIN
  NEW.updated_by = auth.uid();
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER franchise_applications_set_updated_meta
  BEFORE UPDATE ON franchise_applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_meta();
```

(부수 효과: 지금까지 `updated_at`이 앱 코드가 명시적으로 넣어줘야만 갱신되던 걸 자동화 — 누락 버그 예방)

### 소프트 삭제용 뷰

```sql
CREATE VIEW franchise_applications_active AS
  SELECT * FROM franchise_applications WHERE deleted_at IS NULL;
```

평소 조회는 이 뷰로 전환 (코드 작업은 "진행" 단계에서, 아래 후속 작업 참고).

### 이번엔 안 건드림 — 최종 정리 단계 drop 후보

`equipment`(미사용 확정), `program`(미사용 확정), `install_date`(UI 제거 예정, 컬럼 유지), `sort_order`(수동정렬 UI 죽음, 미사용 확정), `doc_template`(쓰기만 하고 아무도 안 읽음, 미사용 확정) — 컬럼은 남겨두되 코드에서 참조 제거, 안정화 후 한 번에 drop.

### 이번엔 안 건드림 — 2차 배치 (equipment-select 라우트 점검 후)

`equipment_items`, `equipment_select_token`, `selected_equipment`, `equipment_selected_at`

### 이번엔 안 건드림 — 그대로 유지

`memo` (franchise_application_memos로 이관 예정이나 원본은 audit용으로 보존)

## 3. franchise_application_memos (신규)

```sql
CREATE TABLE franchise_application_memos (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  franchise_application_id    uuid NOT NULL REFERENCES franchise_applications(id) ON DELETE CASCADE,
  user_id                      uuid REFERENCES profiles(id),
  content                       text NOT NULL,
  pinned_at                      timestamptz,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                       timestamptz NOT NULL DEFAULT now(),
  deleted_at                        timestamptz
);
```

- `pinned_at`: null=미고정, 값 있음=고정된 시각 (boolean 컬럼 별도로 안 둠 — 상태 불일치 가능성 제거)
- `deleted_at`: 소프트 삭제, 조회 시 항상 `WHERE deleted_at IS NULL`

install 이관 시 `installations.notes`에는 지금처럼 이관 시점 텍스트 스냅샷 1회 복사만 함 (실시간 동기화 아님) — 소스만 memo 블롭 파싱 대신 이 테이블 조회로 바뀜. `installations` 테이블 자체는 이번엔 안 건드림.

## 4. 후속 작업 (마이그레이션과 별도, "진행" 단계)

1. 백필: `reception_channel_legacy` → `reception_channel_code`/`case_type_code`/`option_code`, `van_company_legacy`(콤마 문자열) → `van_company_codes`(배열), 기존 `memo` 블롭 → `franchise_application_memos` row (기존 `parseMemoEntries` 로직 재사용)
2. `actions.ts`의 `deleteFranchiseRows`: 실제 DELETE → `UPDATE ... SET deleted_at = now()`로 교체
3. `franchise_applications`를 조회하는 모든 지점(`page.tsx` 포함, 다른 기능에서 조회하는 곳 있는지도 재확인)을 `franchise_applications_active` 뷰로 전환하거나 `deleted_at IS NULL` 조건 추가
4. 코드 레벨 정리(죽은 컴포넌트/함수 삭제, `src/features/franchise-receipts/`로 이동)와 순서 조율 필요
