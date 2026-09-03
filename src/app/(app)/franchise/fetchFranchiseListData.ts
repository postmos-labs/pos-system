import type { InstallationDeliveryType } from "@/lib/installationDeliveryType";
import type { ApprovalNote } from "@/lib/approvalNotes";
import type { FranchiseApplication } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetchAllRows";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function fetchAllApplications(supabase: SupabaseServerClient, isLargeFranchise: boolean) {
  const runQuery = (from: number, to: number) =>
    supabase
      .from("franchise_applications")
      .select(
        "*, sales:profiles!franchise_applications_sales_id_fkey(id,name,role), cs:profiles!franchise_applications_cs_id_fkey(id,name,role), creator:profiles!franchise_applications_created_by_fkey(id,name,role), next_check:franchise_next_check_dates(next_check_date)",
      )
      .eq("is_large_franchise", isLargeFranchise)
      .order("updated_at", { ascending: false })
      // 페이지 경계에서 행이 중복·누락되지 않도록 유니크 컬럼으로 순서를 확정한다.
      .order("id", { ascending: false })
      .range(from, to);

  type Row = NonNullable<Awaited<ReturnType<typeof runQuery>>["data"]>[number];

  const { data: rows, error } = await fetchAllRows<Row>(runQuery, {
    label: "fetchAllApplications",
  });

  return { data: rows, error };
}

export type TransferApproval = {
  franchise_application_id: string;
  status: "requested" | "cs_responsible_approved" | "approved" | "rejected";
  delivery_type: InstallationDeliveryType | null;
  requested_by: string | null;
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

export async function fetchFranchiseListData(
  supabase: SupabaseServerClient,
  userId: string,
  isLargeFranchise: boolean,
) {
  const kstToday = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const kstDayStart = new Date(`${kstToday}T00:00:00+09:00`);
  const kstNextDayStart = new Date(kstDayStart.getTime() + 24 * 60 * 60 * 1000);
  const kstPrevDayStart = new Date(kstDayStart.getTime() - 24 * 60 * 60 * 1000);
  const kstYesterday = new Date(kstDayStart.getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [
    { data: rows, error },
    { data: salesProfiles },
    { data: csProfiles },
    { data: currentProfile },
    { data: todayCompletionLogs },
    { data: yesterdayCompletionLogs },
    { data: transferApprovals },
  ] = await Promise.all([
    fetchAllApplications(supabase, isLargeFranchise),
    supabase
      .from("profiles")
      .select("id,name,role")
      .in("role", ["sales", "admin", "master"])
      .order("name"),
    supabase.from("profiles").select("id,name,role").eq("role", "cs").order("name"),
    supabase.from("profiles").select("name,role,approval_role").eq("id", userId).single(),
    supabase
      .from("franchise_application_logs")
      .select("franchise_application_id")
      .in("to_status", ["card_done", "toss_review_done"])
      .gte("created_at", kstDayStart.toISOString())
      .lt("created_at", kstNextDayStart.toISOString()),
    supabase
      .from("franchise_application_logs")
      .select("franchise_application_id")
      .in("to_status", ["card_done", "toss_review_done"])
      .gte("created_at", kstPrevDayStart.toISOString())
      .lt("created_at", kstDayStart.toISOString()),
    supabase
      .from("franchise_transfer_approvals")
      .select(
        "franchise_application_id,status,delivery_type,requested_by,requested_by_name,requested_at,approved_by,approved_by_name,approved_at,cs_approved_by,cs_approved_by_name,cs_approved_at,approval_notes",
      ),
  ]);

  const todayCompletedIds = [
    ...new Set((todayCompletionLogs ?? []).map((log) => log.franchise_application_id)),
  ];
  const yesterdayCompletedIds = [
    ...new Set((yesterdayCompletionLogs ?? []).map((log) => log.franchise_application_id)),
  ];

  const flatRows = (rows ?? []).map((row) => {
    const nextCheck = (
      row as { next_check?: { next_check_date: string } | { next_check_date: string }[] | null }
    ).next_check;
    const next_check_date = Array.isArray(nextCheck)
      ? (nextCheck[0]?.next_check_date ?? null)
      : (nextCheck?.next_check_date ?? null);
    return { ...row, next_check_date };
  }) as FranchiseApplication[];

  const linkedInstalls: Record<string, { id: string; status: string }> = {};
  const linkedInternets: Record<
    string,
    { id: string; status: string | null; category: string | null }
  > = {};
  if (rows && rows.length > 0) {
    const phones = [...new Set(rows.map((r) => r.phone).filter((p): p is string => !!p))];
    const [
      { data: installs },
      { data: internetsById },
      { data: internetsByPhone },
      { data: callLogs },
    ] = await Promise.all([
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
      supabase
        .from("franchise_application_call_logs")
        .select("franchise_application_id, call_type, created_at")
        .in(
          "franchise_application_id",
          rows.map((row) => row.id),
        )
        .order("created_at", { ascending: false }),
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
    const lastCallByApplicationId: Record<
      string,
      { last_call_type: "missed" | "completed"; last_call_at: string }
    > = {};
    for (const callLog of callLogs ?? []) {
      if (
        !lastCallByApplicationId[callLog.franchise_application_id] &&
        (callLog.call_type === "missed" || callLog.call_type === "completed")
      ) {
        lastCallByApplicationId[callLog.franchise_application_id] = {
          last_call_type: callLog.call_type,
          last_call_at: callLog.created_at,
        };
      }
    }
    for (const row of flatRows) {
      Object.assign(row, lastCallByApplicationId[row.id]);
    }
  }

  return {
    rows: flatRows,
    error,
    salesProfiles: salesProfiles ?? [],
    csProfiles: csProfiles ?? [],
    currentProfile,
    todayCompletedIds,
    yesterdayCompletedIds,
    transferApprovals: (transferApprovals ?? []) as TransferApproval[],
    linkedInstalls,
    linkedInternets,
    todayDate: kstToday,
    yesterdayDate: kstYesterday,
  };
}
