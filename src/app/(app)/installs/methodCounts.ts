import type { SupabaseClient } from "@supabase/supabase-js";
import {
  installMethodOf,
  isMissingInstallMethodColumn,
  type InstallMethod,
} from "@/lib/installMethod";

// 진행 중인 설치·전환 건을 설치 방식별로 센다. 끝난 건(완료·취소·반려)은 뺀다.
// 택배 흐름(자가설치·외부기사)은 택배발송(delivery_sent)이 곧 끝이므로 같이 뺀다.
// 160 마이그레이션 전에는 install_method 칸이 없어 delivery_type으로 대신 판단하고, 오류가 나면 모두 0을 돌려준다.
export async function fetchInstallMethodCounts(
  supabase: SupabaseClient,
): Promise<Record<InstallMethod, number>> {
  const counts: Record<InstallMethod, number> = { visit: 0, self: 0, external: 0 };
  try {
    type Row = { delivery_type: string | null; install_method?: string | null; status: string };
    const query = (columns: string) =>
      supabase
        .from("installations")
        .select(columns)
        .in("delivery_type", ["install", "delivery", "transfer"])
        .not("status", "in", "(completed,canceled,rejected)")
        .limit(5000);

    let { data, error } = await query("delivery_type,install_method,status");
    if (isMissingInstallMethodColumn(error)) {
      ({ data, error } = await query("delivery_type,status"));
    }
    if (error || !data) return counts;

    for (const row of data as unknown as Row[]) {
      const method = installMethodOf(row);
      if (!method) continue;
      if (method !== "visit" && row.status === "delivery_sent") continue;
      counts[method] += 1;
    }
  } catch {
    return { visit: 0, self: 0, external: 0 };
  }
  return counts;
}
