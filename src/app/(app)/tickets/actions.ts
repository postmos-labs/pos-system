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

// 42P01: relation does not exist / PGRST205: PostgREST 스키마 캐시에 표가 없음.
// 139번 마이그레이션(ticket_revision_requests)이 아직 적용되지 않은 환경에서 쓴다.
function isMissingRevisionTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /ticket_revision_requests|schema cache|relation .* does not exist/i.test(error.message ?? "")
  );
}

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

  // 기록은 부가 기능이라 표가 없어도(마이그레이션 미적용) 알림 발송은 그대로 진행한다.
  const { data: requesterProfile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();
  const { error: recordError } = await admin.from("ticket_revision_requests").insert({
    ticket_id: ticketId,
    message: trimmed,
    requested_by: user.id,
    requested_by_name: requesterProfile?.name ?? null,
  });
  if (recordError && !isMissingRevisionTable(recordError)) {
    return { error: recordError.message };
  }

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

export async function resolveTicketRevision(requestId: string, note: string) {
  const authError = await requireMaster();
  if (authError) return { error: authError };

  const trimmedNote = note.trim();
  if (trimmedNote.length > 500) return { error: "메모는 500자 이내로 입력해주세요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data: resolverProfile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ticket_revision_requests")
    .update({
      status: "resolved",
      resolved_by: user.id,
      resolved_by_name: resolverProfile?.name ?? null,
      resolved_at: new Date().toISOString(),
      resolved_note: trimmedNote || null,
    })
    .eq("id", requestId)
    .eq("status", "open")
    .select("id");
  if (error) {
    if (isMissingRevisionTable(error)) {
      return { error: "수정 요청 마이그레이션(supabase/139)이 아직 적용되지 않았습니다." };
    }
    return { error: error.message };
  }
  if (!data || data.length === 0) return { error: "이미 처리된 요청입니다." };

  revalidatePath("/tickets/revisions");
  return { error: null };
}
