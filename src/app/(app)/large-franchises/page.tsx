import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import FranchiseClient from "../franchise/FranchiseClient";
import { fetchFranchiseListData } from "../franchise/fetchFranchiseListData";

interface Props {
  searchParams: Promise<{ status?: string; highlight?: string }>;
}

export default async function LargeFranchisesPage({ searchParams }: Props) {
  const { status, highlight } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
  } = await fetchFranchiseListData(supabase, user.id, true);

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
          mode="large_franchise"
        />
      )}
    </div>
  );
}
