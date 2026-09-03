"use client";

import { createClient } from "@/lib/supabase/client";

// 목록 드래그 정렬의 저장 처리. 가맹접수·전환건·인터넷 세 화면이 같은 코드를 복붙해
// 갖고 있던 것을 여기로 모았다.
//
// 예전에는 화면에 뜬 행 개수만큼 UPDATE를 날렸는데, update_updated_at 트리거가
// updated_at까지 갱신해버려 /api/cron/franchise-alerts의 "7일째 진척 없음" 판정이
// 정렬 한 번에 전부 리셋됐다. supabase/140의 전용 RPC는 027이 만든 세션 플래그로
// updated_at을 보존하고, 한 트랜잭션이라 부분 저장도 생기지 않는다.

const REORDER_RPC = {
  franchise_applications: "reorder_franchise_applications",
  internet_management: "reorder_internet_management",
} as const;

export type ReorderTable = keyof typeof REORDER_RPC;

/** supabase/140이 아직 적용되지 않아 RPC를 찾지 못한 경우 */
function isMissingReorderFunction(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /Could not find the function|function .* does not exist/i.test(error.message ?? "")
  );
}

/**
 * 드래그 결과 순서대로 sort_order를 저장한다.
 * `ids`는 화면에 보이는 순서(맨 위가 첫 번째)대로 넘긴다.
 */
export async function saveRowOrder(
  table: ReorderTable,
  ids: string[],
): Promise<{ error: string | null }> {
  if (ids.length === 0) return { error: null };

  const supabase = createClient();
  const { error } = await supabase.rpc(REORDER_RPC[table], { p_ids: ids });
  if (!error) return { error: null };
  if (!isMissingReorderFunction(error)) return { error: error.message };

  // 140번 마이그레이션 미적용 환경 — 예전 방식으로 저장한다.
  // 이 경로에서는 updated_at이 갱신되므로 장기 미처리 알림이 밀릴 수 있다.
  console.warn(
    "정렬 전용 RPC를 찾지 못해 개별 UPDATE로 저장합니다. supabase/140_reorder_preserve_updated_at.sql을 적용해주세요.",
  );
  const n = ids.length;
  const results = await Promise.all(
    ids.map((id, i) =>
      supabase
        .from(table)
        .update({ sort_order: (n - i) * 1000 })
        .eq("id", id),
    ),
  );
  // supabase-js는 DB 오류 시 reject하지 않고 { error }로 resolve하므로 결과를 직접 확인한다.
  const failed = results.find((res) => res.error);
  return { error: failed?.error?.message ?? null };
}
