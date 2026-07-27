"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminOrCs } from "@/lib/auth/require-admin";

const CHUNK_SIZE = 100;

export async function deleteFranchiseRows(ids: string[]) {
  const authError = await requireAdminOrCs();
  if (authError) return { error: authError };
  if (!ids.length) return { error: null };
  const supabase = createAdminClient();
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from("franchise_applications")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", chunk);
    if (error) return { error: error.message };
  }
  return { error: null };
}
