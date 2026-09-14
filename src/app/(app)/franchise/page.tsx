import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import FranchiseClient from "./FranchiseClient";
import { fetchFranchiseListData } from "./fetchFranchiseListData";
import { fetchLeadForConversion } from "../leads/actions";

interface Props {
  searchParams: Promise<{ status?: string; highlight?: string; lead?: string }>;
}

export default async function FranchisePage({ searchParams }: Props) {
  const { status, highlight, lead } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const conversionLeadResult = lead ? await fetchLeadForConversion(lead) : null;
  const conversionLead =
    conversionLeadResult?.lead && !conversionLeadResult.lead.converted_franchise_id
      ? {
          id: conversionLeadResult.lead.id,
          business_name: conversionLeadResult.lead.business_name,
          owner_name: conversionLeadResult.lead.owner_name,
          phone: conversionLeadResult.lead.phone,
          assignee_id: conversionLeadResult.lead.assignee_id,
          note: conversionLeadResult.lead.note,
        }
      : undefined;

  const {
    rows,
    error,
    salesProfiles,
    csProfiles,
    currentProfile,
    todayCompletedIds,
    yesterdayCompletedIds,
    transferApprovals,
    linkedInstalls,
    linkedInternets,
    todayDate,
    yesterdayDate,
  } = await fetchFranchiseListData(supabase, user.id, false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {error ? (
        <div className="text-red-500 text-sm">데이터를 불러오지 못했습니다. {error.message}</div>
      ) : (
        <FranchiseClient
          rows={rows}
          salesProfiles={salesProfiles}
          csProfiles={csProfiles}
          currentUserId={user.id}
          currentUserName={currentProfile?.name ?? ""}
          currentUserRole={currentProfile?.role ?? ""}
          currentUserApprovalRole={currentProfile?.approval_role ?? ""}
          initialStatusFilter={status ?? ""}
          initialHighlightId={highlight}
          linkedInstalls={linkedInstalls}
          linkedInternets={linkedInternets}
          todayDate={todayDate}
          todayCompletedIds={todayCompletedIds}
          yesterdayDate={yesterdayDate}
          yesterdayCompletedIds={yesterdayCompletedIds}
          initialTransferApprovals={Object.fromEntries(
            transferApprovals.map((approval) => [approval.franchise_application_id, approval]),
          )}
          mode="default"
          conversionLead={conversionLead}
        />
      )}
    </div>
  );
}
