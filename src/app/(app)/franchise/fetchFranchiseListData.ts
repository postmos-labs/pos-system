import type { InstallationDeliveryType } from "@/lib/installationDeliveryType";
import type { ApprovalNote } from "@/lib/approvalNotes";
import type { FranchiseApplication, FranchiseStatus } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows, fetchByIdChunks } from "@/lib/fetchAllRows";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** 목록에서 "끝난 건"으로 보는 상태. 이 상태이면서 오래 갱신되지 않은 건은 기본 조회에서 뺀다. */
export const CLOSED_STATUSES: FranchiseStatus[] = [
  "card_done",
  "internet_done",
  "toss_review_done",
  "completed",
  "canceled",
];
/** 완료·취소 뒤 며칠까지는 기본 목록에 남겨 두는지. 오늘·어제 완료 KPI와 "방금 끝난 건 다시 보기"가 이 안에 든다. */
export const ARCHIVE_AFTER_DAYS = 30;
export type FranchiseListScope = "open" | "archived";

async function fetchAllApplications(
  supabase: SupabaseServerClient,
  isLargeFranchise: boolean | "all",
  scope: FranchiseListScope,
  cutoffIso: string,
  includeIds: string[],
) {
  // 예외가 나도 목록 자체는 떠야 하므로 빈 배열로 대체한다(함수 안에서 못 잡은 예외 대비).
  const workflowIdsPromise =
    scope === "open"
      ? fetchOpenTransferWorkflowIds(supabase).catch((e: unknown) => {
          console.error("fetchOpenTransferWorkflowIds 실패:", e);
          return [] as string[];
        })
      : Promise.resolve<string[]>([]);

  const select =
    "*, sales:profiles!franchise_applications_sales_id_fkey(id,name,role), cs:profiles!franchise_applications_cs_id_fkey(id,name,role), creator:profiles!franchise_applications_created_by_fkey(id,name,role), next_check:franchise_next_check_dates(next_check_date)";

  const runQuery = (from: number, to: number) => {
    let query = supabase.from("franchise_applications").select(select);
    if (isLargeFranchise !== "all") query = query.eq("is_large_franchise", isLargeFranchise);
    if (scope === "open") {
      query = query.or(`status.not.in.(${CLOSED_STATUSES.join(",")}),updated_at.gte.${cutoffIso}`);
    } else {
      query = query.in("status", CLOSED_STATUSES).lt("updated_at", cutoffIso);
    }
    return (
      query
        .order("updated_at", { ascending: false })
        // 페이지 경계에서 행이 중복·누락되지 않도록 유니크 컬럼으로 순서를 확정한다.
        .order("id", { ascending: false })
        .range(from, to)
    );
  };

  type Row = NonNullable<Awaited<ReturnType<typeof runQuery>>["data"]>[number];

  const { data: rows, error } = await fetchAllRows<Row>(runQuery, {
    label: "fetchAllApplications",
  });

  if (error || scope !== "open") {
    return { data: rows, error };
  }

  let result: Row[] = rows;

  const existingIds = new Set(rows.map((r) => r.id));
  const missingIds = includeIds.filter((id) => !existingIds.has(id));
  if (missingIds.length > 0) {
    const { data: includedRows, error: includeError } = await supabase
      .from("franchise_applications")
      .select(select)
      .in("id", missingIds);
    if (includeError) {
      return { data: rows, error: includeError };
    }
    result = [...rows, ...(includedRows ?? [])] as Row[];
  }

  const workflowIds = await workflowIdsPromise;
  const loadedIds = new Set(result.map((r) => r.id));
  const missingWorkflowIds = workflowIds.filter((id) => !loadedIds.has(id));
  if (missingWorkflowIds.length > 0) {
    const { data: workflowRows, error: workflowError } = await fetchByIdChunks(
      missingWorkflowIds,
      (chunk) => {
        let query = supabase.from("franchise_applications").select(select).in("id", chunk);
        if (isLargeFranchise !== "all") query = query.eq("is_large_franchise", isLargeFranchise);
        return query;
      },
    );
    if (workflowError) {
      console.error("fetchAllApplications 이관 진행 건 조회 실패:", workflowError.message);
    } else {
      result = [...result, ...workflowRows] as Row[];
    }
  }

  return { data: result, error: null };
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

async function fetchArchivedSummary(
  supabase: SupabaseServerClient,
  isLargeFranchise: boolean | "all",
  cutoffIso: string,
) {
  const runQuery = (from: number, to: number) => {
    let query = supabase.from("franchise_applications").select("status");
    if (isLargeFranchise !== "all") query = query.eq("is_large_franchise", isLargeFranchise);
    return query
      .in("status", CLOSED_STATUSES)
      .lt("updated_at", cutoffIso)
      .order("id")
      .range(from, to);
  };

  type Row = NonNullable<Awaited<ReturnType<typeof runQuery>>["data"]>[number];

  const { data: rows, error } = await fetchAllRows<Row>(runQuery, {
    label: "fetchArchivedSummary",
  });

  return { data: rows, error };
}

/**
 * 이관이 끝나지 않은 건의 가맹접수 id — 이관 승인 대기 중이거나 기술지원이 설치건을 반려한 건.
 * 완료 계열 상태에서 30일 넘게 갱신이 없으면 기본 목록·검색에서 빠지는데(보관), 이 건들은
 * 아직 사람이 처리해야 해서 보관 규칙과 상관없이 목록에 남겨야 한다. 반려는 설치건만 바꾸고
 * 가맹접수 행의 updated_at은 올리지 않아서, 이관 후 30일이 지나 반려되면 CS가 찾을 수 없게 된다.
 * 조회에 실패해도 목록 자체는 떠야 하므로 빈 배열을 돌려준다.
 */
async function fetchOpenTransferWorkflowIds(supabase: SupabaseServerClient): Promise<string[]> {
  const runPendingQuery = (from: number, to: number) =>
    supabase
      .from("franchise_transfer_approvals")
      .select("franchise_application_id")
      .in("status", ["requested", "cs_responsible_approved"])
      .order("id")
      .range(from, to);

  const runRejectedQuery = (from: number, to: number) =>
    supabase
      .from("installations")
      .select("franchise_application_id")
      .eq("status", "rejected")
      .not("franchise_application_id", "is", null)
      .order("id")
      .range(from, to);

  type PendingRow = NonNullable<Awaited<ReturnType<typeof runPendingQuery>>["data"]>[number];
  type RejectedRow = { franchise_application_id: string | null };

  const [pending, rejected] = await Promise.all([
    fetchAllRows<PendingRow>(runPendingQuery, { label: "fetchOpenTransferWorkflowIds:pending" }),
    fetchAllRows<RejectedRow>(runRejectedQuery, {
      label: "fetchOpenTransferWorkflowIds:rejected",
    }),
  ]);

  const ids = new Set<string>();
  if (pending.error) {
    console.error("fetchOpenTransferWorkflowIds 승인 대기 조회 실패:", pending.error.message);
  } else {
    for (const row of pending.data) {
      if (row.franchise_application_id) ids.add(row.franchise_application_id);
    }
  }
  if (rejected.error) {
    console.error("fetchOpenTransferWorkflowIds 반려 조회 실패:", rejected.error.message);
  } else {
    for (const row of rejected.data) {
      if (row.franchise_application_id) ids.add(row.franchise_application_id);
    }
  }
  return [...ids];
}

async function fetchTransferApprovals(supabase: SupabaseServerClient) {
  const runQuery = (from: number, to: number) =>
    supabase
      .from("franchise_transfer_approvals")
      .select(
        "franchise_application_id,status,delivery_type,requested_by,requested_by_name,requested_at,approved_by,approved_by_name,approved_at,cs_approved_by,cs_approved_by_name,cs_approved_at,approval_notes",
      )
      // 상한(5000행)에 걸리면 오래된 기록부터 잘리도록 최신순으로 받는다. id는 동점 정리용.
      .order("requested_at", { ascending: false })
      .order("id")
      .range(from, to);

  type Row = NonNullable<Awaited<ReturnType<typeof runQuery>>["data"]>[number];

  const { data: rows, error } = await fetchAllRows<Row>(runQuery, {
    label: "fetchTransferApprovals",
  });

  return { data: rows, error };
}

export async function fetchFranchiseListData(
  supabase: SupabaseServerClient,
  userId: string,
  isLargeFranchise: boolean | "all",
  options: { scope?: FranchiseListScope; includeIds?: string[] } = {},
) {
  const scope = options.scope ?? "open";
  const includeIds = options.includeIds ?? [];
  const kstToday = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const kstDayStart = new Date(`${kstToday}T00:00:00+09:00`);
  const kstNextDayStart = new Date(kstDayStart.getTime() + 24 * 60 * 60 * 1000);
  const kstPrevDayStart = new Date(kstDayStart.getTime() - 24 * 60 * 60 * 1000);
  const kstYesterday = new Date(kstDayStart.getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const cutoffMs = Date.now() - ARCHIVE_AFTER_DAYS * 86_400_000;
  const cutoffIso = new Date(cutoffMs).toISOString();
  const archiveCutoffDate = new Date(cutoffMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    { data: rows, error },
    { data: salesProfiles },
    { data: csProfiles },
    { data: currentProfile },
    { data: todayCompletionLogs },
    { data: yesterdayCompletionLogs },
    { data: transferApprovals },
    { data: archivedSummaryRows },
  ] = await Promise.all([
    fetchAllApplications(supabase, isLargeFranchise, scope, cutoffIso, includeIds),
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
    fetchTransferApprovals(supabase),
    scope === "open"
      ? fetchArchivedSummary(supabase, isLargeFranchise, cutoffIso)
      : Promise.resolve({ data: [] as { status: FranchiseStatus }[], error: null }),
  ]);

  const todayCompletedIds = [
    ...new Set((todayCompletionLogs ?? []).map((log) => log.franchise_application_id)),
  ];
  const yesterdayCompletedIds = [
    ...new Set((yesterdayCompletionLogs ?? []).map((log) => log.franchise_application_id)),
  ];

  const archivedSummary =
    scope === "archived"
      ? { total: 0, byStatus: {} as Partial<Record<FranchiseStatus, number>> }
      : (() => {
          const byStatus: Partial<Record<FranchiseStatus, number>> = {};
          for (const row of archivedSummaryRows ?? []) {
            const status = row.status as FranchiseStatus;
            byStatus[status] = (byStatus[status] ?? 0) + 1;
          }
          let total = (archivedSummaryRows ?? []).length;
          for (const row of rows ?? []) {
            const status = row.status as FranchiseStatus;
            if (CLOSED_STATUSES.includes(status) && new Date(row.updated_at).getTime() < cutoffMs) {
              byStatus[status] = Math.max(0, (byStatus[status] ?? 0) - 1);
              total = Math.max(0, total - 1);
            }
          }
          return { total, byStatus };
        })();

  const flatRows = (rows ?? []).map((row) => {
    const nextCheck = (
      row as { next_check?: { next_check_date: string } | { next_check_date: string }[] | null }
    ).next_check;
    const next_check_date = Array.isArray(nextCheck)
      ? (nextCheck[0]?.next_check_date ?? null)
      : (nextCheck?.next_check_date ?? null);
    return { ...row, next_check_date };
  }) as FranchiseApplication[];

  const linkedInstalls: Record<
    string,
    { id: string; status: string; reject_reason?: string | null }
  > = {};
  const linkedInternets: Record<
    string,
    { id: string; status: string | null; category: string | null }
  > = {};
  if (rows && rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const phones = [...new Set(rows.map((r) => r.phone).filter((p): p is string => !!p))];
    const [
      { data: installs, error: installsError },
      { data: internetsById, error: internetsByIdError },
      { data: internetsByPhone, error: internetsByPhoneError },
      { data: callLogsRaw, error: callLogsError },
      { data: rejectedInstalls, error: rejectedInstallsError },
    ] = await Promise.all([
      fetchByIdChunks(ids, (chunk) =>
        supabase
          .from("installations")
          .select("id, status, franchise_application_id")
          .in("franchise_application_id", chunk),
      ),
      fetchByIdChunks(ids, (chunk) =>
        supabase
          .from("internet_management")
          .select("id, status, category, franchise_application_id")
          .in("franchise_application_id", chunk),
      ),
      fetchByIdChunks(phones, (chunk) =>
        supabase
          .from("internet_management")
          .select("id, status, category, phone")
          .is("franchise_application_id", null)
          .in("phone", chunk),
      ),
      fetchByIdChunks(
        ids,
        (chunk) =>
          supabase
            .from("franchise_application_call_logs")
            .select("franchise_application_id, call_type, created_at")
            .in("franchise_application_id", chunk)
            .order("created_at", { ascending: false }),
        40,
      ),
      fetchByIdChunks(ids, (chunk) =>
        supabase
          .from("installations")
          .select("franchise_application_id, notes")
          .eq("status", "rejected")
          .in("franchise_application_id", chunk),
      ),
    ]);
    const connectionError =
      installsError ??
      internetsByIdError ??
      internetsByPhoneError ??
      callLogsError ??
      rejectedInstallsError;
    if (connectionError) {
      console.error("fetchFranchiseListData 연결 조회 실패:", connectionError.message);
    }
    const callLogs = [...(callLogsRaw ?? [])].sort((a, b) =>
      a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
    );
    for (const inst of installs ?? []) {
      if (inst.franchise_application_id)
        linkedInstalls[inst.franchise_application_id] = {
          id: inst.id,
          status: inst.status,
        };
    }
    for (const inst of rejectedInstalls ?? []) {
      const linked = inst.franchise_application_id
        ? linkedInstalls[inst.franchise_application_id]
        : undefined;
      if (linked?.status === "rejected") linked.reject_reason = (inst.notes ?? "").trim() || null;
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
    archivedSummary,
    archiveCutoffDate,
    scope,
  };
}
