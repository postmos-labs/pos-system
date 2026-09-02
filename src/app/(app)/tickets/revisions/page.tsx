import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Profile } from "@/types";
import RevisionsClient, { type RevisionRow } from "./RevisionsClient";

interface Props {
  searchParams: Promise<{ status?: string }>;
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

function ticketInfo(
  value: { id: string; title: string | null }[] | { id: string; title: string | null } | null,
) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

const VALID_STATUSES = ["open", "resolved", "all"] as const;
type StatusFilter = (typeof VALID_STATUSES)[number];

export default async function TicketRevisionsPage({ searchParams }: Props) {
  const params = await searchParams;
  const status: StatusFilter = VALID_STATUSES.includes(params.status as StatusFilter)
    ? (params.status as StatusFilter)
    : "open";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");
  if ((profile as Profile).role !== "master") redirect("/tickets");

  let query = supabase
    .from("ticket_revision_requests")
    .select("*, ticket:tickets(id,title)")
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
    ticket: { id: string; title: string | null }[] | { id: string; title: string | null } | null;
    message: string;
    status: "open" | "resolved";
    requested_by_name: string | null;
    requested_at: string;
    resolved_by_name: string | null;
    resolved_at: string | null;
    resolved_note: string | null;
  };

  const rows: RevisionRow[] = schemaReady
    ? ((data ?? []) as RawRow[]).map((row) => {
        const ticket = ticketInfo(row.ticket);
        return {
          id: row.id as string,
          ticket_id: row.ticket_id as string,
          ticket_title: ticket?.title ?? null,
          message: row.message as string,
          status: row.status as "open" | "resolved",
          requested_by_name: (row.requested_by_name as string | null) ?? null,
          requested_at: row.requested_at as string,
          resolved_by_name: (row.resolved_by_name as string | null) ?? null,
          resolved_at: (row.resolved_at as string | null) ?? null,
          resolved_note: (row.resolved_note as string | null) ?? null,
        };
      })
    : [];

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">수정 요청 관리</h1>
        <p className="mt-1 text-sm text-slate-500">
          마스터가 보낸 인입내역 수정 요청과 처리 여부를 관리합니다.
        </p>
      </div>

      {!schemaReady && (
        <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-700">
          수정 요청 마이그레이션(supabase/139)이 아직 적용되지 않았습니다.
        </div>
      )}

      <RevisionsClient rows={rows} status={status} openCount={openCount} />
    </div>
  );
}
