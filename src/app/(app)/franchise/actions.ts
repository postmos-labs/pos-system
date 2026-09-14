"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrCs } from "@/lib/auth/require-admin";
import { fetchRowsForDeletion, recordDeletions } from "@/lib/deletionLog";
import { fetchFranchiseListData } from "./fetchFranchiseListData";
import type { FranchiseApplication } from "@/types";

const CHUNK_SIZE = 100;

export async function deleteFranchiseRows(ids: string[]) {
  const authError = await requireAdminOrCs();
  if (authError) return { error: authError };
  if (!ids.length) return { error: null };
  const supabase = createAdminClient();
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    // 가맹접수를 지우면 franchise_application_logs도 CASCADE로 함께 사라지므로 삭제 전에 스냅샷을 남긴다
    const snapshots = await fetchRowsForDeletion("franchise_applications", chunk);
    const { error } = await supabase.from("franchise_applications").delete().in("id", chunk);
    if (error) return { error: error.message };
    await recordDeletions("franchise_application", snapshots);
  }
  return { error: null };
}

export async function loadArchivedFranchiseRows(isLargeFranchise: boolean): Promise<{
  rows: FranchiseApplication[];
  linkedInstalls: Record<string, { id: string; status: string }>;
  linkedInternets: Record<string, { id: string; status: string | null; category: string | null }>;
  error: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { rows: [], linkedInstalls: {}, linkedInternets: {}, error: "로그인이 필요합니다." };

  const { rows, linkedInstalls, linkedInternets, error } = await fetchFranchiseListData(
    supabase,
    user.id,
    isLargeFranchise,
    { scope: "archived" },
  );
  return { rows, linkedInstalls, linkedInternets, error: error?.message ?? null };
}
