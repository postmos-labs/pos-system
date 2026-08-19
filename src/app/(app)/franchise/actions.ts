"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminOrCs } from "@/lib/auth/require-admin";
import { fetchRowsForDeletion, recordDeletions } from "@/lib/deletionLog";

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
