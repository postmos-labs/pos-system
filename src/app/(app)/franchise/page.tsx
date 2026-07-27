import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import FranchiseClient from "./FranchiseClient";
import type { InstallationDeliveryType } from "@/lib/installationDeliveryType";
import type { ApprovalNote } from "@/lib/approvalNotes";

interface Props {
  searchParams: Promise<{ status?: string; highlight?: string }>;
}

type TransferApproval = {
  franchise_application_id: string;
  status: "requested" | "cs_responsible_approved" | "approved" | "rejected";
  delivery_type: InstallationDeliveryType | null;
  requested_by: string;
  requested_by_name: string;
  requested_at: string;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  cs_approved_by: string | null;
  cs_approved_by_name: string | null;
  cs_approved_at: string | null;
  approval_notes: ApprovalNote[];
};

export default async function FranchisePage({ searchParams }: Props) {
  const { status, highlight } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const kstToday = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const kstDayStart = new Date(`${kstToday}T00:00:00+09:00`);
  const kstNextDayStart = new Date(kstDayStart.getTime() + 24 * 60 * 60 * 1000);

  const [
    { data: rows, error },
    { data: salesProfiles },
    { data: csProfiles },
    { data: currentProfile },
    { data: todayCompletionLogs },
    { data: transferApprovals },
  ] = await Promise.all([
    supabase
      .from("franchise_applications")
      .select(
        "*, sales:profiles!franchise_applications_sales_id_fkey(id,name,role), cs:profiles!franchise_applications_cs_id_fkey(id,name,role), creator:profiles!franchise_applications_created_by_fkey(id,name,role)",
      )
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id,name,role")
      .in("role", ["sales", "admin", "master"])
      .order("name"),
    supabase
      .from("profiles")
      .select("id,name,role")
      .in("role", ["cs", "admin", "master"])
      .order("name"),
    supabase.from("profiles").select("name,role,approval_role").eq("id", user.id).single(),
    supabase
      .from("franchise_application_logs")
      .select("franchise_application_id")
      .in("to_status", ["card_done", "toss_review_done"])
      .gte("created_at", kstDayStart.toISOString())
      .lt("created_at", kstNextDayStart.toISOString()),
    supabase
      .from("franchise_transfer_approvals")
      .select(
        "franchise_application_id,status,delivery_type,requested_by,requested_by_name,requested_at,approved_by,approved_by_name,approved_at,cs_approved_by,cs_approved_by_name,cs_approved_at,approval_notes",
      ),
  ]);

  const todayCompletedIds = [
    ...new Set((todayCompletionLogs ?? []).map((log) => log.franchise_application_id)),
  ];

  const linkedInstalls: Record<string, { id: string; status: string }> = {};
  const linkedInternets: Record<
    string,
    { id: string; status: string | null; category: string | null }
  > = {};
  if (rows && rows.length > 0) {
    const phones = [...new Set(rows.map((r) => r.phone).filter((p): p is string => !!p))];
    const [{ data: installs }, { data: internetsById }, { data: internetsByPhone }] =
      await Promise.all([
        supabase
          .from("installations")
          .select("id, status, franchise_application_id")
          .in(
            "franchise_application_id",
            rows.map((r) => r.id),
          ),
        supabase
          .from("internet_management")
          .select("id, status, category, franchise_application_id")
          .in(
            "franchise_application_id",
            rows.map((r) => r.id),
          ),

        phones.length > 0
          ? supabase
              .from("internet_management")
              .select("id, status, category, phone")
              .is("franchise_application_id", null)
              .in("phone", phones)
          : Promise.resolve({
              data: [] as {
                id: string;
                status: string | null;
                category: string | null;
                phone: string | null;
              }[],
            }),
      ]);
    for (const inst of installs ?? []) {
      if (inst.franchise_application_id)
        linkedInstalls[inst.franchise_application_id] = {
          id: inst.id,
          status: inst.status,
        };
    }
    for (const net of internetsById ?? []) {
      if (net.franchise_application_id)
        linkedInternets[net.franchise_application_id] = {
          id: net.id,
          status: net.status,
          category: net.category,
        };
    }
    const normalizePhone = (p: string) => p.replace(/\D/g, "");
    const phoneToFranchiseId = new Map(
      rows.filter((r) => r.phone).map((r) => [normalizePhone(r.phone as string), r.id]),
    );
    for (const net of internetsByPhone ?? []) {
      const fid = net.phone ? phoneToFranchiseId.get(normalizePhone(net.phone)) : undefined;
      if (fid && !linkedInternets[fid])
        linkedInternets[fid] = {
          id: net.id,
          status: net.status,
          category: net.category,
        };
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {error ? (
        <div className="text-red-500 text-sm">데이터를 불러오지 못했습니다: {error.message}</div>
      ) : (
        <FranchiseClient
          rows={rows ?? []}
          salesProfiles={salesProfiles ?? []}
          csProfiles={csProfiles ?? []}
          currentUserId={user.id}
          currentUserName={currentProfile?.name ?? ""}
          currentUserRole={currentProfile?.role ?? ""}
          currentUserApprovalRole={currentProfile?.approval_role ?? ""}
          initialStatusFilter={status ?? ""}
          initialHighlightId={highlight}
          linkedInstalls={linkedInstalls}
          linkedInternets={linkedInternets}
          todayDate={kstToday}
          todayCompletedIds={todayCompletedIds}
          initialTransferApprovals={
            Object.fromEntries(
              (transferApprovals ?? []).map((approval) => [
                approval.franchise_application_id,
                approval,
              ]),
            ) as Record<string, TransferApproval>
          }
        />
      )}
    </div>
  );
}
