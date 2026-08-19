import { redirect } from "next/navigation";
import { requireMaster } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import { MERCHANT_MEMO_ENTRY_TYPE_LABEL, type MerchantMemoEntryType } from "@/lib/asChecklist";
import LogsClient, { type EmployeeActivityLog } from "./LogsClient";

type Relation<T> = T | T[] | null;

type FranchiseLogRow = {
  id: string;
  from_status: string | null;
  to_status: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  user_name: string | null;
  user: Relation<{ name: string }>;
  franchise_application: Relation<{ business_name: string; owner_name: string }>;
};

type InstallationLogRow = {
  id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  user_name: string | null;
  user: Relation<{ name: string }>;
  installation: Relation<{ customer_name: string }>;
};

type TicketLogRow = {
  id: string;
  from_status: string | null;
  to_status: string | null;
  message: string | null;
  created_at: string;
  user: Relation<{ name: string }>;
  ticket: Relation<{ title: string; merchant: Relation<{ business_name: string }> }>;
};

type InventoryLogRow = {
  id: string;
  item_name: string;
  change: number;
  reason: string | null;
  created_at: string;
  user: Relation<{ name: string }>;
};

type CallLogRow = {
  id: string;
  call_type: "missed" | "completed";
  note: string | null;
  created_at: string;
  user: Relation<{ name: string }>;
  franchise_application: Relation<{ business_name: string; owner_name: string }>;
};

type NotificationLogRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  template_key: string;
  status: string;
  error: string | null;
  created_at: string;
  user_name: string | null;
  user: Relation<{ name: string }>;
};

type MemoEntryRow = {
  id: string;
  content: string;
  entry_type: string | null;
  created_at: string;
  author: Relation<{ name: string }>;
  merchant: Relation<{ business_name: string }>;
};

type PostHistoryRow = {
  id: string;
  content: string;
  created_at: string;
  author: Relation<{ name: string }>;
  installation: Relation<{ customer_name: string }>;
};

type ChangeLogRow = {
  id: string;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
  user_name: string | null;
  user: Relation<{ name: string }>;
  change_request: Relation<{ business_name: string; change_type: string }>;
};

type DeletionLogRow = {
  id: string;
  entity_type: string;
  subject: string | null;
  created_at: string;
  user_name: string | null;
};

function one<T>(relation: Relation<T>) {
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

function kstDateRange(from: string | null, to: string | null) {
  if (!from && !to) return null;
  const startSource = from ?? to!;
  const endSource = to ?? from!;
  const start = new Date(`${startSource}T00:00:00+09:00`);
  const end = new Date(`${endSource}T00:00:00+09:00`);
  return {
    start: start.toISOString(),
    end: new Date(end.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

const DELETION_ENTITY_LABEL: Record<string, string> = {
  franchise_application: "가맹접수",
  installation: "설치건",
  change_request: "변경접수",
  merchant: "가맹점",
};

const CHANGE_TYPE_LABEL_LOCAL: Record<string, string> = {
  bank: "통장변경",
  name: "상호변경",
  ceo: "대표자변경",
  address: "주소변경",
  category: "업종변경",
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; from?: string; to?: string; before?: string }>;
}) {
  const authError = await requireMaster();
  if (authError) redirect("/dashboard");

  const params = await searchParams;
  // date는 기존 단일 날짜 링크 호환용. from/to가 있으면 기간 조회로 동작한다.
  const rawFrom = params.from ?? params.date ?? null;
  const rawTo = params.to ?? params.date ?? null;
  const fromDate = rawFrom && DATE_PATTERN.test(rawFrom) ? rawFrom : null;
  const toDate = rawTo && DATE_PATTERN.test(rawTo) ? rawTo : null;
  const hasDateFilter = Boolean(fromDate || toDate);

  const beforeDate = params.before ? new Date(params.before) : null;
  const beforeCursor =
    !hasDateFilter && beforeDate && !Number.isNaN(beforeDate.getTime())
      ? beforeDate.toISOString()
      : null;
  const range = kstDateRange(fromDate, toDate);
  const supabase = await createClient();

  // 소스별 쿼리를 동일한 날짜 조건/페이지 크기로 맞춘다.
  // 각 테이블마다 select 결과 타입이 달라 공통 시그니처만 좁혀서 다룬다.
  type DateScopedQuery = {
    gte(column: string, value: string): DateScopedQuery;
    lt(column: string, value: string): DateScopedQuery;
    limit(count: number): DateScopedQuery;
  };
  function scoped<T>(query: T): T {
    let q = query as DateScopedQuery;
    if (range) {
      q = q.gte("created_at", range.start).lt("created_at", range.end);
    } else {
      if (beforeCursor) q = q.lt("created_at", beforeCursor);
      q = q.limit(301);
    }
    return q as T;
  }

  const [
    franchiseResult,
    installationResult,
    ticketResult,
    inventoryResult,
    callResult,
    notificationResult,
    memoResult,
    postHistoryResult,
    changeResult,
    deletionResult,
  ] = await Promise.all([
    scoped(
      supabase
        .from("franchise_application_logs")
        .select(
          "id,from_status,to_status,details,created_at,user_name,user:profiles(name),franchise_application:franchise_applications(business_name,owner_name)",
        )
        .order("created_at", { ascending: false }),
    ),
    scoped(
      supabase
        .from("installation_activity_logs")
        .select(
          "id,action,from_status,to_status,details,created_at,user_name,user:profiles!installation_activity_logs_user_id_fkey(name),installation:installations(customer_name)",
        )
        .order("created_at", { ascending: false }),
    ),
    scoped(
      supabase
        .from("ticket_logs")
        .select(
          "id,from_status,to_status,message,created_at,user:profiles(name),ticket:tickets(title,merchant:merchants(business_name))",
        )
        .order("created_at", { ascending: false }),
    ),
    scoped(
      supabase
        .from("inventory_logs")
        .select(
          "id,item_name,change,reason,created_at,user:profiles!inventory_logs_user_id_fkey(name)",
        )
        .order("created_at", { ascending: false }),
    ),
    scoped(
      supabase
        .from("franchise_application_call_logs")
        .select(
          "id,call_type,note,created_at,user:profiles(name),franchise_application:franchise_applications(business_name,owner_name)",
        )
        .order("created_at", { ascending: false }),
    ),
    scoped(
      supabase
        .from("notification_logs")
        .select(
          "id,entity_type,entity_id,template_key,status,error,created_at,user_name,user:profiles(name)",
        )
        .order("created_at", { ascending: false }),
    ),
    scoped(
      supabase
        .from("merchant_memo_entries")
        .select(
          "id,content,entry_type,created_at,author:profiles(name),merchant:merchants(business_name)",
        )
        .order("created_at", { ascending: false }),
    ),
    scoped(
      supabase
        .from("installation_post_history")
        .select(
          "id,content,created_at,author:profiles(name),installation:installations(customer_name)",
        )
        .order("created_at", { ascending: false }),
    ),
    scoped(
      supabase
        .from("change_request_logs")
        .select(
          "id,from_status,to_status,created_at,user_name,user:profiles(name),change_request:change_requests(business_name,change_type)",
        )
        .order("created_at", { ascending: false }),
    ),
    scoped(
      supabase
        .from("deletion_logs")
        .select("id,entity_type,subject,created_at,user_name")
        .order("created_at", { ascending: false }),
    ),
  ]);

  // 아직 마이그레이션이 적용되지 않은 환경에서도 화면이 죽지 않도록 소스별로 실패를 흡수한다
  const rowsOf = <T,>(result: { data: unknown; error: unknown }): T[] =>
    result.error ? [] : ((result.data ?? []) as unknown as T[]);

  const franchiseLogs = rowsOf<FranchiseLogRow>(franchiseResult);
  const installationLogs = rowsOf<InstallationLogRow>(installationResult);
  const ticketLogs = rowsOf<TicketLogRow>(ticketResult);
  const inventoryLogs = rowsOf<InventoryLogRow>(inventoryResult);
  const callLogs = rowsOf<CallLogRow>(callResult);
  const notificationLogs = rowsOf<NotificationLogRow>(notificationResult);
  const memoEntries = rowsOf<MemoEntryRow>(memoResult);
  const postHistory = rowsOf<PostHistoryRow>(postHistoryResult);
  const changeLogs = rowsOf<ChangeLogRow>(changeResult);
  const deletionLogs = rowsOf<DeletionLogRow>(deletionResult);

  // 알림톡 로그는 entity_type/entity_id가 다형적이라 대상 이름을 따로 조회한다
  const notifiedInstallIds = [
    ...new Set(
      notificationLogs.filter((log) => log.entity_type === "install").map((log) => log.entity_id),
    ),
  ];
  const installNameById = new Map<string, string>();
  if (notifiedInstallIds.length > 0) {
    const { data } = await supabase
      .from("installations")
      .select("id,customer_name")
      .in("id", notifiedInstallIds);
    for (const row of (data ?? []) as { id: string; customer_name: string | null }[]) {
      if (row.customer_name) installNameById.set(row.id, row.customer_name);
    }
  }

  const combinedLogs: EmployeeActivityLog[] = [
    ...franchiseLogs.map((log) => {
      const subject = one(log.franchise_application);
      return {
        id: `franchise-${log.id}`,
        source: "franchise" as const,
        sourceLabel: "가맹접수",
        actorName: log.user_name ?? one(log.user)?.name ?? "알 수 없음",
        subject: subject?.business_name || subject?.owner_name || "삭제된 가맹접수",
        fromStatus: log.from_status,
        toStatus: log.to_status,
        details: log.details,
        description: null,
        createdAt: log.created_at,
      };
    }),
    ...installationLogs.map((log) => ({
      id: `installation-${log.id}`,
      source: "installation" as const,
      sourceLabel: "설치",
      actorName: log.user_name ?? one(log.user)?.name ?? "알 수 없음",
      subject: one(log.installation)?.customer_name || "삭제된 설치건",
      fromStatus: log.from_status,
      toStatus: log.to_status,
      details: log.details,
      description: log.action,
      createdAt: log.created_at,
    })),
    ...ticketLogs.map((log) => {
      const ticket = one(log.ticket);
      return {
        id: `ticket-${log.id}`,
        source: "ticket" as const,
        sourceLabel: "작업",
        actorName: one(log.user)?.name ?? "알 수 없음",
        subject: one(ticket?.merchant ?? null)?.business_name || ticket?.title || "삭제된 작업",
        fromStatus: log.from_status,
        toStatus: log.to_status,
        details: null,
        description: log.message,
        createdAt: log.created_at,
      };
    }),
    ...inventoryLogs.map((log) => ({
      id: `inventory-${log.id}`,
      source: "inventory" as const,
      sourceLabel: "재고",
      actorName: one(log.user)?.name ?? "알 수 없음",
      subject: log.item_name,
      fromStatus: null,
      toStatus: null,
      details: null,
      description: `수량 ${log.change > 0 ? "+" : ""}${log.change}${log.reason ? ` · ${log.reason}` : ""}`,
      createdAt: log.created_at,
    })),
    ...callLogs.map((log) => {
      const subject = one(log.franchise_application);
      return {
        id: `call-${log.id}`,
        source: "call" as const,
        sourceLabel: "통화",
        actorName: one(log.user)?.name ?? "알 수 없음",
        subject: subject?.business_name || subject?.owner_name || "삭제된 가맹접수",
        fromStatus: null,
        toStatus: null,
        details: null,
        description: `${log.call_type === "missed" ? "통화 부재" : "통화 완료"}${log.note ? ` · ${log.note}` : ""}`,
        createdAt: log.created_at,
      };
    }),
    ...notificationLogs.map((log) => ({
      id: `notification-${log.id}`,
      source: "alimtalk" as const,
      sourceLabel: "알림톡",
      actorName: log.user_name ?? one(log.user)?.name ?? "알 수 없음",
      subject:
        log.entity_type === "install"
          ? (installNameById.get(log.entity_id) ?? "삭제된 설치건")
          : log.entity_type === "contract"
            ? "계약서"
            : "-",
      fromStatus: null,
      toStatus: null,
      details: null,
      description: `${log.template_key}${log.status === "failed" ? ` · 발송실패${log.error ? `: ${log.error}` : ""}` : ""}`,
      createdAt: log.created_at,
    })),
    ...memoEntries.map((log) => {
      const typeLabel = log.entry_type
        ? (MERCHANT_MEMO_ENTRY_TYPE_LABEL[log.entry_type as MerchantMemoEntryType] ?? null)
        : null;
      return {
        id: `memo-${log.id}`,
        source: "memo" as const,
        sourceLabel: "메모",
        actorName: one(log.author)?.name ?? "알 수 없음",
        subject: one(log.merchant)?.business_name || "삭제된 가맹점",
        fromStatus: null,
        toStatus: null,
        details: null,
        description: `${typeLabel ? `[${typeLabel}] ` : ""}${log.content}`,
        createdAt: log.created_at,
      };
    }),
    ...postHistory.map((log) => ({
      id: `post-${log.id}`,
      source: "memo" as const,
      sourceLabel: "설치후기록",
      actorName: one(log.author)?.name ?? "알 수 없음",
      subject: one(log.installation)?.customer_name || "삭제된 설치건",
      fromStatus: null,
      toStatus: null,
      details: null,
      description: log.content,
      createdAt: log.created_at,
    })),
    ...changeLogs.map((log) => {
      const request = one(log.change_request);
      const typeLabel = request?.change_type
        ? (CHANGE_TYPE_LABEL_LOCAL[request.change_type] ?? null)
        : null;
      return {
        id: `change-${log.id}`,
        source: "change" as const,
        sourceLabel: "변경접수",
        actorName: log.user_name ?? one(log.user)?.name ?? "알 수 없음",
        subject: `${request?.business_name || "삭제된 변경접수"}${typeLabel ? ` (${typeLabel})` : ""}`,
        fromStatus: log.from_status,
        toStatus: log.to_status,
        details: null,
        description: null,
        createdAt: log.created_at,
      };
    }),
    ...deletionLogs.map((log) => ({
      id: `deletion-${log.id}`,
      source: "deletion" as const,
      sourceLabel: "삭제",
      actorName: log.user_name ?? "알 수 없음",
      subject: log.subject || "(이름 없음)",
      fromStatus: null,
      toStatus: null,
      details: null,
      description: `${DELETION_ENTITY_LABEL[log.entity_type] ?? log.entity_type} 삭제`,
      createdAt: log.created_at,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const hasOlderLogs = !hasDateFilter && combinedLogs.length > 300;
  const logs = hasDateFilter ? combinedLogs : combinedLogs.slice(0, 300);
  const nextCursor = hasOlderLogs ? (logs.at(-1)?.createdAt ?? null) : null;

  const periodText =
    fromDate && toDate && fromDate !== toDate
      ? `${fromDate} ~ ${toDate} 업무 처리 이력`
      : fromDate || toDate
        ? `${fromDate ?? toDate} 업무 처리 이력`
        : beforeCursor
          ? "이전 이력"
          : "전체 업무 통합 이력 (페이지당 300건)";

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">직원 활동 로그</h1>
        <p className="mt-1 text-sm text-slate-500">{periodText}</p>
      </div>

      <LogsClient
        logs={logs}
        fromDate={fromDate}
        toDate={toDate}
        nextCursor={nextCursor}
        isOlderPage={beforeCursor !== null}
      />
    </div>
  );
}
