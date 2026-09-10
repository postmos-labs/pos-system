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
import { judgeTicketQuality, qualityInputHash, verdictFromStored } from "@/lib/qualityJudge";
import { loadRevisionRows, type RevisionStatusFilter } from "./revisionRows";
import type { RevisionRow } from "./revisions/RevisionsClient";

const CHUNK_SIZE = 100;
const JUDGE_BATCH_LIMIT = 60;
const JUDGE_CONCURRENCY = 5;

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
    .select("sales_id, cs_id, tech_id, title, resolution_steps")
    .eq("id", ticketId)
    .single();
  if (!ticket) return { error: "인입내역을 찾을 수 없습니다." };

  const admin = createAdminClient();

  const { data: openRequest, error: openCheckError } = await admin
    .from("ticket_revision_requests")
    .select("id")
    .eq("ticket_id", ticketId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  if (!openCheckError && openRequest) {
    return {
      error: "이미 대기 중인 수정 요청이 있습니다. 취소하거나 확인 완료한 뒤 다시 보내주세요.",
    };
  }

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

  // 기록은 부가 기능이라 표가 없어도(마이그레이션 미적용) 알림 발송은 그대로 진행한다.
  const { data: requesterProfile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();
  let { error: recordError } = await admin.from("ticket_revision_requests").insert({
    ticket_id: ticketId,
    message: trimmed,
    requested_by: user.id,
    requested_by_name: requesterProfile?.name ?? null,
    before_title: ticket.title ?? null,
    before_steps: ticket.resolution_steps ?? null,
  });
  if (recordError && isMissingColumn(recordError)) {
    ({ error: recordError } = await admin.from("ticket_revision_requests").insert({
      ticket_id: ticketId,
      message: trimmed,
      requested_by: user.id,
      requested_by_name: requesterProfile?.name ?? null,
    }));
  }
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

  const { data: request } = await admin
    .from("ticket_revision_requests")
    .select("ticket_id, ticket:tickets(title, sales_id, cs_id, tech_id)")
    .eq("id", requestId)
    .single();
  const rawTicket = request?.ticket as
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
    | null
    | undefined;
  const ticket = Array.isArray(rawTicket) ? rawTicket[0] : rawTicket;
  const recipientIds = Array.from(
    new Set(
      [ticket?.sales_id, ticket?.cs_id, ticket?.tech_id].filter(
        (id): id is string => !!id && id !== user.id,
      ),
    ),
  );
  if (request && recipientIds.length > 0) {
    // 알림 실패는 완료 처리를 되돌리지 않는다.
    await admin.from("notifications").insert(
      recipientIds.map((userId) => ({
        user_id: userId,
        ticket_id: request.ticket_id as string,
        type: "ticket_revision_resolved",
        title: `수정 요청 확인 완료: ${ticket?.title ?? ""}`,
        body:
          trimmedNote ||
          `${resolverProfile?.name ?? "마스터"}님이 고친 내용을 확인하고 닫았습니다.`,
      })),
    );
  }

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

// 42703·PGRST204: 컬럼 없음. 146번(before_title/before_steps)이 아직 안 돈 환경에서 쓴다.
function isMissingColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist|Could not find the '.*' column/i.test(error.message ?? "")
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

export interface AutoResolveResult {
  /** 지금 내용이 규칙을 통과하는지 (절차가 비어 있으면 false) */
  passed: boolean;
  labels: string[];
  /** 이 건에 대기 중 수정 요청이 있었는지 */
  hadOpenRequest: boolean;
  /** 통과해서 대기 요청을 완료 처리했는지 */
  resolved: boolean;
  error: string | null;
  /** 왜 걸렸는지 한 문장. 모델 판정일 때만 채워진다 */
  reason: string | null;
  /** 어떻게 고치면 되는지 한 문장 */
  suggestion: string | null;
}

// 담당자가 문의 내용이나 해결 절차를 저장한 직후 부른다. 지금 내용에 규칙을 돌려 통과하면
// 대기 중 수정 요청을 자동으로 완료 처리한다. 마스터가 확인 완료를 누르러 가지 않아도 되게 하기 위해서다.
// 미달이면 요청은 대기로 남고 사유만 돌려준다.
export async function autoResolveTicketRevision(ticketId: string): Promise<AutoResolveResult> {
  const fail = (error: string): AutoResolveResult => ({
    passed: false,
    labels: [],
    hadOpenRequest: false,
    resolved: false,
    error,
    reason: null,
    suggestion: null,
  });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("로그인이 필요합니다.");

  const admin = createAdminClient();
  const { data: ticket, error: ticketError } = await admin
    .from("tickets")
    .select(
      "id, title, resolution_steps, sales_id, cs_id, tech_id, merchant:merchants(business_name, owner_name)",
    )
    .eq("id", ticketId)
    .single();
  if (ticketError || !ticket) return fail(ticketError?.message ?? "인입내역을 찾을 수 없습니다.");

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAssignee = [
    ticket.sales_id as string | null,
    ticket.cs_id as string | null,
    ticket.tech_id as string | null,
  ].includes(user.id);
  if (!isAssignee && callerProfile?.role !== "master") {
    return fail("이 건의 담당자나 마스터만 처리할 수 있습니다.");
  }

  const rawMerchant = ticket.merchant as
    | { business_name?: string | null; owner_name?: string | null }
    | { business_name?: string | null; owner_name?: string | null }[]
    | null;
  const merchant = Array.isArray(rawMerchant) ? (rawMerchant[0] ?? null) : rawMerchant;
  const steps = (ticket.resolution_steps as string | null) ?? "";
  const verdict = steps.trim()
    ? await judgeTicketQuality({
        title: (ticket.title as string | null) ?? "",
        steps,
        businessName: merchant?.business_name ?? null,
        ownerName: merchant?.owner_name ?? null,
      })
    : null;
  const issues = verdict?.issues ?? [];
  const passed = !!steps.trim() && issues.length === 0;
  const labels = issues.map((issue) => issue.label);

  if (verdict) {
    // 컬럼이 없는 환경(148 미적용)에서는 조용히 넘긴다. 판정 자체는 이미 끝났다.
    await admin
      .from("tickets")
      .update({
        quality_verdict: verdict,
        quality_hash: qualityInputHash((ticket.title as string | null) ?? "", steps),
      })
      .eq("id", ticketId);
  }

  const { data: openRows, error: openError } = await admin
    .from("ticket_revision_requests")
    .select("id")
    .eq("ticket_id", ticketId)
    .eq("status", "open");
  if (openError) {
    if (isMissingRevisionTable(openError)) {
      return {
        passed,
        labels,
        hadOpenRequest: false,
        resolved: false,
        error: null,
        reason: verdict?.reason ?? null,
        suggestion: verdict?.suggestion ?? null,
      };
    }
    return fail(openError.message);
  }
  const openIds = (openRows ?? []).map((row) => row.id as string);
  if (openIds.length === 0 || !passed) {
    return {
      passed,
      labels,
      hadOpenRequest: openIds.length > 0,
      resolved: false,
      error: null,
      reason: verdict?.reason ?? null,
      suggestion: verdict?.suggestion ?? null,
    };
  }

  const { data: resolverProfile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  const { error: updateError } = await admin
    .from("ticket_revision_requests")
    .update({
      status: "resolved",
      resolved_by: user.id,
      resolved_by_name: resolverProfile?.name ?? null,
      resolved_at: new Date().toISOString(),
      resolved_note: "고쳐서 품질 점검 통과 (자동 완료)",
    })
    .in("id", openIds)
    .eq("status", "open");
  if (updateError) return fail(updateError.message);

  revalidatePath("/tickets");
  revalidatePath("/tickets/revisions");
  revalidatePath(`/tickets/${ticketId}`);
  return {
    passed,
    labels,
    hadOpenRequest: true,
    resolved: true,
    error: null,
    reason: verdict?.reason ?? null,
    suggestion: verdict?.suggestion ?? null,
  };
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
    quality_verdict?: unknown;
    quality_hash?: string | null;
  }[] = [];
  for (let i = 0; i < ticketIds.length; i += CHUNK_SIZE) {
    const chunk = ticketIds.slice(i, i + CHUNK_SIZE);
    let { data, error } = await admin
      .from("tickets")
      .select(
        "id, title, created_at, resolution_steps, sales_id, cs_id, tech_id, merchant:merchants(business_name, owner_name), quality_verdict, quality_hash",
      )
      .in("id", chunk);
    if (error && isMissingColumn(error)) {
      const fallback = await admin
        .from("tickets")
        .select(
          "id, title, created_at, resolution_steps, sales_id, cs_id, tech_id, merchant:merchants(business_name, owner_name)",
        )
        .in("id", chunk);
      data = fallback.data as typeof data;
      error = fallback.error;
    }
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
    before_title: string | null;
    before_steps: string | null;
  }[] = [];
  const notificationRecords: {
    user_id: string;
    ticket_id: string;
    type: string;
    title: string;
    body: string;
  }[] = [];

  const cutoffDate = new Date(Date.now() - REVISION_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  for (const ticket of tickets) {
    if (String(ticket.created_at).slice(0, 10) < cutoffDate) {
      skipped.tooOld += 1;
      continue;
    }
    const stored = verdictFromStored(ticket.quality_verdict);
    const useStored =
      !!stored &&
      ticket.quality_hash === qualityInputHash(ticket.title ?? "", ticket.resolution_steps ?? "");
    const issues = useStored
      ? stored.issues
      : inspectTicket({
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
      before_title: ticket.title ?? null,
      before_steps: ticket.resolution_steps ?? null,
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
  let stripSnapshot = false;
  for (let i = 0; i < revisionRecords.length; i += CHUNK_SIZE) {
    const chunk = revisionRecords.slice(i, i + CHUNK_SIZE);
    const withoutSnapshot = (records: typeof chunk) =>
      records.map((record) => ({
        ticket_id: record.ticket_id,
        message: record.message,
        requested_by: record.requested_by,
        requested_by_name: record.requested_by_name,
      }));
    const payload = stripSnapshot ? withoutSnapshot(chunk) : chunk;
    let { error } = await admin.from("ticket_revision_requests").insert(payload);
    if (error && !stripSnapshot && isMissingColumn(error)) {
      stripSnapshot = true;
      ({ error } = await admin.from("ticket_revision_requests").insert(withoutSnapshot(chunk)));
    }
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

  let canceled = 0;
  let warning: string | undefined;
  // 대기 건이 CANCEL_ALL_LIMIT(1000)보다 많을 수 있어, 더 남지 않을 때까지 반복해서 훑는다.
  for (let round = 0; round < 10; round++) {
    const { data, error } = await admin
      .from("ticket_revision_requests")
      .select("id")
      .eq("status", "open")
      .limit(CANCEL_ALL_LIMIT);
    if (error) {
      if (isMissingRevisionTable(error)) {
        return {
          canceled,
          skipped: emptySkipped,
          error: "수정 요청 마이그레이션(supabase/139)이 아직 적용되지 않았습니다.",
        };
      }
      return { canceled, skipped: emptySkipped, error: error.message };
    }

    const requestIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
    if (requestIds.length === 0) break;

    for (let i = 0; i < requestIds.length; i += CANCEL_ALL_BATCH) {
      const result = await cancelTicketRevisionsBulk(
        requestIds.slice(i, i + CANCEL_ALL_BATCH),
        note,
      );
      canceled += result.canceled;
      if (result.error) return { canceled, skipped: emptySkipped, error: result.error };
      if (result.warning && !warning) warning = result.warning;
    }
  }
  return { canceled, skipped: emptySkipped, error: null, ...(warning ? { warning } : {}) };
}

// 인입내역의 "수정 요청 내역" 상세창이 쓴다. 현황 페이지와 같은 조립 함수를 써서 판정이 같다.
export async function fetchRevisionRows(
  status: RevisionStatusFilter,
): Promise<{ rows: RevisionRow[]; schemaReady: boolean; openCount: number; error: string | null }> {
  const authError = await requireMaster();
  if (authError) return { rows: [], schemaReady: true, openCount: 0, error: authError };
  const supabase = await createClient();
  const result = await loadRevisionRows(supabase, status);
  return { ...result, error: null };
}

export interface ResolvePassingResult {
  resolved: number;
  error: string | null;
}

// 전체 검토가 부른다. 대기 중 수정 요청 가운데 지금 내용이 규칙을 통과하는 건을 완료로 닫는다.
// 담당자가 고쳤는데 자동 완료가 돌기 전(배포 전)에 고친 건이 대기에 남아 있어 마스터가 하나씩 눌러야 했다.
export async function resolvePassingTicketRevisions(): Promise<ResolvePassingResult> {
  const authError = await requireMaster();
  if (authError) return { resolved: 0, error: authError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { resolved: 0, error: "로그인이 필요합니다." };

  const { rows, schemaReady } = await loadRevisionRows(supabase, "open");
  if (!schemaReady) {
    return {
      resolved: 0,
      error: "수정 요청 마이그레이션(supabase/139)이 아직 적용되지 않았습니다.",
    };
  }
  const passingIds = rows.filter((row) => row.current_quality === "pass").map((row) => row.id);
  if (passingIds.length === 0) return { resolved: 0, error: null };

  const { data: resolverProfile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  const admin = createAdminClient();
  let resolved = 0;
  const resolvedTicketIds = new Set<string>();
  for (let i = 0; i < passingIds.length; i += CHUNK_SIZE) {
    const chunk = passingIds.slice(i, i + CHUNK_SIZE);
    const { data, error } = await admin
      .from("ticket_revision_requests")
      .update({
        status: "resolved",
        resolved_by: user.id,
        resolved_by_name: resolverProfile?.name ?? null,
        resolved_at: new Date().toISOString(),
        resolved_note: "전체 검토에서 품질 점검 통과 확인 (자동 완료)",
      })
      .in("id", chunk)
      .eq("status", "open")
      .select("id");
    if (error) return { resolved, error: error.message };
    const updatedIds = new Set((data ?? []).map((row) => row.id as string));
    resolved += updatedIds.size;
    for (const row of rows) {
      if (updatedIds.has(row.id)) resolvedTicketIds.add(row.ticket_id);
    }
  }

  // 알림 실패는 완료 처리를 되돌리지 않는다.
  const ticketIds = Array.from(resolvedTicketIds);
  const notificationRecords: {
    user_id: string;
    ticket_id: string;
    type: string;
    title: string;
    body: string;
  }[] = [];
  for (let i = 0; i < ticketIds.length; i += CHUNK_SIZE) {
    const chunk = ticketIds.slice(i, i + CHUNK_SIZE);
    const { data: ticketsData } = await admin
      .from("tickets")
      .select("id, title, sales_id, cs_id, tech_id")
      .in("id", chunk);
    for (const ticket of ticketsData ?? []) {
      const recipientIds = Array.from(
        new Set(
          [ticket.sales_id, ticket.cs_id, ticket.tech_id].filter(
            (id): id is string => !!id && id !== user.id,
          ),
        ),
      );
      for (const userId of recipientIds) {
        notificationRecords.push({
          user_id: userId,
          ticket_id: ticket.id,
          type: "ticket_revision_resolved",
          title: `수정 요청 확인 완료: ${ticket.title ?? ""}`,
          body: "전체 검토에서 품질 점검 통과가 확인되어 닫았습니다.",
        });
      }
    }
  }
  for (let i = 0; i < notificationRecords.length; i += CHUNK_SIZE) {
    const chunk = notificationRecords.slice(i, i + CHUNK_SIZE);
    await admin.from("notifications").insert(chunk);
  }

  revalidatePath("/tickets");
  revalidatePath("/tickets/revisions");
  return { resolved, error: null };
}

export interface JudgePendingResult {
  /** 이번에 모델로 판정한 건수 */
  judged: number;
  /** 아직 판정이 남은 건수. 0이 아니면 버튼을 다시 눌러 이어서 판정한다 */
  remaining: number;
  error: string | null;
}

// 전체 검토가 부른다. 저장된 판정이 없거나 내용이 바뀐 건, 규칙으로만 판정된 건을 모델에 물어본다.
// 한 번에 JUDGE_BATCH_LIMIT건까지만 처리해 버튼이 오래 붙잡히지 않게 한다. 결과는 저장되므로
// 다음 호출은 남은 건부터 이어서 본다.
export async function judgePendingTicketQuality(): Promise<JudgePendingResult> {
  const authError = await requireMaster();
  if (authError) return { judged: 0, remaining: 0, error: authError };

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("tickets")
    .select(
      "id, title, resolution_steps, quality_verdict, quality_hash, merchant:merchants(business_name, owner_name)",
    )
    .eq("team", "tech")
    .is("deleted_at", null)
    .not("resolution_steps", "is", null)
    .neq("resolution_steps", "")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    if (isMissingColumn(error)) return { judged: 0, remaining: 0, error: null };
    return { judged: 0, remaining: 0, error: error.message };
  }

  const candidates = (rows ?? []).filter((row) => {
    const title = (row.title as string | null) ?? "";
    const steps = (row.resolution_steps as string | null) ?? "";
    const hash = qualityInputHash(title, steps);
    const stored = verdictFromStored(row.quality_verdict);
    return !stored || row.quality_hash !== hash || stored.source !== "ai";
  });

  const targets = candidates.slice(0, JUDGE_BATCH_LIMIT);
  const remaining = candidates.length - targets.length;

  let judged = 0;
  for (let i = 0; i < targets.length; i += JUDGE_CONCURRENCY) {
    const chunk = targets.slice(i, i + JUDGE_CONCURRENCY);
    await Promise.all(
      chunk.map(async (row) => {
        const title = (row.title as string | null) ?? "";
        const steps = (row.resolution_steps as string | null) ?? "";
        const rawMerchant = row.merchant as
          | { business_name: string | null; owner_name: string | null }
          | { business_name: string | null; owner_name: string | null }[]
          | null;
        const merchant = Array.isArray(rawMerchant) ? (rawMerchant[0] ?? null) : rawMerchant;
        const verdict = await judgeTicketQuality({
          title,
          steps,
          businessName: merchant?.business_name ?? null,
          ownerName: merchant?.owner_name ?? null,
        });
        if (verdict.source === "ai") judged += 1;
        await admin
          .from("tickets")
          .update({ quality_verdict: verdict, quality_hash: qualityInputHash(title, steps) })
          .eq("id", row.id);
      }),
    );
  }

  revalidatePath("/tickets");
  revalidatePath("/tickets/revisions");
  return { judged, remaining, error: null };
}
