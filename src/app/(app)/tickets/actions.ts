"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  requireAdmin,
  requireAdminOrCs,
  requireDeletePermission,
  requireMaster,
} from "@/lib/auth/require-admin";
import { revalidatePath } from "next/cache";

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

export async function requestTicketRevision(ticketId: string, message: string) {
  const authError = await requireMaster();
  if (authError) return { error: authError };

  const trimmed = message.trim();
  if (!trimmed) return { error: "내용을 입력해주세요." };
  if (trimmed.length > 1000) return { error: "내용은 1,000자 이내로 입력해주세요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data: ticket } = await supabase
    .from("tickets")
    .select("sales_id, cs_id, tech_id, title")
    .eq("id", ticketId)
    .single();
  if (!ticket) return { error: "인입내역을 찾을 수 없습니다." };

  const recipientIds = Array.from(
    new Set(
      [ticket.sales_id, ticket.cs_id, ticket.tech_id].filter(
        (id): id is string => !!id && id !== user.id,
      ),
    ),
  );
  if (recipientIds.length === 0) {
    return { error: "이 건에 담당자가 지정돼 있지 않아 보낼 대상이 없습니다." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("notifications").insert(
    recipientIds.map((userId) => ({
      user_id: userId,
      ticket_id: ticketId,
      type: "ticket_revision",
      title: `수정 요청: ${ticket.title}`,
      body: trimmed,
    })),
  );
  if (error) return { error: error.message };

  revalidatePath(`/tickets/${ticketId}`);
  return { error: null, sentCount: recipientIds.length };
}
