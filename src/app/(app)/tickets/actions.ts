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
import { inspectTicket, composeRevisionMessage } from "@/lib/resolutionQuality";

const CHUNK_SIZE = 100;

// 이보다 오래된 건에는 일괄 수정 요청을 보내지 않는다. 기억으로 다시 적은 절차는 지어낸 절차다.
const REVISION_WINDOW_DAYS = 30;

export interface BulkRevisionResult {
  sent: number;
  skipped: { noIssue: number; noAssignee: number; alreadyOpen: number; tooOld: number };
  error: string | null;
}

export interface BulkCancelResult {
  canceled: number;
  skipped: { notOpen: number };
  error: string | null;
  warning?: string;
}

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

// 23514: CHECK 위반(canceled 값 미허용) / 42703·PGRST204: 컬럼 없음.
// 142번 마이그레이션(canceled_* 컬럼, status CHECK 확장)이 아직 적용되지 않은 환경에서 쓴다.
function isMissingCancelSchema(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "23514" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /canceled_/i.test(error.message ?? "")
  );
}

export async function cancelTicketRevision(
  requestId: string,
  note: string,
): Promise<{ error: string | null; warning?: string }> {
  const authError = await requireMaster();
  if (authError) return { error: authError };

  const trimmedNote = note.trim();
  if (trimmedNote.length > 300) return { error: "사유는 300자 이내로 입력해주세요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data: cancelerProfile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  const admin = createAdminClient();

  const { data: request, error: fetchError } = await admin
    .from("ticket_revision_requests")
    .select("id, ticket_id, status, ticket:tickets(title, sales_id, cs_id, tech_id)")
    .eq("id", requestId)
    .single();
  if (fetchError) {
    if (isMissingRevisionTable(fetchError)) {
      return { error: "수정 요청 마이그레이션(supabase/139)이 아직 적용되지 않았습니다." };
    }
    return { error: "수정 요청을 찾을 수 없습니다." };
  }
  if (!request) return { error: "수정 요청을 찾을 수 없습니다." };
  if (request.status !== "open") return { error: "이미 처리된 요청입니다." };

  const rawTicket = request.ticket as
    | {
        title: string | null;
        sales_id: string | null;
        cs_id: string | null;
        tech_id: string | null;
      }
    | {
        title: string | null;
        sales_id: string | null;
        cs_id: string | null;
        tech_id: string | null;
      }[]
    | null;
  const ticket = Array.isArray(rawTicket) ? rawTicket[0] : rawTicket;

  const { data, error } = await admin
    .from("ticket_revision_requests")
    .update({
      status: "canceled",
      canceled_by: user.id,
      canceled_by_name: cancelerProfile?.name ?? null,
      canceled_at: new Date().toISOString(),
      canceled_note: trimmedNote || null,
    })
    .eq("id", requestId)
    .eq("status", "open")
    .select("id");
  if (error) {
    if (isMissingCancelSchema(error)) {
      return { error: "수정 요청 취소 마이그레이션(supabase/142)이 아직 적용되지 않았습니다." };
    }
    if (isMissingRevisionTable(error)) {
      return { error: "수정 요청 마이그레이션(supabase/139)이 아직 적용되지 않았습니다." };
    }
    return { error: error.message };
  }
  if (!data || data.length === 0) return { error: "이미 처리된 요청입니다." };

  const ticketId = request.ticket_id as string;
  const ticketTitle = ticket?.title ?? "";
  const recipientIds = Array.from(
    new Set(
      [ticket?.sales_id, ticket?.cs_id, ticket?.tech_id].filter(
        (id): id is string => !!id && id !== user.id,
      ),
    ),
  );

  let warning: string | undefined;
  if (recipientIds.length > 0) {
    const { error: notifyError } = await admin.from("notifications").insert(
      recipientIds.map((userId) => ({
        user_id: userId,
        ticket_id: ticketId,
        type: "ticket_revision_canceled",
        title: `수정 요청 취소: ${ticketTitle}`,
        body: trimmedNote || "마스터가 수정 요청을 거둬들였습니다. 이 건은 고치지 않아도 됩니다.",
      })),
    );
    if (notifyError) {
      warning = `취소는 됐지만 알림 발송에 실패했습니다: ${notifyError.message}`;
    }
  }

  revalidatePath("/tickets/revisions");
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  return { error: null, ...(warning ? { warning } : {}) };
}

export async function requestTicketRevisionsBulk(ticketIds: string[]): Promise<BulkRevisionResult> {
  const emptySkipped = { noIssue: 0, noAssignee: 0, alreadyOpen: 0, tooOld: 0 };

  const authError = await requireMaster();
  if (authError) return { sent: 0, skipped: emptySkipped, error: authError };

  if (!ticketIds.length) return { sent: 0, skipped: emptySkipped, error: null };
  if (ticketIds.length > 200) {
    return { sent: 0, skipped: emptySkipped, error: "한 번에 200건까지만 보낼 수 있습니다." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { sent: 0, skipped: emptySkipped, error: "로그인이 필요합니다." };

  const { data: requesterProfile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  const admin = createAdminClient();

  const tickets: {
    id: string;
    title: string;
    created_at: string;
    resolution_steps: string | null;
    sales_id: string | null;
    cs_id: string | null;
    tech_id: string | null;
    merchant: { business_name: string | null; owner_name: string | null } | null;
  }[] = [];
  for (let i = 0; i < ticketIds.length; i += CHUNK_SIZE) {
    const chunk = ticketIds.slice(i, i + CHUNK_SIZE);
    const { data, error } = await admin
      .from("tickets")
      .select(
        "id, title, created_at, resolution_steps, sales_id, cs_id, tech_id, merchant:merchants(business_name, owner_name)",
      )
      .in("id", chunk);
    if (error) return { sent: 0, skipped: emptySkipped, error: error.message };
    if (data) tickets.push(...(data as unknown as typeof tickets));
  }

  // 이미 대기 중인 요청이 있는 건은 중복 발송하지 않는다. 표가 없는 환경(마이그레이션 미적용)에서는
  // 중복 판정을 포기하고 전체를 진행한다.
  const openTicketIds = new Set<string>();
  for (let i = 0; i < ticketIds.length; i += CHUNK_SIZE) {
    const chunk = ticketIds.slice(i, i + CHUNK_SIZE);
    const { data, error } = await admin
      .from("ticket_revision_requests")
      .select("ticket_id")
      .eq("status", "open")
      .in("ticket_id", chunk);
    if (!error && data) {
      for (const row of data) openTicketIds.add(row.ticket_id as string);
    }
  }

  const skipped = { noIssue: 0, noAssignee: 0, alreadyOpen: 0, tooOld: 0 };
  const revisionRecords: {
    ticket_id: string;
    message: string;
    requested_by: string;
    requested_by_name: string | null;
  }[] = [];
  const notificationRecords: {
    user_id: string;
    ticket_id: string;
    type: string;
    title: string;
    body: string;
  }[] = [];

  const cutoff = Date.now() - REVISION_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  for (const ticket of tickets) {
    if (new Date(ticket.created_at).getTime() < cutoff) {
      skipped.tooOld += 1;
      continue;
    }
    const issues = inspectTicket({
      title: ticket.title,
      steps: ticket.resolution_steps,
      businessName: ticket.merchant?.business_name ?? null,
      ownerName: ticket.merchant?.owner_name ?? null,
    });
    if (issues.length === 0) {
      skipped.noIssue += 1;
      continue;
    }
    if (openTicketIds.has(ticket.id)) {
      skipped.alreadyOpen += 1;
      continue;
    }
    const recipientIds = Array.from(
      new Set(
        [ticket.sales_id, ticket.cs_id, ticket.tech_id].filter(
          (id): id is string => !!id && id !== user.id,
        ),
      ),
    );
    if (recipientIds.length === 0) {
      skipped.noAssignee += 1;
      continue;
    }

    const message = composeRevisionMessage(issues);
    revisionRecords.push({
      ticket_id: ticket.id,
      message,
      requested_by: user.id,
      requested_by_name: requesterProfile?.name ?? null,
    });
    for (const recipientId of recipientIds) {
      notificationRecords.push({
        user_id: recipientId,
        ticket_id: ticket.id,
        type: "ticket_revision",
        title: `수정 요청: ${ticket.title}`,
        body: message,
      });
    }
  }

  // 기록은 부가 기능이라 표가 없어도(마이그레이션 미적용) 알림 발송은 그대로 진행한다.
  for (let i = 0; i < revisionRecords.length; i += CHUNK_SIZE) {
    const chunk = revisionRecords.slice(i, i + CHUNK_SIZE);
    const { error } = await admin.from("ticket_revision_requests").insert(chunk);
    if (error && !isMissingRevisionTable(error)) {
      return { sent: revisionRecords.length, skipped, error: error.message };
    }
  }

  for (let i = 0; i < notificationRecords.length; i += CHUNK_SIZE) {
    const chunk = notificationRecords.slice(i, i + CHUNK_SIZE);
    const { error } = await admin.from("notifications").insert(chunk);
    if (error) return { sent: revisionRecords.length, skipped, error: error.message };
  }

  revalidatePath("/tickets");
  revalidatePath("/tickets/revisions");
  return { sent: revisionRecords.length, skipped, error: null };
}

export async function cancelTicketRevisionsBulk(
  requestIds: string[],
  note: string,
): Promise<BulkCancelResult> {
  const emptySkipped = { notOpen: 0 };

  const authError = await requireMaster();
  if (authError) return { canceled: 0, skipped: emptySkipped, error: authError };

  if (!requestIds.length) return { canceled: 0, skipped: emptySkipped, error: null };
  if (requestIds.length > 200) {
    return { canceled: 0, skipped: emptySkipped, error: "한 번에 200건까지만 취소할 수 있습니다." };
  }

  const trimmedNote = note.trim();
  if (trimmedNote.length > 300) {
    return { canceled: 0, skipped: emptySkipped, error: "사유는 300자 이내로 입력해주세요." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { canceled: 0, skipped: emptySkipped, error: "로그인이 필요합니다." };

  const { data: cancelerProfile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  const admin = createAdminClient();

  const requests: {
    id: string;
    ticket_id: string;
    status: string;
    ticket:
      | {
          title: string | null;
          sales_id: string | null;
          cs_id: string | null;
          tech_id: string | null;
        }
      | {
          title: string | null;
          sales_id: string | null;
          cs_id: string | null;
          tech_id: string | null;
        }[]
      | null;
  }[] = [];
  for (let i = 0; i < requestIds.length; i += CHUNK_SIZE) {
    const chunk = requestIds.slice(i, i + CHUNK_SIZE);
    const { data, error } = await admin
      .from("ticket_revision_requests")
      .select("id, ticket_id, status, ticket:tickets(title, sales_id, cs_id, tech_id)")
      .in("id", chunk);
    if (error) {
      if (isMissingRevisionTable(error)) {
        return {
          canceled: 0,
          skipped: emptySkipped,
          error: "수정 요청 마이그레이션(supabase/139)이 아직 적용되지 않았습니다.",
        };
      }
      return { canceled: 0, skipped: emptySkipped, error: error.message };
    }
    if (data) requests.push(...(data as unknown as typeof requests));
  }

  const openRequests = requests.filter((r) => r.status === "open");
  const skipped = { notOpen: requestIds.length - openRequests.length };
  if (openRequests.length === 0) return { canceled: 0, skipped, error: null };

  let canceled = 0;
  const canceledRequests: typeof openRequests = [];
  for (let i = 0; i < openRequests.length; i += CHUNK_SIZE) {
    const chunkRequests = openRequests.slice(i, i + CHUNK_SIZE);
    const chunk = chunkRequests.map((r) => r.id);
    const { data, error } = await admin
      .from("ticket_revision_requests")
      .update({
        status: "canceled",
        canceled_by: user.id,
        canceled_by_name: cancelerProfile?.name ?? null,
        canceled_at: new Date().toISOString(),
        canceled_note: trimmedNote || null,
      })
      .in("id", chunk)
      .eq("status", "open")
      .select("id");
    if (error) {
      if (isMissingCancelSchema(error)) {
        return {
          canceled,
          skipped,
          error: "수정 요청 취소 마이그레이션(supabase/142)이 아직 적용되지 않았습니다.",
        };
      }
      if (isMissingRevisionTable(error)) {
        return {
          canceled,
          skipped,
          error: "수정 요청 마이그레이션(supabase/139)이 아직 적용되지 않았습니다.",
        };
      }
      return { canceled, skipped, error: error.message };
    }
    const updatedIds = new Set((data ?? []).map((row) => row.id as string));
    canceled += updatedIds.size;
    for (const r of chunkRequests) {
      if (updatedIds.has(r.id)) canceledRequests.push(r);
    }
  }

  const notificationRecords: {
    user_id: string;
    ticket_id: string;
    type: string;
    title: string;
    body: string;
  }[] = [];
  for (const request of canceledRequests) {
    const rawTicket = request.ticket;
    const ticket = Array.isArray(rawTicket) ? rawTicket[0] : rawTicket;
    const ticketTitle = ticket?.title ?? "";
    const recipientIds = Array.from(
      new Set(
        [ticket?.sales_id, ticket?.cs_id, ticket?.tech_id].filter(
          (id): id is string => !!id && id !== user.id,
        ),
      ),
    );
    for (const userId of recipientIds) {
      notificationRecords.push({
        user_id: userId,
        ticket_id: request.ticket_id,
        type: "ticket_revision_canceled",
        title: `수정 요청 취소: ${ticketTitle}`,
        body: trimmedNote || "마스터가 수정 요청을 거둬들였습니다. 이 건은 고치지 않아도 됩니다.",
      });
    }
  }

  // 알림이 실패해도 취소 자체는 이미 반영됐으므로 경고로만 알린다.
  let warning: string | undefined;
  for (let i = 0; i < notificationRecords.length; i += CHUNK_SIZE) {
    const chunk = notificationRecords.slice(i, i + CHUNK_SIZE);
    const { error: notifyError } = await admin.from("notifications").insert(chunk);
    if (notifyError) {
      warning = `취소는 됐지만 알림 발송에 실패했습니다: ${notifyError.message}`;
      break;
    }
  }

  revalidatePath("/tickets/revisions");
  revalidatePath("/tickets");
  return { canceled, skipped, error: null, ...(warning ? { warning } : {}) };
}

export async function cancelTicketRevisionsForTickets(
  ticketIds: string[],
  note: string,
): Promise<BulkCancelResult> {
  const emptySkipped = { notOpen: 0 };

  const authError = await requireMaster();
  if (authError) return { canceled: 0, skipped: emptySkipped, error: authError };

  if (!ticketIds.length) return { canceled: 0, skipped: emptySkipped, error: null };
  if (ticketIds.length > 200) {
    return { canceled: 0, skipped: emptySkipped, error: "한 번에 200건까지만 취소할 수 있습니다." };
  }

  const admin = createAdminClient();

  const openRequests: { id: string; ticket_id: string }[] = [];
  for (let i = 0; i < ticketIds.length; i += CHUNK_SIZE) {
    const chunk = ticketIds.slice(i, i + CHUNK_SIZE);
    const { data, error } = await admin
      .from("ticket_revision_requests")
      .select("id, ticket_id")
      .eq("status", "open")
      .in("ticket_id", chunk);
    if (error) {
      if (isMissingRevisionTable(error)) {
        return {
          canceled: 0,
          skipped: emptySkipped,
          error: "수정 요청 마이그레이션(supabase/139)이 아직 적용되지 않았습니다.",
        };
      }
      return { canceled: 0, skipped: emptySkipped, error: error.message };
    }
    if (data) openRequests.push(...data);
  }

  if (openRequests.length === 0) {
    return { canceled: 0, skipped: { notOpen: ticketIds.length }, error: null };
  }

  const requestIds = openRequests.map((r) => r.id);
  const ticketsWithOpenRequest = new Set(openRequests.map((r) => r.ticket_id));

  const result = await cancelTicketRevisionsBulk(requestIds, note);
  return {
    ...result,
    skipped: { notOpen: ticketIds.length - ticketsWithOpenRequest.size },
  };
}

const CANCEL_ALL_LIMIT = 1000;
const CANCEL_ALL_BATCH = 200;

// 대기 중인 수정 요청을 전부 취소한다. 판정 규칙이 바뀌어 예전 기준으로 나간 요청을 한 번에
// 거둘 때 쓴다. 알림 발송과 취소 기록은 cancelTicketRevisionsBulk가 맡으므로 여기서는 대상만 모은다.
export async function cancelAllOpenTicketRevisions(note: string): Promise<BulkCancelResult> {
  const emptySkipped = { notOpen: 0 };

  const authError = await requireMaster();
  if (authError) return { canceled: 0, skipped: emptySkipped, error: authError };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ticket_revision_requests")
    .select("id")
    .eq("status", "open")
    .limit(CANCEL_ALL_LIMIT);
  if (error) {
    if (isMissingRevisionTable(error)) {
      return {
        canceled: 0,
        skipped: emptySkipped,
        error: "수정 요청 마이그레이션(supabase/139)이 아직 적용되지 않았습니다.",
      };
    }
    return { canceled: 0, skipped: emptySkipped, error: error.message };
  }

  const requestIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
  if (requestIds.length === 0) return { canceled: 0, skipped: emptySkipped, error: null };

  let canceled = 0;
  let warning: string | undefined;
  for (let i = 0; i < requestIds.length; i += CANCEL_ALL_BATCH) {
    const result = await cancelTicketRevisionsBulk(requestIds.slice(i, i + CANCEL_ALL_BATCH), note);
    canceled += result.canceled;
    if (result.error) return { canceled, skipped: emptySkipped, error: result.error };
    if (result.warning && !warning) warning = result.warning;
  }
  return { canceled, skipped: emptySkipped, error: null, ...(warning ? { warning } : {}) };
}
