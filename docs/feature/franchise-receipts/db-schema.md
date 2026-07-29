# DB 스키마 변경 초안 (미적용, 검토 단계)

> 실제 마이그레이션 파일은 아직 만들지 않음. 설계 확정 후 `supabase/090_...sql`부터 이어 붙일 예정
> (단, `feat/franchise-receipts` 브랜치가 이미 090을 쓰고 있어 번호 조율 필요 — decisions.md 참고).
> 관련 논의: [flow.md](./flow.md)

## 원칙: 순수 추가(additive-only), 기존 컬럼은 건드리지 않음

- 기존 `reception_channel` 컬럼은 **rename도, reset도, 값 백필도 하지 않는다.** 운영 단계 데이터라
  이런 마이그레이션은 공수/리스크 대비 이득이 낮다는 판단 (사용자 확인, 2026-07-28).
- 새 개념(채널/구분/옵션/매장연결/이전값스냅샷)은 전부 **새 컬럼**으로 추가한다. 기존 `reception_channel`
  값이 있는 과거 row는 새 컬럼이 전부 `NULL`인 채로 영원히 남아도 문제 없음 — 이미 완료된 이력 데이터이고,
  새 로직(매장 트리거 등)은 `case_type`이 아니라 `merchant_id` 유무만으로 동작하므로 과거 row의 동작은
  지금과 동일하게 유지된다 (아래 트리거 참고).
- 헷갈리지 않게, 새 컬럼 이름은 `feat/franchise-receipts` 브랜치가 이미 쓰고 있는 이름
  (`reception_channel_code`, `case_type_code` 등)과 겹치지 않게 짓는다.

## franchise_applications

```sql
-- 신규 컬럼만 추가. 기존 reception_channel/status/기타 컬럼은 무변경.
ALTER TABLE franchise_applications
  ADD COLUMN IF NOT EXISTS channel TEXT,              -- direct_sales / toss_lead
  ADD COLUMN IF NOT EXISTS case_type TEXT,            -- new / conversion / succession / name_change
  ADD COLUMN IF NOT EXISTS is_rental BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_installment BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_snapshot JSONB;

ALTER TABLE franchise_applications
  ADD CONSTRAINT franchise_applications_channel_check
  CHECK (channel IS NULL OR channel IN ('direct_sales', 'toss_lead'));

ALTER TABLE franchise_applications
  ADD CONSTRAINT franchise_applications_case_type_check
  CHECK (case_type IS NULL OR case_type IN ('new', 'conversion', 'succession', 'name_change'));
```

과거 row는 `channel`/`case_type`/`merchant_id`가 전부 `NULL`인 채로 남는다. 새 폼으로 들어오는 건부터
값이 채워진다. 이 건들을 나중에 리포팅용으로 채워 넣고 싶어지면(선택사항), 그건 별도 배치 작업이지
이번 마이그레이션의 필수 조건이 아니다.

### `previous_snapshot` — 변경 이력을 "작업 단위" 자체에 명시적으로 저장

`case_type ≠ new`인 접수 건을 만들 때(=merchant를 검색해서 `merchant_id`를 지정하는 바로 그 시점),
그 merchant의 **연결 직전 값**을 스냅샷으로 떠서 같이 저장한다. 화면에서 이전 건과 비교해서 diff를 계산하는
방식은 채택하지 않는다 — 그 접수 건 row 하나만 봐도 "무엇에서 무엇으로 바뀐 작업인지"가 바로 드러나야 하기 때문.

```json
{
  "business_name": "이전 상호명",
  "owner_name": "이전 대표자명",
  "business_number": "이전 사업자번호",
  "phone": "이전 연락처",
  "address": "이전 주소"
}
```

- 새 값은 그 접수 건 자신의 `business_name`/`owner_name`/... 컬럼에 그대로 입력되므로 별도 컬럼 불필요
- 목록/상세 화면에서 `previous_snapshot.owner_name` vs `owner_name`을 나란히 보여주면
  "명변 · 김OO → 이OO" 같은 표시를 계산 없이 바로 만들 수 있음
- `case_type = new`인 건은 `previous_snapshot`이 항상 `NULL`

## merchants

```sql
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS open_date DATE;
```

## 매장 생성/갱신 트리거 (신규)

```sql
CREATE OR REPLACE FUNCTION sync_merchant_on_franchise_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_merchant_id UUID;
  v_pos_model TEXT;
BEGIN
  IF NEW.status NOT IN ('card_done', 'toss_review_done') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- equipment_items -> pos_model 요약 문자열 (기존 클라이언트 로직과 동일한 포맷 유지 필요)
  -- ...

  IF NEW.merchant_id IS NULL THEN
    INSERT INTO merchants (business_name, owner_name, business_number, phone, address,
      address_detail, pos_model, open_date, memo, sales_id, franchise_application_id)
    VALUES (NEW.business_name, NEW.owner_name, NEW.business_number, NEW.phone, NEW.address,
      NEW.address_detail, v_pos_model, NEW.open_date, NEW.memo, NEW.sales_id, NEW.id)
    RETURNING id INTO v_merchant_id;

    UPDATE franchise_applications SET merchant_id = v_merchant_id WHERE id = NEW.id;
  ELSE
    UPDATE merchants SET
      business_name = NEW.business_name,
      owner_name = NEW.owner_name,
      business_number = NEW.business_number,
      phone = NEW.phone,
      address = NEW.address,
      address_detail = NEW.address_detail,
      pos_model = v_pos_model,
      open_date = NEW.open_date,
      memo = NEW.memo,
      updated_at = NOW()
    WHERE id = NEW.merchant_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER franchise_applications_sync_merchant
  AFTER UPDATE OF status ON franchise_applications
  FOR EACH ROW EXECUTE FUNCTION sync_merchant_on_franchise_completion();
```

이 트리거가 들어가면:

- 클라이언트의 `autoRegisterMerchant()` 호출은 전부 제거 (이제 DB가 보장)
- 일괄 상태변경(`handleBulkStatusChange`)에서도 자동으로 동작하게 됨 (지금 빠져있던 구멍이 막힘)
- `createLinkedInstallTicket`의 merchant insert 부분도 정리 대상 (죽은 코드라 트리거와 무관하게 삭제)

## install_blueprints

변경 없음. 이미 `merchant_id` 기준 다건 저장 가능한 구조.

## 레거시 데이터 (정리 안 함, 선택사항으로 격하)

기존 컬럼을 안 건드리기로 했으므로, 과거 `reception_channel` 값을 새 `channel`/`case_type`로
수기 매핑하는 "정리 필요" 화면은 **이번 마이그레이션에서 필수 아님**. 새 트리거는 `merchant_id` 유무로만
동작하므로 과거 row는 지금과 똑같이 (매번 새 merchant 생성) 동작한다 — 회귀 없음. 나중에 리포팅 목적으로
과거 데이터를 재분류하고 싶어지면 그때 별도로 진행.
