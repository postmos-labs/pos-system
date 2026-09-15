import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import FranchiseClient from "./FranchiseClient";
import { fetchFranchiseListData } from "./fetchFranchiseListData";
import { fetchLeadForConversion } from "../leads/actions";
import type { ApplicantType, FranchiseChannel } from "@/types";

interface Props {
  searchParams: Promise<{ status?: string; highlight?: string; lead?: string; id?: string }>;
}

export default async function FranchisePage({ searchParams }: Props) {
  const { status, highlight, lead, id } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const conversionLeadResult = lead ? await fetchLeadForConversion(lead) : null;
  const conversionLead =
    conversionLeadResult?.lead &&
    !conversionLeadResult.lead.converted_franchise_id &&
    !conversionLeadResult.lead.closed_at
      ? {
          id: conversionLeadResult.lead.id,
          business_name: conversionLeadResult.lead.business_name,
          owner_name: conversionLeadResult.lead.owner_name,
          phone: conversionLeadResult.lead.phone,
          assignee_id: conversionLeadResult.lead.assignee_id,
          note: conversionLeadResult.lead.note,
          applicant_type: (conversionLeadResult.lead.applicant_type ??
            "individual") as ApplicantType,
          business_number: conversionLeadResult.lead.business_number ?? "",
          channel: (conversionLeadResult.lead.channel ?? "") as FranchiseChannel | "",
          is_rental: conversionLeadResult.lead.is_rental ?? false,
          is_installment: conversionLeadResult.lead.is_installment ?? false,
          reception_date: conversionLeadResult.lead.reception_date ?? "",
          card_apply_date: conversionLeadResult.lead.card_apply_date ?? "",
          internet: conversionLeadResult.lead.internet ?? "",
          program: conversionLeadResult.lead.program ?? "",
          equipment_items: conversionLeadResult.lead.equipment_items ?? [],
          address: conversionLeadResult.lead.address ?? "",
          address_detail: conversionLeadResult.lead.address_detail ?? "",
          open_date: conversionLeadResult.lead.open_date ?? "",
          install_date: conversionLeadResult.lead.install_date ?? "",
          van_company: conversionLeadResult.lead.van_company ?? "",
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
    archivedSummary,
    archiveCutoffDate,
  } = await fetchFranchiseListData(supabase, user.id, false, {
    includeIds: [highlight, id].filter((v): v is string => !!v),
  });

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
          initialHighlightId={highlight ?? id}
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
          archivedSummary={archivedSummary}
          archiveCutoffDate={archiveCutoffDate}
        />
      )}
    </div>
  );
}
