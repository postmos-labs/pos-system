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
  user_name: string | null;
  user: Relation<{ name: string }>;
  ticket: Relation<{ title: string; merchant: Relation<{ business_name: string }> }>;
};

type InventoryLogRow = {
  id: string;
  item_name: string;
  change: number;
  reason: string | null;
  created_at: string;
  user_name: string | null;
  user: Relation<{ name: string }>;
};

type CallLogRow = {
  id: string;
  call_type: "missed" | "completed";
  note: string | null;
  created_at: string;
  user_name: string | null;
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
  author_name: string | null;
  author: Relation<{ name: string }>;
  merchant: Relation<{ business_name: string }>;
};

type PostHistoryRow = {
  id: string;
  content: string;
  created_at: string;
  author_name: string | null;
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
  user: Relation<{ name: string }>;
};

// 작성자 표기는 여기 하나로 모은다.
// 075 트리거는 이름을 못 찾으면 '알수없음'(붙여쓰기)을 넣는데 화면은 '알 수 없음'을 쓴다.
// 두 표기가 섞이지 않도록 마지막에 한 번 정리한다.
const UNKNOWN_ACTOR = "알 수 없음";
function actorNameOf(...candidates: (string | null | undefined)[]) {
  for (const value of candidates) {
    const name = value?.trim();
    if (name && name !== "알수없음") return name;
  }
  return UNKNOWN_ACTOR;
}

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

/**
 * PostgREST의 or() 필터는 원문 문자열로 조합되므로 문법을 깨는 문자를 제거한다.
 * ilike 와일드카드(%,*)도 사용자가 직접 넣지 못하게 막는다.
 */
function sanitizeSearch(value: string) {
  return value
    .replace(/[,()%*\\"']/g, "")
    .trim()
    .slice(0, 60);
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; from?: string; to?: string; before?: string; q?: string }>;
}) {
  const authError = await requireMaster();
  if (authError) redirect("/dashboard");

  const params = await searchParams;
  // date는 기존 단일 날짜 링크 호환용. from/to가 있으면 기간 조회로 동작한다.
  const rawFrom = params.from ?? params.date ?? null;
  const rawTo = params.to ?? params.date ?? null;
  const fromDate = rawFrom && DATE_PATTERN.test(rawFrom) ? rawFrom : null;
  const toDate = rawTo && DATE_PATTERN.test(rawTo) ? rawTo : null;

  const merchantQuery = sanitizeSearch(params.q ?? "");
  const hasMerchantQuery = merchantQuery.length > 0;
  const like = `%${merchantQuery}%`;

  const beforeDate = params.before ? new Date(params.before) : null;
  const beforeCursor =
    beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate.toISOString() : null;
  const range = kstDateRange(fromDate, toDate);
  const supabase = await createClient();

  // 가맹점 검색 시 알림톡 로그는 entity_type이 다형적이라 대상 설치건 id를 먼저 좁힌다
  let searchedInstallIds: string[] = [];
  if (hasMerchantQuery) {
    const { data } = await supabase
      .from("installations")
      .select("id")
      .ilike("customer_name", like)
      .limit(500);
    searchedInstallIds = (data ?? []).map((row) => row.id as string);
  }

  const emptyResult = Promise.resolve({ data: [] as unknown[], error: null });

  // 소스별 쿼리를 동일한 날짜 조건/페이지 크기로 맞춘다.
  // 각 테이블마다 select 결과 타입이 달라 공통 시그니처만 좁혀서 다룬다.
  type DateScopedQuery = {
    gte(column: string, value: string): DateScopedQuery;
    lt(column: string, value: string): DateScopedQuery;
    limit(count: number): DateScopedQuery;
  };
  function scoped<T>(query: T): T {
    let q = query as DateScopedQuery;
    if (range) q = q.gte("created_at", range.start).lt("created_at", range.end);
    // 기간 조회에도 커서와 상한을 똑같이 건다. 예전에는 기간 조회만 상한이 없어
    // 소스별로 조용히 잘렸고(PostgREST 기본 상한), "더 보기"도 나오지 않았다.
    if (beforeCursor) q = q.lt("created_at", beforeCursor);
    return q.limit(301) as T;
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
      (() => {
        const base = supabase
          .from("franchise_application_logs")
          .select(
            `id,from_status,to_status,details,created_at,user_name,user:profiles(name),franchise_application:franchise_applications${hasMerchantQuery ? "!inner" : ""}(business_name,owner_name)`,
          )
          .order("created_at", { ascending: false });
        return hasMerchantQuery
          ? base.or(`business_name.ilike.${like},owner_name.ilike.${like}`, {
              referencedTable: "franchise_application",
            })
          : base;
      })(),
    ),
    scoped(
      (() => {
        const base = supabase
          .from("installation_activity_logs")
          .select(
            `id,action,from_status,to_status,details,created_at,user_name,user:profiles!installation_activity_logs_user_id_fkey(name),installation:installations${hasMerchantQuery ? "!inner" : ""}(customer_name)`,
          )
          .order("created_at", { ascending: false });
        return hasMerchantQuery ? base.ilike("installation.customer_name", like) : base;
      })(),
    ),
    scoped(
      (() => {
        const base = supabase
          .from("ticket_logs")
          .select(
            `id,from_status,to_status,message,created_at,user_name,user:profiles(name),ticket:tickets${hasMerchantQuery ? "!inner" : ""}(title,merchant:merchants${hasMerchantQuery ? "!inner" : ""}(business_name))`,
          )
          .order("created_at", { ascending: false });
        return hasMerchantQuery ? base.ilike("ticket.merchant.business_name", like) : base;
      })(),
    ),
    // 재고는 가맹점 개념이 없으므로 가맹점 검색 시 제외한다
    hasMerchantQuery
      ? emptyResult
      : scoped(
          supabase
            .from("inventory_logs")
            .select(
              "id,item_name,change,reason,created_at,user_name,user:profiles!inventory_logs_user_id_fkey(name)",
            )
            .order("created_at", { ascending: false }),
        ),
    scoped(
      (() => {
        const base = supabase
          .from("franchise_application_call_logs")
          .select(
            `id,call_type,note,created_at,user_name,user:profiles(name),franchise_application:franchise_applications${hasMerchantQuery ? "!inner" : ""}(business_name,owner_name)`,
          )
          .order("created_at", { ascending: false });
        return hasMerchantQuery
          ? base.or(`business_name.ilike.${like},owner_name.ilike.${like}`, {
              referencedTable: "franchise_application",
            })
          : base;
      })(),
    ),
    hasMerchantQuery && searchedInstallIds.length === 0
      ? emptyResult
      : scoped(
          (() => {
            const base = supabase
              .from("notification_logs")
              .select(
                "id,entity_type,entity_id,template_key,status,error,created_at,user_name,user:profiles(name)",
              )
              .order("created_at", { ascending: false });
            return hasMerchantQuery
              ? base.eq("entity_type", "install").in("entity_id", searchedInstallIds)
              : base;
          })(),
        ),
    scoped(
      (() => {
        const base = supabase
          .from("merchant_memo_entries")
          .select(
            `id,content,entry_type,created_at,author_name,author:profiles(name),merchant:merchants${hasMerchantQuery ? "!inner" : ""}(business_name)`,
          )
          .order("created_at", { ascending: false });
        return hasMerchantQuery ? base.ilike("merchant.business_name", like) : base;
      })(),
    ),
    scoped(
      (() => {
        const base = supabase
          .from("installation_post_history")
          .select(
            `id,content,created_at,author_name,author:profiles(name),installation:installations${hasMerchantQuery ? "!inner" : ""}(customer_name)`,
          )
          .order("created_at", { ascending: false });
        return hasMerchantQuery ? base.ilike("installation.customer_name", like) : base;
      })(),
    ),
    scoped(
      (() => {
        const base = supabase
          .from("change_request_logs")
          .select(
            `id,from_status,to_status,created_at,user_name,user:profiles(name),change_request:change_requests${hasMerchantQuery ? "!inner" : ""}(business_name,change_type)`,
          )
          .order("created_at", { ascending: false });
        return hasMerchantQuery ? base.ilike("change_request.business_name", like) : base;
      })(),
    ),
    scoped(
      (() => {
        // 삭제 로그는 상호명을 subject 컬럼에 그대로 담아두므로 조인 없이 바로 거른다
        const base = supabase
          .from("deletion_logs")
          .select("id,entity_type,subject,created_at,user_name,user:profiles(name)")
          .order("created_at", { ascending: false });
        return hasMerchantQuery ? base.ilike("subject", like) : base;
      })(),
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
        actorName: actorNameOf(log.user_name, one(log.user)?.name),
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
      actorName: actorNameOf(log.user_name, one(log.user)?.name),
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
        sourceLabel: "인입내역",
        actorName: actorNameOf(log.user_name, one(log.user)?.name),
        subject: one(ticket?.merchant ?? null)?.business_name || ticket?.title || "삭제된 인입내역",
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
      actorName: actorNameOf(log.user_name, one(log.user)?.name),
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
        actorName: actorNameOf(log.user_name, one(log.user)?.name),
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
      actorName: actorNameOf(log.user_name, one(log.user)?.name),
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
        actorName: actorNameOf(log.author_name, one(log.author)?.name),
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
      actorName: actorNameOf(log.author_name, one(log.author)?.name),
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
        actorName: actorNameOf(log.user_name, one(log.user)?.name),
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
      actorName: actorNameOf(log.user_name, one(log.user)?.name),
      subject: log.subject || "(이름 없음)",
      fromStatus: null,
      toStatus: null,
      details: null,
      description: `${DELETION_ENTITY_LABEL[log.entity_type] ?? log.entity_type} 삭제`,
      createdAt: log.created_at,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const hasOlderLogs = combinedLogs.length > 300;
  const logs = combinedLogs.slice(0, 300);
  const nextCursor = hasOlderLogs ? (logs.at(-1)?.createdAt ?? null) : null;

  // 이전 페이지로 넘어가도 무슨 조건으로 보고 있는지 남아야 한다.
  // 예전에는 beforeCursor가 있으면 "이전 이력"이 검색어·기간을 통째로 덮어썼다.
  const searchText = hasMerchantQuery ? `'${merchantQuery}' 가맹점 검색 결과` : null;
  const dateText =
    fromDate && toDate && fromDate !== toDate
      ? `${fromDate} ~ ${toDate} 업무 처리 이력`
      : fromDate || toDate
        ? `${fromDate ?? toDate} 업무 처리 이력`
        : null;
  const basePeriod = searchText
    ? dateText
      ? `${searchText} · ${dateText}`
      : `${searchText} (전체 기간)`
    : (dateText ?? "전체 업무 통합 이력 (페이지당 300건)");
  const periodText = beforeCursor ? `${basePeriod} · 이전 페이지` : basePeriod;

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
        merchantQuery={merchantQuery}
        nextCursor={nextCursor}
        isOlderPage={beforeCursor !== null}
      />
    </div>
  );
}
