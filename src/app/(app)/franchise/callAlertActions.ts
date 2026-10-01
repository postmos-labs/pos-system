"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  FRANCHISE_CALL_ALERT_EVENTS,
  FRANCHISE_CALL_ALERT_NOTIFICATION_TYPE,
  canEditFranchiseCallAlerts,
  emptyFranchiseCallAlertSetting,
  resolveFranchiseCallAlertRecipients,
  type FranchiseCallAlertCandidate,
  type FranchiseCallAlertConfig,
  type FranchiseCallAlertEvent,
  type FranchiseCallAlertSetting,
} from "@/lib/franchiseCallAlerts";

const MISSING_TABLE_ERROR =
  "알림 설정 표가 아직 없습니다. supabase/157 마이그레이션을 먼저 실행해주세요.";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 42P01: relation does not exist / PGRST205: PostgREST 스키마 캐시에 표가 없음.
// 157번 마이그레이션이 아직 적용되지 않은 환경에서 쓴다.
function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /schema cache|relation .* does not exist/i.test(error.message ?? "")
  );
}

interface Caller {
  id: string;
  name: string;
  role: string | null;
  approval_role: string | null;
}

async function loadCaller(): Promise<Caller | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, role, approval_role")
    .eq("id", user.id)
    .single();
  if (!profile) return null;
  return { ...(profile as Caller), name: (profile.name as string | null) || "사용자" };
}

type AlertClient = ReturnType<typeof createAdminClient> | Awaited<ReturnType<typeof createClient>>;

async function loadSettings(client: AlertClient): Promise<{
  settings: Record<FranchiseCallAlertEvent, FranchiseCallAlertSetting>;
  missingTable: boolean;
  error: string | null;
}> {
  const settings = {
    reconsult: emptyFranchiseCallAlertSetting("reconsult"),
    cancel: emptyFranchiseCallAlertSetting("cancel"),
  } satisfies Record<FranchiseCallAlertEvent, FranchiseCallAlertSetting>;

  const { data, error } = await client
    .from("franchise_call_alert_settings")
    .select("event, recipient_ids, notify_sales, notify_cs");
  if (error) {
    if (isMissingTable(error)) return { settings, missingTable: true, error: null };
    return { settings, missingTable: false, error: error.message };
  }

  for (const row of (data ?? []) as {
    event: string;
    recipient_ids: string[] | null;
    notify_sales: boolean | null;
    notify_cs: boolean | null;
  }[]) {
    if (!FRANCHISE_CALL_ALERT_EVENTS.includes(row.event as FranchiseCallAlertEvent)) continue;
    const event = row.event as FranchiseCallAlertEvent;
    settings[event] = {
      event,
      recipient_ids: row.recipient_ids ?? [],
      notify_sales: !!row.notify_sales,
      notify_cs: !!row.notify_cs,
    };
  }
  return { settings, missingTable: false, error: null };
}

interface AlertApplication {
  id: string;
  business_name: string | null;
  owner_name: string | null;
  sales_id: string | null;
  cs_id: string | null;
  status: string | null;
}

async function sendCallAlert(
  admin: ReturnType<typeof createAdminClient>,
  event: FranchiseCallAlertEvent,
  application: AlertApplication,
  actor: { id: string; name: string },
  text: string,
): Promise<{ notifiedCount: number; error: string | null }> {
  const { settings, missingTable, error: settingsError } = await loadSettings(admin);
  // 마이그레이션 전에도 취소·재상담 흐름이 죽지 않게 알림만 건너뛴다.
  if (missingTable) return { notifiedCount: 0, error: null };
  if (settingsError) return { notifiedCount: 0, error: settingsError };

  const recipientIds = resolveFranchiseCallAlertRecipients(settings[event], application, actor.id);
  if (recipientIds.length === 0) return { notifiedCount: 0, error: null };

  // 삭제된 계정이 섞이면 notifications FK 위반으로 일괄 insert 전체가 실패하므로 존재하는 id만 남긴다.
  const { data: existing, error: existingError } = await admin
    .from("profiles")
    .select("id")
    .in("id", recipientIds);
  if (existingError) return { notifiedCount: 0, error: existingError.message };
  const targetIds = (existing ?? []).map((p) => p.id as string);
  if (targetIds.length === 0) return { notifiedCount: 0, error: null };

  const subject = application.business_name || application.owner_name || "미입력";
  const title = event === "reconsult" ? `재상담 요청: ${subject}` : `가맹접수 취소: ${subject}`;
  const body =
    event === "reconsult"
      ? `${actor.name}님이 재상담을 등록했습니다.\n비고: ${text}`
      : `${actor.name}님이 취소 처리했습니다.\n사유: ${text || "미입력"}`;

  const rows = targetIds.map((userId) => ({
    user_id: userId,
    type: FRANCHISE_CALL_ALERT_NOTIFICATION_TYPE[event],
    title,
    body,
    franchise_application_id: application.id,
  }));

  const { error } = await admin.from("notifications").insert(rows);
  if (error) return { notifiedCount: 0, error: error.message };
  return { notifiedCount: rows.length, error: null };
}

export async function getFranchiseCallAlertSettings(): Promise<FranchiseCallAlertConfig> {
  const defaults = {
    reconsult: emptyFranchiseCallAlertSetting("reconsult"),
    cancel: emptyFranchiseCallAlertSetting("cancel"),
  } satisfies Record<FranchiseCallAlertEvent, FranchiseCallAlertSetting>;

  const caller = await loadCaller();
  if (!caller) {
    return {
      settings: defaults,
      candidates: [],
      canEdit: false,
      missingTable: false,
      error: "로그인이 필요합니다.",
    };
  }

  const supabase = await createClient();
  const { settings, missingTable, error: settingsError } = await loadSettings(supabase);

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, name, team, position")
    .order("name");

  const candidates: FranchiseCallAlertCandidate[] = (
    (profiles ?? []) as {
      id: string;
      name: string | null;
      team: string | null;
      position: string | null;
    }[]
  ).map((p) => ({
    id: p.id,
    name: p.name ?? "",
    team: p.team ?? null,
    position: p.position ?? null,
  }));

  return {
    settings,
    candidates,
    canEdit: canEditFranchiseCallAlerts(caller.role, caller.approval_role),
    missingTable,
    error: settingsError ?? profilesError?.message ?? null,
  };
}

export async function saveFranchiseCallAlertSetting(
  setting: FranchiseCallAlertSetting,
): Promise<{ error: string | null }> {
  const caller = await loadCaller();
  if (!caller) return { error: "로그인이 필요합니다." };
  if (!canEditFranchiseCallAlerts(caller.role, caller.approval_role)) {
    return { error: "권한이 없습니다." };
  }
  if (!setting || !FRANCHISE_CALL_ALERT_EVENTS.includes(setting.event)) {
    return { error: "잘못된 알림 종류입니다." };
  }

  const recipientIds = [
    ...new Set(
      (Array.isArray(setting.recipient_ids) ? setting.recipient_ids : []).filter(
        (id): id is string => typeof id === "string" && UUID_PATTERN.test(id),
      ),
    ),
  ].slice(0, 200);

  const admin = createAdminClient();
  const { error } = await admin.from("franchise_call_alert_settings").upsert(
    {
      event: setting.event,
      recipient_ids: recipientIds,
      notify_sales: !!setting.notify_sales,
      notify_cs: !!setting.notify_cs,
      updated_by: caller.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event" },
  );
  if (error) {
    if (isMissingTable(error)) return { error: MISSING_TABLE_ERROR };
    return { error: error.message };
  }
  return { error: null };
}

export async function recordFranchiseReconsult(input: {
  applicationId: string;
  note: string;
}): Promise<{ error: string | null; notifiedCount: number; notificationError: string | null }> {
  const fail = (error: string) => ({ error, notifiedCount: 0, notificationError: null });

  const caller = await loadCaller();
  if (!caller) return fail("로그인이 필요합니다.");

  const note = (input.note ?? "").trim();
  if (!note) return fail("재상담 비고를 입력해주세요.");
  if (note.length > 1000) return fail("비고는 1000자까지 입력할 수 있습니다.");

  const admin = createAdminClient();
  const { data: application, error: applicationError } = await admin
    .from("franchise_applications")
    .select("id, business_name, owner_name, sales_id, cs_id, status")
    .eq("id", input.applicationId)
    .maybeSingle();
  if (applicationError) return fail(applicationError.message);
  if (!application) return fail("가맹접수를 찾을 수 없습니다.");
  if (application.status === "canceled") {
    return fail("취소된 접수에는 재상담을 등록할 수 없습니다.");
  }

  const { error: logError } = await admin.from("franchise_application_call_logs").insert({
    franchise_application_id: application.id,
    user_id: caller.id,
    call_type: "reconsult",
    note,
  });
  if (logError) {
    // 23514: CHECK 위반 = 157 미적용 (call_type에 reconsult가 아직 허용되지 않음)
    if (logError.code === "23514") {
      return fail(
        "재상담 기록을 저장할 수 없습니다. supabase/157 마이그레이션을 먼저 실행해주세요.",
      );
    }
    return fail(logError.message);
  }

  const alert = await sendCallAlert(
    admin,
    "reconsult",
    application as AlertApplication,
    { id: caller.id, name: caller.name },
    note,
  );
  return { error: null, notifiedCount: alert.notifiedCount, notificationError: alert.error };
}

export async function notifyFranchiseCanceled(input: {
  applicationId: string;
  reason: string | null;
}): Promise<{ notifiedCount: number; error: string | null }> {
  const caller = await loadCaller();
  if (!caller) return { notifiedCount: 0, error: "로그인이 필요합니다." };

  const admin = createAdminClient();
  const { data: application, error: applicationError } = await admin
    .from("franchise_applications")
    .select("id, business_name, owner_name, sales_id, cs_id, status")
    .eq("id", input.applicationId)
    .maybeSingle();
  if (applicationError) return { notifiedCount: 0, error: applicationError.message };
  if (!application) return { notifiedCount: 0, error: "가맹접수를 찾을 수 없습니다." };
  if (application.status !== "canceled") {
    return { notifiedCount: 0, error: "취소 상태가 아닌 접수라 알림을 보내지 않았습니다." };
  }

  const reason = (input.reason ?? "").trim().slice(0, 1000);
  return sendCallAlert(
    admin,
    "cancel",
    application as AlertApplication,
    { id: caller.id, name: caller.name },
    reason,
  );
}
