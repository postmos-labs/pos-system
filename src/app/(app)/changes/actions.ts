"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminOrCs } from "@/lib/auth/require-admin";
import { fetchRowsForDeletion, recordDeletions } from "@/lib/deletionLog";

export async function deleteChangeRequests(ids: string[]) {
  const authError = await requireAdminOrCs();
  if (authError) return { error: authError };
  if (!ids.length) return { error: null };
  const supabase = createAdminClient();
  const snapshots = await fetchRowsForDeletion("change_requests", ids);
  const { error } = await supabase.from("change_requests").delete().in("id", ids);
  if (error) return { error: error.message };
  await recordDeletions("change_request", snapshots);
  return { error: null };
}
