import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  FRANCHISE_CHANNEL_LABEL,
  FRANCHISE_INSTALL_LOG_LABEL,
  FRANCHISE_STATUS_COLOR,
  FRANCHISE_STATUS_LABEL,
  FRANCHISE_TRANSFER_LOG_LABEL,
  type FranchiseChannel,
  type FranchiseStatus,
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

// franchise_application_logs.to_status는 실제 접수 상태(FranchiseStatus) 외에도
// 이관승인 반려, 설치이관 생성 같은 내부 이벤트 문자열이 함께 저장된다. 이력에 노출할 것만 한글로 매핑.
// 이관승인 요청/1차승인/최종승인은 franchise_transfer_approvals 값으로 아래에서 별도 표시하므로 여기선 생략.
const NON_STATUS_LOG_LABEL: Record<string, string> = {
  ...FRANCHISE_INSTALL_LOG_LABEL,
  transfer_cs_responsible_rejected: FRANCHISE_TRANSFER_LOG_LABEL.transfer_cs_responsible_rejected,
  transfer_team_lead_rejected: FRANCHISE_TRANSFER_LOG_LABEL.transfer_team_lead_rejected,
};

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

type InstallationActivityLogRow = {
  installation_id: string;
  user_name: string | null;
  action: string;
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
    franchiseLogsResult,
    transferApprovalResult,
    memoEntriesResult,
    equipmentResult,
  ] = await Promise.all([
    franchiseApplicationId
      ? supabase
          .from("franchise_applications")
          .select(
            "id,business_name,status,created_at,channel,internet,van_company,cs:profiles!franchise_applications_cs_id_fkey(name),tech:profiles!franchise_applications_tech_id_fkey(name),creator:profiles!franchise_applications_created_by_fkey(name)",
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
    franchiseApplicationId
      ? supabase
          .from("franchise_application_logs")
          .select("user_name,to_status,created_at")
          .eq("franchise_application_id", franchiseApplicationId)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    franchiseApplicationId
      ? supabase
          .from("franchise_transfer_approvals")
          .select("requested_by_name,cs_approved_by_name,approved_by_name,status")
          .eq("franchise_application_id", franchiseApplicationId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
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
    channel: string | null;
    internet: string | null;
    van_company: string | null;
    cs: { name: string | null }[] | { name: string | null } | null;
    tech: { name: string | null }[] | { name: string | null } | null;
    creator: { name: string | null }[] | { name: string | null } | null;
  } | null;
  const installations = (installationsResult.data ?? []) as InstallationRow[];
  const franchiseLogs = (franchiseLogsResult.data ?? []) as Array<{
    user_name: string | null;
    to_status: string | null;
    created_at: string;
  }>;
  const transferApproval = transferApprovalResult.data as {
    requested_by_name: string | null;
    cs_approved_by_name: string | null;
    approved_by_name: string | null;
    status: string;
  } | null;

  function franchiseActorChain() {
    const creatorName = Array.isArray(application?.creator)
      ? application?.creator[0]?.name
      : application?.creator?.name;
    const parts: string[] = [];
    if (creatorName) parts.push(`등록 ${creatorName}`);
    const seen = new Set<string>();
    for (const log of franchiseLogs) {
      if (!log.user_name || !log.to_status) continue;
      // 알림톡 발송 기록, 이관승인 단계 기록은 아래에서 franchise_transfer_approvals로 별도 표시하므로 건너뜀
      if (log.to_status.startsWith("alimtalk:")) continue;
      if (
        log.to_status === "transfer_approval_requested" ||
        log.to_status === "transfer_cs_responsible_approved" ||
        log.to_status === "transfer_team_lead_approved"
      )
        continue;
      const key = `${log.to_status}:${log.user_name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const statusLabel =
        FRANCHISE_STATUS_LABEL[log.to_status as FranchiseStatus] ??
        NON_STATUS_LOG_LABEL[log.to_status] ??
        null;
      if (!statusLabel) continue;
      parts.push(`${statusLabel} ${log.user_name}`);
    }
    if (transferApproval) {
      if (transferApproval.requested_by_name)
        parts.push(`이관신청 ${transferApproval.requested_by_name}`);
      if (transferApproval.cs_approved_by_name)
        parts.push(`1차승인 ${transferApproval.cs_approved_by_name}`);
      if (transferApproval.approved_by_name)
        parts.push(`최종승인 ${transferApproval.approved_by_name}`);
    }
    return parts.length ? parts.join(" > ") : undefined;
  }

  const memoEntries = memoEntriesResult.error
    ? []
    : ((memoEntriesResult.data ?? []) as MerchantMemoEntryRow[]);
  const installationIds = installations.map((installation) => installation.id);
  const activityLogsResult = installationIds.length
    ? await supabase
        .from("installation_activity_logs")
        .select("installation_id,user_name,action,to_status,created_at")
        .in("installation_id", installationIds)
        .order("created_at", { ascending: true })
    : { data: [] as InstallationActivityLogRow[], error: null };
  const activityLogs = (activityLogsResult.data ?? []) as InstallationActivityLogRow[];
  const firstCompletionAt = firstTimestamp(
    activityLogs
      .filter((log) => log.to_status === "completed" || log.to_status === "delivery_sent")
      .map((log) => log.created_at),
  );
  const latestActorByInstallation = new Map<string, string>();
  const requestedByInstallation = new Map<string, string>();
  const decidedByInstallation = new Map<string, { label: string; name: string }>();
  for (const log of activityLogs) {
    if (!log.user_name) continue;
    latestActorByInstallation.set(log.installation_id, log.user_name);
    if (log.action === "completion_requested") {
      requestedByInstallation.set(log.installation_id, log.user_name);
    } else if (log.action === "completion_approved") {
      decidedByInstallation.set(log.installation_id, { label: "승인", name: log.user_name });
    } else if (log.action === "completion_rejected") {
      decidedByInstallation.set(log.installation_id, { label: "반려", name: log.user_name });
    }
  }
  function installationActorName(installationId: string) {
    const requested = requestedByInstallation.get(installationId);
    const decided = decidedByInstallation.get(installationId);
    if (requested && decided) return `승인신청 ${requested} > ${decided.label} ${decided.name}`;
    if (requested) return `승인신청 ${requested}`;
    return latestActorByInstallation.get(installationId);
  }
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
      actorName: franchiseActorChain(),
    });
  }

  for (const installation of installations.filter((item) =>
    ["install", "transfer"].includes(item.delivery_type ?? ""),
  )) {
    const status = installationStatusLabel(installation.status, installation.delivery_type);
    history.push({
      id: installation.id,
      date: installation.created_at,
      title: "설치 작업",
      summary: installation.customer_name || merchant.business_name,
      category: "install",
      status,
      statusClass: installationStatusClass(installation.status),
      href: `/installs?id=${installation.id}`,
      actorName: installationActorName(installation.id),
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
        channel_label: application.channel
          ? (FRANCHISE_CHANNEL_LABEL[application.channel as FranchiseChannel] ??
            application.channel)
          : null,
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
