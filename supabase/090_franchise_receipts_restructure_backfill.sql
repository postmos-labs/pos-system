-- 090 스키마 적용 후 실행하는 데이터 백필 (dev 전용, 번호 없는 파일 — 090의 부속 스크립트)
-- 대상: reception_channel_legacy → reception_channel_code / case_type_code / option_code
--       van_company_legacy → van_company_codes
-- 범위 밖: memo 블롭 → franchise_application_memos (parseMemoEntries 로직 재사용 필요, Node 스크립트로 별도 진행)
--
-- 결정사항 (2026-07-27): 전환/승계/명변 이력 약 300여 건은 원본 신규 건 연결 정보가 없어
-- case_type_requires_origin 제약을 만족시킬 수 없다. 이 건들은 case_type_code를 NULL로 남기고
-- reception_channel_legacy 원본 텍스트로만 과거 구분을 유지한다 (데이터 유실 아님, 신규 구조 미적용일 뿐).

-- 0. reception_date (legacy text, 전부 YYYY-MM-DD 형식 확인됨 -> 바로 캐스팅)
UPDATE franchise_applications
SET reception_date = reception_date_legacy::date
WHERE reception_date IS NULL
  AND reception_date_legacy IS NOT NULL
  AND reception_date_legacy ~ '^\d{4}-\d{2}-\d{2}$';

-- 1. reception_channel_code / option_code / case_type_code
UPDATE franchise_applications
SET
  reception_channel_code = CASE reception_channel_legacy
    WHEN '토스 홈페이지' THEN 'TOSS_LEAD'
    WHEN '토스리드건'   THEN 'TOSS_LEAD'
    WHEN '토스프리미엄' THEN 'TOSS_LEAD'
    WHEN '직접 영업'    THEN 'DIRECT_SALES'
    ELSE NULL
  END,
  option_code = CASE reception_channel_legacy
    WHEN '렌탈' THEN 'RENTAL'
    WHEN '할부' THEN 'INSTALLMENT'
    ELSE NULL
  END,
  case_type_code = CASE
    WHEN reception_channel_legacy IN ('전환', '승계', '명변') THEN NULL  -- 원본 연결 정보 없음, 보류
    ELSE 'NEW'                                                          -- 그 외(토스/직접영업/렌탈/할부/미지정)는 전부 신규 취급
  END
WHERE reception_channel_code IS NULL
  AND option_code IS NULL
  AND case_type_code IS NULL; -- 이미 백필됐거나 앱에서 새로 채운 행은 건드리지 않음

-- 2. van_company_codes (콤마 구분 legacy 텍스트 -> 배열)
UPDATE franchise_applications
SET van_company_codes = COALESCE((
  SELECT array_agg(mapped) FILTER (WHERE mapped IS NOT NULL)
  FROM (
    SELECT CASE trim(v)
      WHEN '코세스2' THEN 'KOCES2'
      WHEN '코세스1' THEN 'KOCES1'
      WHEN '코벤'   THEN 'KOVEN'
      WHEN '기가맹' THEN 'GIGA_FRANCHISE'
      ELSE NULL
    END AS mapped
    FROM unnest(string_to_array(van_company_legacy, ',')) AS v
  ) mapped_sub
), '{}')
WHERE van_company_legacy IS NOT NULL
  AND van_company_legacy <> ''
  AND van_company_codes = '{}';  -- 이미 백필된 행은 건드리지 않음

-- 3. 확인용 조회 (백필 후 직접 실행해서 눈으로 확인)
-- SELECT reception_channel_legacy, reception_channel_code, case_type_code, option_code, count(*)
-- FROM franchise_applications
-- GROUP BY 1, 2, 3, 4
-- ORDER BY 1;
--
-- SELECT van_company_legacy, van_company_codes, count(*)
-- FROM franchise_applications
-- WHERE van_company_legacy IS NOT NULL AND van_company_legacy <> ''
-- GROUP BY 1, 2;
