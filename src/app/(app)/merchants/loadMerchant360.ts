import { createClient } from "@/lib/supabase/server";
import {
  FRANCHISE_CHANNEL_LABEL,
  FRANCHISE_INSTALL_LOG_LABEL,
  FRANCHISE_STATUS_COLOR,
  FRANCHISE_STATUS_LABEL,
  FRANCHISE_TRANSFER_LOG_LABEL,
  type FranchiseChannel,
  type FranchiseStatus,
} from "@/types";
import type {
  Merchant360Application,
  Merchant360Merchant,
  MerchantDerivedSummary,
  MerchantEquipmentCategory,
  MerchantEquipmentCategorySummary,
  MerchantEquipmentItem,
  MerchantMemoEntry,
  MerchantMemoStage,
  WorkHistoryItem,
} from "./merchant360";

// franchise_application_logs.to_status는 실제 접수 상태(FranchiseStatus) 외에도
// 이관승인 반려, 설치이관 생성 같은 내부 이벤트 문자열이 함께 저장된다. 이력에 노출할 것만 한글로 매핑.
// 이관승인 요청/1차승인/최종승인은 franchise_transfer_approvals 값으로 아래에서 별도 표시하므로 여기선 생략.
const NON_STATUS_LOG_LABEL: Record<string, string> = {
  ...FRANCHISE_INSTALL_LOG_LABEL,
  transfer_cs_responsible_rejected: FRANCHISE_TRANSFER_LOG_LABEL.transfer_cs_responsible_rejected,
  transfer_team_lead_rejected: FRANCHISE_TRANSFER_LOG_LABEL.transfer_team_lead_rejected,
};

const EQUIPMENT_CATEGORIES: MerchantEquipmentCategory[] = ["main_pos", "kiosk", "table_order"];

// 113/114번 마이그레이션이 아직 적용되지 않은 dev/기존 환경에서도 이 컬럼을 select하면
// "column does not exist"(42703) 에러가 난다. 이 코드를 실패로 취급하지 않고 기본 컬럼만
// 다시 조회해 빈 값으로 흡수한다.
function isMissingColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist/i.test(error.message ?? "")
  );
}

const BASE_MERCHANT_COLUMNS =
  "id,business_name,owner_name,phone,address,address_detail,business_number,open_date,toss_merchant_no,contract_expires_at,brand,created_at,franchise_application_id";
const EXTENDED_MERCHANT_COLUMNS = `${BASE_MERCHANT_COLUMNS},operation_status,contract_started_at,contact_name,contact_phone,install_note`;

const BASE_EQUIPMENT_COLUMNS = "id,name,serial_number,status,installed_date,notes,created_at";
const EXTENDED_EQUIPMENT_COLUMNS = `${BASE_EQUIPMENT_COLUMNS},category,quantity,components,manufacturer,supplier,location,source`;

type InstallationRow = {
  id: string;
  customer_name: string | null;
  status: string;
  delivery_type: string | null;
  created_at: string;
  assignee: { name: string | null }[] | { name: string | null } | null;
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

function latestTimestamp(values: (string | null | undefined)[]) {
  const times = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  if (!times.length) return undefined;
  return Math.max(...times);
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

export function installationStatusLabel(status: string, deliveryType: string | null) {
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

export function installationStatusClass(status: string) {
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

const CASE_TYPE_LABEL: Record<string, string> = {
  new: "신규 설치",
  conversion: "전환",
  succession: "승계",
  name_change: "명의변경",
};

function profileName(value: { name: string | null }[] | { name: string | null } | null) {
  return Array.isArray(value) ? (value[0]?.name ?? null) : (value?.name ?? null);
}

function computeEquipmentCategorySummaries(
  equipment: MerchantEquipmentItem[],
): MerchantEquipmentCategorySummary[] {
  const active = equipment.filter((item) => item.status !== "removed");
  return EQUIPMENT_CATEGORIES.map((category) => {
    const rows = active.filter((item) => (item.category ?? "etc") === category);
    const totalQuantity = rows.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
    const componentsSummary = rows
      .map((item) => item.components || item.name)
      .filter(Boolean)
      .join(" + ");
    return { category, totalQuantity, componentsSummary };
  });
}

async function fetchMerchantRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  merchantId: string,
) {
  const extended = await supabase
    .from("merchants")
    .select(EXTENDED_MERCHANT_COLUMNS)
    .eq("id", merchantId)
    .maybeSingle();
  if (extended.error && isMissingColumnError(extended.error)) {
    return supabase
      .from("merchants")
      .select(BASE_MERCHANT_COLUMNS)
      .eq("id", merchantId)
      .maybeSingle();
  }
  return extended;
}

async function fetchEquipmentRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  merchantId: string,
) {
  const extended = await supabase
    .from("merchant_equipment")
    .select(EXTENDED_EQUIPMENT_COLUMNS)
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false });
  if (extended.error && isMissingColumnError(extended.error)) {
    return supabase
      .from("merchant_equipment")
      .select(BASE_EQUIPMENT_COLUMNS)
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false });
  }
  return extended;
}

export async function loadMerchant360(
  supabase: Awaited<ReturnType<typeof createClient>>,
  merchantId: string,
): Promise<{
  merchant: Merchant360Merchant | null;
  application: Merchant360Application | null;
  history: WorkHistoryItem[];
  memos: MerchantMemoEntry[];
  equipment: MerchantEquipmentItem[];
  equipmentCategorySummaries: MerchantEquipmentCategorySummary[];
  derivedSummary: MerchantDerivedSummary | null;
}> {
  const { data: merchantRow } = await fetchMerchantRow(supabase, merchantId);
  const merchant = merchantRow as Merchant360Merchant | null;

  if (!merchant)
    return {
      merchant: null,
      application: null,
      history: [],
      memos: [],
      equipment: [],
      equipmentCategorySummaries: [],
      derivedSummary: null,
    };

  const franchiseApplicationId = merchant.franchise_application_id;
  const [
    applicationResult,
    installationsResult,
    franchiseLogsResult,
    transferApprovalResult,
    memoEntriesResult,
    equipmentResultRaw,
    asTicketResult,
  ] = await Promise.all([
    franchiseApplicationId
      ? supabase
          .from("franchise_applications")
          .select(
            "id,business_name,status,created_at,channel,internet,van_company,program,case_type,cs:profiles!franchise_applications_cs_id_fkey(name),tech:profiles!franchise_applications_tech_id_fkey(name),creator:profiles!franchise_applications_created_by_fkey(name)",
          )
          .eq("id", franchiseApplicationId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    franchiseApplicationId
      ? supabase
          .from("installations")
          .select(
            "id,customer_name,status,delivery_type,created_at,assignee:profiles!installations_assigned_to_fkey(name)",
          )
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
    fetchEquipmentRows(supabase, merchantId),
    supabase
      .from("tickets")
      .select("created_at")
      .eq("merchant_id", merchantId)
      .eq("type", "as")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const equipmentResult = equipmentResultRaw;

  const application = applicationResult.data as {
    id: string;
    business_name: string | null;
    status: string;
    created_at: string;
    channel: string | null;
    internet: string | null;
    van_company: string | null;
    program: string | null;
    case_type: string | null;
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
  const completionTimestamps = activityLogs
    .filter((log) => log.to_status === "completed" || log.to_status === "delivery_sent")
    .map((log) => log.created_at);
  const firstCompletionAt = firstTimestamp(completionTimestamps);
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
        program: application.program,
        case_type: application.case_type,
      }
    : null;

  // 설치정보 카드의 파생값: 최초 설치일 / 최근 재설치일 / 최신 설치건 / 계약기간 / 최근 A/S / 설치 세트 총합
  const sortedCompletionTimes = completionTimestamps
    .map((value) => ({ value, time: new Date(value).getTime() }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((a, b) => a.time - b.time);
  const firstInstalledAt = sortedCompletionTimes[0]?.value ?? null;
  const lastReinstalledAt =
    sortedCompletionTimes.length >= 2
      ? sortedCompletionTimes[sortedCompletionTimes.length - 1].value
      : null;

  const latestTransferInstallation = installations
    .filter((item) => ["install", "transfer"].includes(item.delivery_type ?? ""))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  const latestInstallation = latestTransferInstallation
    ? {
        status: latestTransferInstallation.status,
        statusLabel: installationStatusLabel(
          latestTransferInstallation.status,
          latestTransferInstallation.delivery_type,
        ),
        statusClass: installationStatusClass(latestTransferInstallation.status),
        assigneeName: profileName(latestTransferInstallation.assignee),
        deliveryType: latestTransferInstallation.delivery_type,
      }
    : null;

  let contractMonths: number | null = null;
  if (merchant.contract_started_at && merchant.contract_expires_at) {
    const start = new Date(merchant.contract_started_at);
    const end = new Date(merchant.contract_expires_at);
    if (Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())) {
      contractMonths =
        (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    }
  }

  const equipmentCategorySummaries = computeEquipmentCategorySummaries(equipment);
  const totalEquipmentSets = equipment
    .filter((item) => item.status !== "removed")
    .reduce((sum, item) => sum + (item.quantity ?? 1), 0);

  const asInstallationTimes = installations
    .filter((item) => item.delivery_type === "as")
    .map((item) => item.created_at);
  const asMemoTimes = memos
    .filter((memo) => memo.entry_type === "as")
    .map((memo) => memo.created_at);
  const lastAsAtMs = latestTimestamp([
    ...asInstallationTimes,
    ...asMemoTimes,
    asTicketResult.data?.created_at,
  ]);
  const lastAsAt = lastAsAtMs !== undefined ? new Date(lastAsAtMs).toISOString() : null;

  const derivedSummary: MerchantDerivedSummary = {
    firstInstalledAt,
    lastReinstalledAt,
    contractMonths,
    totalEquipmentSets,
    lastAsAt,
    latestInstallation,
  };

  return {
    merchant: merchant as Merchant360Merchant,
    application: applicationSummary,
    history,
    memos,
    equipment,
    equipmentCategorySummaries,
    derivedSummary,
  };
}

export function caseTypeLabel(caseType: string | null | undefined, deliveryType?: string | null) {
  if (caseType && CASE_TYPE_LABEL[caseType]) return CASE_TYPE_LABEL[caseType];
  if (deliveryType === "transfer") return "이관 설치";
  if (deliveryType === "install") return "신규 설치";
  return "-";
}
