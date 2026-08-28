"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireAdminOrCs, requireDeletePermission } from "@/lib/auth/require-admin";

const CHUNK_SIZE = 100;

export async function deleteTickets(ids: string[]) {
  const authError = await requireDeletePermission();
  if (authError) return { error: authError };
  if (!ids.length) return { error: null };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const { error } = await admin
      .from("tickets")
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
      .in("id", chunk);
    if (error) return { error: error.message };
  }
  return { error: null };
}

export async function restoreTickets(ids: string[]) {
  // 복구는 파괴적이지 않으므로 휴지통을 볼 수 있는 사람(admin/master/cs/can_delete)이면 허용한다.
  // 삭제·영구삭제는 기존대로 requireDeletePermission을 유지한다.
  const authError = await requireAdminOrCs();
  if (authError) return { error: authError };
  if (!ids.length) return { error: null };

  const admin = createAdminClient();
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const { error } = await admin
      .from("tickets")
      .update({ deleted_at: null, deleted_by: null })
      .in("id", chunk);
    if (error) return { error: error.message };
  }
  return { error: null };
}

export async function purgeTickets(ids: string[]) {
  const authError = await requireAdmin();
  if (authError) return { error: authError };
  if (!ids.length) return { error: null };

  const admin = createAdminClient();
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const { error } = await admin.from("tickets").delete().in("id", chunk);
    if (error) return { error: error.message };
  }
  return { error: null };
}
