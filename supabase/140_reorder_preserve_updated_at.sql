-- 드래그 정렬이 updated_at을 갱신해 "장기 미처리" 판정을 무력화하던 문제 수정.
--
-- 목록에서 행 하나를 드래그하면 화면에 뜬 모든 행의 sort_order를 UPDATE한다.
-- update_updated_at() 트리거가 걸린 테이블은 그때 updated_at까지 지금 시각으로 갱신되어,
-- /api/cron/franchise-alerts의 "7일째 진척 없음" 알림 대상에서 통째로 빠졌다.
-- 목록을 한 번 정렬하면 방치된 접수건이 전부 "방금 처리됨"이 되는 셈이다.
--
-- 027에서 만든 세션 플래그(app.skip_updated_at)를 그대로 재사용해 정렬 전용 RPC를 둔다.
-- 트리거 함수는 건드리지 않으므로 이 함수를 공유하는 나머지 테이블(merchants, tickets,
-- change_requests, settlement_promotions, 승인 테이블들)의 동작은 그대로다.
--
-- 덤으로 행 개수만큼 나가던 개별 UPDATE가 호출 1회로 줄고, 한 트랜잭션이라
-- "일부만 저장되고 나머지는 실패"가 생기지 않는다.
--
-- 대상은 update_updated_at 트리거와 sort_order를 함께 가진 두 테이블뿐이다.
--   franchise_applications : 가맹접수 목록 + 전환건 목록이 공유
--   internet_management    : 인터넷 관리 목록
-- installations는 이 트리거가 없고(서버 액션이 updated_at을 직접 넣는다),
-- woo_customers는 드래그 정렬 기능이 없어 대상이 아니다.

-- SECURITY INVOKER(기본값)로 둔다. RLS를 우회하지 않아야 호출자의 권한이 그대로 적용된다.
CREATE OR REPLACE FUNCTION reorder_franchise_applications(p_ids uuid[])
RETURNS integer AS $$
DECLARE
  v_count integer;
  v_total integer := coalesce(array_length(p_ids, 1), 0);
BEGIN
  IF v_total = 0 THEN RETURN 0; END IF;

  PERFORM set_config('app.skip_updated_at', 'true', true);

  -- 클라이언트가 쓰던 계산식 (n - i) * 1000 과 같다. i는 0부터, ord는 1부터 세므로 +1.
  UPDATE franchise_applications f
     SET sort_order = (v_total - o.ord + 1) * 1000
    FROM unnest(p_ids) WITH ORDINALITY AS o(id, ord)
   WHERE f.id = o.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reorder_internet_management(p_ids uuid[])
RETURNS integer AS $$
DECLARE
  v_count integer;
  v_total integer := coalesce(array_length(p_ids, 1), 0);
BEGIN
  IF v_total = 0 THEN RETURN 0; END IF;

  PERFORM set_config('app.skip_updated_at', 'true', true);

  UPDATE internet_management m
     SET sort_order = (v_total - o.ord + 1) * 1000
    FROM unnest(p_ids) WITH ORDINALITY AS o(id, ord)
   WHERE m.id = o.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION reorder_franchise_applications(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION reorder_internet_management(uuid[]) TO authenticated;
