import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type DeletionEntityType =
  "franchise_application" | "installation" | "change_request" | "merchant";

type Snapshot = Record<string, unknown>;

/**
 * 삭제 대상의 식별용 이름을 뽑는다. 테이블마다 상호명 컬럼이 달라서 순서대로 훑는다.
 */
function subjectOf(row: Snapshot): string | null {
  for (const key of ["business_name", "customer_name", "owner_name", "title"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * 삭제 직전 스냅샷을 deletion_logs에 남긴다.
 * 감사 로그 기록 실패가 삭제 자체를 막지는 않도록 에러는 삼키고 콘솔에만 남긴다.
 * (호출부에서 반드시 실제 delete 전에 호출할 것 — 삭제 후에는 스냅샷을 뜰 수 없다)
 */
export async function recordDeletions(
  entityType: DeletionEntityType,
  rows: Snapshot[],
): Promise<void> {
  if (!rows.length) return;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let userName = "알 수 없음";
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .single();
      if (profile?.name) userName = profile.name;
    }

    const admin = createAdminClient();
    const { error } = await admin.from("deletion_logs").insert(
      rows.map((row) => ({
        entity_type: entityType,
        entity_id: row.id as string,
        subject: subjectOf(row),
        snapshot: row,
        user_id: user?.id ?? null,
        user_name: userName,
      })),
    );
    if (error) console.error("삭제 감사 로그 기록 실패:", error.message);
  } catch (err) {
    console.error("삭제 감사 로그 기록 실패:", err);
  }
}

/**
 * 삭제 대상 행 전체를 조회한다. 스냅샷 용도라 모든 컬럼을 가져온다.
 */
export async function fetchRowsForDeletion(table: string, ids: string[]): Promise<Snapshot[]> {
  if (!ids.length) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.from(table).select("*").in("id", ids);
  if (error) {
    console.error(`삭제 스냅샷 조회 실패 (${table}):`, error.message);
    return [];
  }
  return (data ?? []) as Snapshot[];
}
