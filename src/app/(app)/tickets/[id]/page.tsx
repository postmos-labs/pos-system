import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  STATUS_LABEL,
  STATUS_COLOR,
  TEAM_LABEL,
  TEAM_COLOR,
  type TicketStatus,
  type TicketTeam,
  type Profile,
} from "@/types";
import {
  MEMO_ISSUE_CATEGORY_LABEL,
  MEMO_RESOLUTION_LABEL,
  type MemoIssueCategory,
  type MemoResolution,
} from "@/app/(app)/merchants/merchant360";
import TicketActions from "./TicketActions";
import TicketMerchantCard from "./TicketMerchantCard";
import TicketLogs from "./TicketLogs";
import TicketInfoEdit from "./TicketInfoEdit";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TicketDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: ticket }, { data: logs }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("tickets")
      .select(
        `
        *,
        merchant:merchants(*),
        sales:profiles!tickets_sales_id_fkey(*),
        cs:profiles!tickets_cs_id_fkey(*),
        tech:profiles!tickets_tech_id_fkey(*)
      `,
      )
      .eq("id", id)
      .single(),
    supabase
      .from("ticket_logs")
      .select("*, user:profiles(*)")
      .eq("ticket_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!profile) redirect("/login");
  if (!ticket) notFound();

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      {}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[ticket.status as TicketStatus]}`}
          >
            {STATUS_LABEL[ticket.status as TicketStatus]}
          </span>
          {ticket.team && TEAM_LABEL[ticket.team as TicketTeam] && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${TEAM_COLOR[ticket.team as TicketTeam]}`}
            >
              {TEAM_LABEL[ticket.team as TicketTeam]}
            </span>
          )}
          {ticket.issue_category &&
            MEMO_ISSUE_CATEGORY_LABEL[ticket.issue_category as MemoIssueCategory] && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600">
                {MEMO_ISSUE_CATEGORY_LABEL[ticket.issue_category as MemoIssueCategory]}
              </span>
            )}
          {ticket.resolution && MEMO_RESOLUTION_LABEL[ticket.resolution as MemoResolution] && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600">
              {MEMO_RESOLUTION_LABEL[ticket.resolution as MemoResolution]}
            </span>
          )}
          {ticket.is_repeat === true && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">
              또 그럼
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold text-gray-900">{ticket.title}</h1>
        <p className="text-sm text-gray-500 mt-1">
          등록 {format(new Date(ticket.created_at), "yyyy.M.d HH:mm", { locale: ko })}
        </p>
      </div>

      {}
      <TicketMerchantCard
        ticketId={ticket.id as string}
        merchantId={(ticket.merchant_id as string | null) ?? null}
        businessName={(ticket.merchant as { business_name?: string } | null)?.business_name ?? null}
        phone={(ticket.merchant as { phone?: string | null } | null)?.phone ?? null}
        canEdit={["admin", "master", "sales", "cs", "tech"].includes((profile as Profile).role)}
      />

      {}
      <TicketInfoEdit
        ticket={ticket as any}
        canEdit={["admin", "master", "sales", "cs", "tech"].includes((profile as Profile).role)}
      />

      {}
      <TicketActions ticket={ticket as any} profile={profile as Profile} />

      {}
      <TicketLogs logs={logs ?? []} />
    </div>
  );
}
