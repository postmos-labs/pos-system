import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CHANGE_STATUS_COLOR,
  CHANGE_STATUS_LABEL,
  CHANGE_TYPE_LABEL,
  FRANCHISE_STATUS_COLOR,
  FRANCHISE_STATUS_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  type ChangeRequestStatus,
  type ChangeType,
  type FranchiseStatus,
  type TicketStatus,
} from "@/types";
import MerchantsClient from "./MerchantsClient";
import type {
  Merchant360Application,
  Merchant360Merchant,
  MerchantEquipmentItem,
  MerchantMemoEntry,
  MerchantMemoStage,
  WorkHistoryItem,
} from "./merchant360";

const PAGE_SIZE = 50;

interface Props {
  searchParams: Promise<{ page?: string; id?: string }>;
}

type InstallationRow = {
  id: string;
  customer_name: string | null;
  status: string;
  delivery_type: string | null;
  created_at: string;
};

type TicketRow = {
  id: string;
  title: string;
  status: string;
  created_at: string;
};

type InstallationActivityLogRow = {
  installation_id: string;
  to_status: string | null;
  created_at: string;
};

type MerchantMemoEntryRow = {
  id: string;
  content: string;
  created_at: string;
  created_by: string | null;
  author: { name: string }[];
  entry_type: "as" | "claim" | "general" | "etc" | null;
  checklist: Record<string, boolean> | null;
};

function firstTimestamp(values: string[]) {
  return values
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
}

function classifyMemo(
  createdAt: string,
  installations: InstallationRow[],
  firstCompletionAt: number | undefined,
): MerchantMemoStage {
  const activeInstallations = installations.filter(
    (installation) => installation.status !== "rejected",
  );
  if (activeInstallations.length === 0) return "before_transfer";

  const memoAt = new Date(createdAt).getTime();
  const firstTransferAt = firstTimestamp(
    activeInstallations.map((installation) => installation.created_at),
  );
  if (!Number.isFinite(memoAt) || firstTransferAt === undefined || memoAt < firstTransferAt) {
    return "before_transfer";
  }
  if (firstCompletionAt !== undefined && memoAt >= firstCompletionAt) {
    return "after_completion";
  }
  return "after_transfer";
}

function installationStatusLabel(status: string, deliveryType: string | null) {
  if (status === "completed" && deliveryType === "as") return "AS완료";
  if (status === "completed" && deliveryType === "delivery") return "완료";
  return (
    {
      received: "접수",
      preparing: "물품준비",
      scheduled: "일정확정",
      in_transit: "이동중",
      delivery_sent: "택배발송",
      completed: "설치완료",
      rejected: "반려",
    }[status] ?? status
  );
}

function installationStatusClass(status: string) {
  return (
    {
      received: "bg-slate-100 text-slate-600",
      preparing: "bg-blue-50 text-blue-600",
      scheduled: "bg-purple-50 text-purple-600",
      in_transit: "bg-amber-50 text-amber-600",
      delivery_sent: "bg-amber-50 text-amber-600",
      completed: "bg-emerald-50 text-emerald-600",
      rejected: "bg-red-50 text-red-600",
    }[status] ?? "bg-slate-100 text-slate-600"
  );
}

async function loadMerchant360(
  supabase: Awaited<ReturnType<typeof createClient>>,
  merchantId: string,
): Promise<{
  merchant: Merchant360Merchant | null;
  application: Merchant360Application | null;
  history: WorkHistoryItem[];
  memos: MerchantMemoEntry[];
  equipment: MerchantEquipmentItem[];
}> {
  const { data: merchant } = await supabase
    .from("merchants")
    .select(
      "id,business_name,owner_name,phone,address,address_detail,business_number,open_date,toss_merchant_no,contract_expires_at,brand,created_at,franchise_application_id",
    )
    .eq("id", merchantId)
    .maybeSingle();

  if (!merchant)
    return { merchant: null, application: null, history: [], memos: [], equipment: [] };

  const franchiseApplicationId = merchant.franchise_application_id;
  const [
    applicationResult,
    installationsResult,
    ticketsResult,
    changesResult,
    postHistoryResult,
    memoEntriesResult,
    equipmentResult,
  ] = await Promise.all([
    franchiseApplicationId
      ? supabase
          .from("franchise_applications")
          .select(
            "id,business_name,status,created_at,reception_channel,internet,van_company,cs:profiles!franchise_applications_cs_id_fkey(name),tech:profiles!franchise_applications_tech_id_fkey(name)",
          )
          .eq("id", franchiseApplicationId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    franchiseApplicationId
      ? supabase
          .from("installations")
          .select("id,customer_name,status,delivery_type,created_at")
          .eq("franchise_application_id", franchiseApplicationId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as InstallationRow[], error: null }),
    supabase
      .from("tickets")
      .select("id,title,status,created_at")
      .eq("merchant_id", merchantId)
      .eq("type", "as")
      .order("created_at", { ascending: false }),
    supabase
      .from("change_requests")
      .select("id,business_name,change_type,status,before_value,after_value,created_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("installation_post_history")
      .select("id,installation_id,content,created_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("merchant_memo_entries")
      .select("id,content,created_at,created_by,entry_type,checklist,author:profiles(name)")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("merchant_equipment")
      .select("id,name,serial_number,status,installed_date,notes,created_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false }),
  ]);

  const application = applicationResult.data as {
    id: string;
    business_name: string | null;
    status: string;
    created_at: string;
    reception_channel: string | null;
    internet: string | null;
    van_company: string | null;
    cs: { name: string | null }[] | { name: string | null } | null;
    tech: { name: string | null }[] | { name: string | null } | null;
  } | null;
  const installations = (installationsResult.data ?? []) as InstallationRow[];
  const tickets = (ticketsResult.data ?? []) as TicketRow[];
  const changes = (changesResult.data ?? []) as Array<{
    id: string;
    business_name: string;
    change_type: string;
    status: string;
    before_value: string | null;
    after_value: string | null;
    created_at: string;
  }>;
  const postHistory = postHistoryResult.error
    ? []
    : ((postHistoryResult.data ?? []) as Array<{
        id: string;
        installation_id: string;
        content: string;
        created_at: string;
      }>);
  const memoEntries = memoEntriesResult.error
    ? []
    : ((memoEntriesResult.data ?? []) as MerchantMemoEntryRow[]);
  const installationIds = installations.map((installation) => installation.id);
  const activityLogsResult = installationIds.length
    ? await supabase
        .from("installation_activity_logs")
        .select("installation_id,to_status,created_at")
        .in("installation_id", installationIds)
        .in("to_status", ["completed", "delivery_sent"])
        .order("created_at", { ascending: true })
    : { data: [] as InstallationActivityLogRow[], error: null };
  const activityLogs = (activityLogsResult.data ?? []) as InstallationActivityLogRow[];
  const firstCompletionAt = firstTimestamp(activityLogs.map((log) => log.created_at));
  const memos: MerchantMemoEntry[] = memoEntries.map((memo) => ({
    id: memo.id,
    content: memo.content,
    created_at: memo.created_at,
    created_by: memo.created_by,
    author_name: memo.author[0]?.name ?? null,
    stage: classifyMemo(memo.created_at, installations, firstCompletionAt),
    entry_type: memo.entry_type ?? "general",
    checklist: memo.checklist,
  }));

  const history: WorkHistoryItem[] = [];
  if (application) {
    const status = application.status as FranchiseStatus;
    history.push({
      id: application.id,
      date: application.created_at,
      title: "가맹 접수",
      summary: application.business_name || merchant.business_name,
      category: "reception",
      status: FRANCHISE_STATUS_LABEL[status] ?? application.status,
      statusClass: FRANCHISE_STATUS_COLOR[status] ?? "bg-slate-100 text-slate-600",
      href: `/franchise?id=${application.id}`,
    });
  }

  for (const installation of installations.filter((item) =>
    ["install", "transfer", "as"].includes(item.delivery_type ?? ""),
  )) {
    const isAs = installation.delivery_type === "as";
    const status = installationStatusLabel(installation.status, installation.delivery_type);
    history.push({
      id: installation.id,
      date: installation.created_at,
      title: isAs ? "AS 작업" : "설치 작업",
      summary: installation.customer_name || merchant.business_name,
      category: isAs ? "as" : "install",
      status,
      statusClass: installationStatusClass(installation.status),
      href: `/installs?id=${installation.id}`,
    });
  }

  for (const ticket of tickets) {
    const status = ticket.status as TicketStatus;
    history.push({
      id: ticket.id,
      date: ticket.created_at,
      title: ticket.title,
      summary: "티켓 AS",
      category: "as",
      status: STATUS_LABEL[status] ?? ticket.status,
      statusClass: STATUS_COLOR[status] ?? "bg-slate-100 text-slate-600",
      href: `/tickets/${ticket.id}`,
    });
  }

  for (const change of changes) {
    const changeType = change.change_type as ChangeType;
    const changeStatus = change.status as ChangeRequestStatus;
    const beforeAfter = [change.before_value, change.after_value].filter(Boolean).join(" → ");
    history.push({
      id: change.id,
      date: change.created_at,
      title: `변경 · ${CHANGE_TYPE_LABEL[changeType] ?? change.change_type}`,
      summary: beforeAfter || change.business_name,
      category: "change",
      status: CHANGE_STATUS_LABEL[changeStatus] ?? change.status,
      statusClass: CHANGE_STATUS_COLOR[changeStatus] ?? "bg-slate-100 text-slate-600",
      href: `/changes?id=${change.id}`,
    });
  }

  for (const item of postHistory) {
    history.push({
      id: item.id,
      date: item.created_at,
      title: "설치·배송 이후 메모",
      summary: item.content,
      category: "post",
      status: "기록",
      statusClass: "bg-violet-50 text-violet-600",
      href: `/installs?id=${item.installation_id}`,
    });
  }

  history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const equipment = equipmentResult.error
    ? []
    : ((equipmentResult.data ?? []) as MerchantEquipmentItem[]);

  const applicationSummary: Merchant360Application | null = application
    ? {
        status: application.status,
        status_label:
          FRANCHISE_STATUS_LABEL[application.status as FranchiseStatus] ?? application.status,
        status_class:
          FRANCHISE_STATUS_COLOR[application.status as FranchiseStatus] ??
          "bg-slate-100 text-slate-600",
        reception_channel: application.reception_channel,
        cs_name: Array.isArray(application.cs)
          ? (application.cs[0]?.name ?? null)
          : (application.cs?.name ?? null),
        tech_name: Array.isArray(application.tech)
          ? (application.tech[0]?.name ?? null)
          : (application.tech?.name ?? null),
        internet: application.internet,
        van_company: application.van_company,
      }
    : null;

  return {
    merchant: merchant as Merchant360Merchant,
    application: applicationSummary,
    history,
    memos,
    equipment,
  };
}

export default async function MerchantsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: merchants, count } = await supabase
    .from("merchants")
    .select(
      "id,business_name,owner_name,phone,address,address_detail,created_at,franchise_application_id",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const merchantRows = (merchants ?? []) as Merchant360Merchant[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const selectedId = params.id ?? merchantRows[0]?.id ?? null;
  const selected = selectedId ? await loadMerchant360(supabase, selectedId) : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <div className="flex shrink-0 items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">가맹점 360도 뷰</h1>
          <p className="mt-1 text-sm text-slate-500">
            가맹점 정보와 관련 업무 이력을 한 화면에서 확인합니다.
          </p>
        </div>
        <span className="text-sm font-medium text-slate-500">가맹점 {totalCount}</span>
      </div>

      <MerchantsClient
        merchants={merchantRows}
        selectedId={selectedId}
        selectedMerchant={selected?.merchant ?? null}
        selectedApplication={selected?.application ?? null}
        history={selected?.history ?? []}
        memos={selected?.memos ?? []}
        equipment={selected?.equipment ?? []}
        page={page}
        totalPages={totalPages}
      />

      {totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-center gap-2">
          <Link
            href={`/merchants?page=${Math.max(1, page - 1)}${selectedId ? `&id=${selectedId}` : ""}`}
            className={`rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium ${page <= 1 ? "pointer-events-none text-slate-300" : "text-slate-600 hover:bg-slate-50"}`}
          >
            이전
          </Link>
          <span className="text-sm font-medium text-slate-500">
            {page} / {totalPages}
          </span>
          <Link
            href={`/merchants?page=${Math.min(totalPages, page + 1)}${selectedId ? `&id=${selectedId}` : ""}`}
            className={`rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium ${page >= totalPages ? "pointer-events-none text-slate-300" : "text-slate-600 hover:bg-slate-50"}`}
          >
            다음
          </Link>
        </div>
      )}
    </div>
  );
}
