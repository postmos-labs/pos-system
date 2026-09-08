import type { createClient } from "@/lib/supabase/server";
import { inspectTicket } from "@/lib/resolutionQuality";
import type { RevisionRow } from "./revisions/RevisionsClient";

// 수정 요청 목록 조립. 현황 페이지(/tickets/revisions)와 인입내역의 상세창이 같이 쓴다.
// "요청 후 수정됐는지"와 "지금 품질"을 여기서 계산하므로 두 화면의 판정이 어긋나지 않는다.

export const REVISION_STATUS_FILTERS = ["open", "resolved", "canceled", "all"] as const;
export type RevisionStatusFilter = (typeof REVISION_STATUS_FILTERS)[number];

// 42P01: relation does not exist / PGRST205: PostgREST 스키마 캐시에 표가 없음.
// 139번 마이그레이션(ticket_revision_requests)이 아직 적용되지 않은 환경에서 쓴다.
export function isMissingRevisionTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /ticket_revision_requests|schema cache|relation .* does not exist/i.test(error.message ?? "")
  );
}

type TicketMerchant = { business_name?: string | null; owner_name?: string | null };

type TicketJoin = {
  id: string;
  title: string | null;
  resolution_steps: string | null;
  updated_at: string | null;
  merchant: TicketMerchant[] | TicketMerchant | null;
};

function ticketInfo(value: TicketJoin[] | TicketJoin | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function merchantInfo(value: TicketMerchant[] | TicketMerchant | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export async function loadRevisionRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  status: RevisionStatusFilter,
): Promise<{ rows: RevisionRow[]; schemaReady: boolean; openCount: number }> {
  let query = supabase
    .from("ticket_revision_requests")
    .select(
      "*, ticket:tickets(id, title, resolution_steps, updated_at, merchant:merchants(business_name, owner_name))",
    )
    .order("requested_at", { ascending: false });
  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  const schemaReady = !isMissingRevisionTable(error);

  let openCount = 0;
  if (schemaReady) {
    const { count } = await supabase
      .from("ticket_revision_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "open");
    openCount = count ?? 0;
  }

  type RawRow = {
    id: string;
    ticket_id: string;
    ticket: TicketJoin[] | TicketJoin | null;
    message: string;
    status: "open" | "resolved" | "canceled";
    requested_by_name: string | null;
    requested_at: string;
    resolved_by_name: string | null;
    resolved_at: string | null;
    resolved_note: string | null;
    canceled_by_name?: string | null;
    canceled_at?: string | null;
    canceled_note?: string | null;
  };

  const rows: RevisionRow[] = schemaReady
    ? ((data ?? []) as RawRow[]).map((row) => {
        const ticket = ticketInfo(row.ticket);
        const merchant = merchantInfo(ticket?.merchant);

        // 요청 이후에 인입내역이 바뀌었는지. tickets.updated_at은 수정할 때마다 트리거로 갱신된다.
        const editedAt =
          ticket?.updated_at &&
          new Date(ticket.updated_at).getTime() > new Date(row.requested_at).getTime()
            ? ticket.updated_at
            : null;
        // 지금 내용에 규칙을 다시 돌린다. 절차가 비어 있으면 "통과"가 아니라 "절차 없음"이다.
        const steps = ticket?.resolution_steps ?? "";
        const issues = steps.trim()
          ? inspectTicket({
              title: ticket?.title ?? "",
              steps,
              businessName: merchant?.business_name ?? null,
              ownerName: merchant?.owner_name ?? null,
            })
          : [];
        const currentQuality: "pass" | "fail" | "empty" = !steps.trim()
          ? "empty"
          : issues.length
            ? "fail"
            : "pass";

        return {
          id: row.id as string,
          ticket_id: row.ticket_id as string,
          ticket_title: ticket?.title ?? null,
          message: row.message as string,
          status: row.status as "open" | "resolved" | "canceled",
          requested_by_name: (row.requested_by_name as string | null) ?? null,
          requested_at: row.requested_at as string,
          resolved_by_name: (row.resolved_by_name as string | null) ?? null,
          resolved_at: (row.resolved_at as string | null) ?? null,
          resolved_note: (row.resolved_note as string | null) ?? null,
          edited_at: editedAt,
          current_quality: currentQuality,
          current_issue_labels: issues.map((issue) => issue.label),
          canceled_by_name: row.canceled_by_name ?? null,
          canceled_at: row.canceled_at ?? null,
          canceled_note: row.canceled_note ?? null,
        };
      })
    : [];

  return { rows, schemaReady, openCount };
}
