"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatPhone } from "@/lib/format";
import { revalidatePath } from "next/cache";
import {
  CONTACT_STATUSES,
  DOC_STATUSES,
  DECISIONS,
  isLeadClosed,
  type LeadEditableField,
  type OwnLead,
  type OwnLeadInput,
} from "./lead";

const NEXT_ACTION_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// 42P01: relation does not exist / PGRST205: PostgREST 스키마 캐시에 표가 없음.
// 149번 마이그레이션(own_leads)이 아직 적용되지 않은 환경에서 쓴다.
function isMissingLeadsTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /own_leads|schema cache|relation .* does not exist/i.test(error.message ?? "")
  );
}

const MISSING_TABLE_ERROR = "자체리드 마이그레이션(supabase/149)이 아직 적용되지 않았습니다.";

interface CallerProfile {
  id: string;
  name: string;
  role: string;
  position: string | null;
  team: string | null;
}

async function loadCaller(): Promise<{
  user: { id: string } | null;
  profile: CallerProfile | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null, error: "로그인이 필요합니다." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, role, position, team")
    .eq("id", user.id)
    .single();
  if (!profile) return { user: null, profile: null, error: "프로필을 찾을 수 없습니다." };

  return { user, profile: profile as CallerProfile, error: null };
}

async function requireCaller(): Promise<
  | { ok: true; user: { id: string }; profile: CallerProfile; error: null }
  | { ok: false; error: string }
> {
  const caller = await loadCaller();
  if (caller.error || !caller.user || !caller.profile) {
    return { ok: false, error: caller.error ?? "로그인이 필요합니다." };
  }
  return { ok: true, user: caller.user, profile: caller.profile, error: null };
}

async function lookupAssigneeName(
  admin: ReturnType<typeof createAdminClient>,
  assigneeId: string,
): Promise<string | null> {
  const { data } = await admin.from("profiles").select("name").eq("id", assigneeId).single();
  return (data?.name as string | undefined) ?? null;
}

async function notifyAssignee(
  admin: ReturnType<typeof createAdminClient>,
  assigneeId: string,
  callerId: string,
  callerName: string,
  businessName: string,
) {
  if (assigneeId === callerId) return;
  await admin.from("notifications").insert({
    user_id: assigneeId,
    type: "own_lead",
    title: `자체리드 담당 배정: ${businessName}`,
    body: `${callerName}님이 담당자로 지정했습니다.`,
  });
}

export async function createLead(
  input: OwnLeadInput,
): Promise<{ row: OwnLead | null; error: string | null }> {
  const caller = await requireCaller();
  if (!caller.ok) return { row: null, error: caller.error };
  const { user, profile } = caller;

  const businessName = input.business_name.trim();
  if (!businessName) return { row: null, error: "상호명을 입력하세요." };

  const admin = createAdminClient();

  let assigneeName: string | null = null;
  const assigneeId = input.assignee_id.trim();
  if (assigneeId) {
    assigneeName = await lookupAssigneeName(admin, assigneeId);
  }

  const ownerName = input.owner_name.trim();
  const phone = input.phone.trim() ? formatPhone(input.phone.trim()) : "";
  const region = input.region.trim();
  const source = input.source.trim() || "기타";
  const note = input.note.trim();

  const { data, error } = await admin
    .from("own_leads")
    .insert({
      business_name: businessName,
      owner_name: ownerName || null,
      phone: phone || null,
      region: region || null,
      source,
      assignee_id: assigneeId || null,
      assignee_name: assigneeId ? assigneeName : null,
      note: note || null,
      created_by: user.id,
      created_by_name: profile.name,
    })
    .select()
    .single();
  if (error) {
    if (isMissingLeadsTable(error)) return { row: null, error: MISSING_TABLE_ERROR };
    return { row: null, error: error.message };
  }

  const row = data as OwnLead;
  if (assigneeId) {
    await notifyAssignee(admin, assigneeId, user.id, profile.name, businessName);
  }

  revalidatePath("/leads");
  return { row, error: null };
}

export async function updateLeadField(
  id: string,
  field: LeadEditableField,
  value: string,
): Promise<{ row: OwnLead | null; error: string | null }> {
  const caller = await requireCaller();
  if (!caller.ok) return { row: null, error: caller.error };
  const { user, profile } = caller;

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("own_leads")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError) {
    if (isMissingLeadsTable(fetchError)) return { row: null, error: MISSING_TABLE_ERROR };
    return { row: null, error: "자체리드를 찾을 수 없습니다." };
  }
  if (!existing) return { row: null, error: "자체리드를 찾을 수 없습니다." };

  const lead = existing as OwnLead;
  // 화면은 종결 건의 모든 칸을 잠근다. 서버 액션은 공개 엔드포인트라 같은 기준으로 막는다.
  if (isLeadClosed(lead)) {
    return { row: null, error: "종결된 건은 다시 열어야 고칠 수 있습니다." };
  }

  const update: Record<string, unknown> = {};

  switch (field) {
    case "contact_status": {
      if (!CONTACT_STATUSES.includes(value as (typeof CONTACT_STATUSES)[number])) {
        return { row: null, error: "올바르지 않은 연락상태입니다." };
      }
      update.contact_status = value;
      break;
    }
    case "doc_status": {
      if (!DOC_STATUSES.includes(value as (typeof DOC_STATUSES)[number])) {
        return { row: null, error: "올바르지 않은 서류상태입니다." };
      }
      update.doc_status = value;
      break;
    }
    case "decision": {
      if (!DECISIONS.includes(value as (typeof DECISIONS)[number])) {
        return { row: null, error: "올바르지 않은 접수판단입니다." };
      }
      update.decision = value;
      if (value === "접수아님") {
        update.closed_at = new Date().toISOString();
      } else if (lead.decision === "접수아님") {
        update.closed_at = null;
        update.close_reason = null;
      }
      break;
    }
    case "next_action_date": {
      const trimmed = value.trim();
      if (trimmed && !NEXT_ACTION_DATE_PATTERN.test(trimmed)) {
        return { row: null, error: "날짜 형식이 올바르지 않습니다." };
      }
      update.next_action_date = trimmed || null;
      break;
    }
    case "assignee_id": {
      const trimmed = value.trim();
      if (!trimmed) {
        update.assignee_id = null;
        update.assignee_name = null;
      } else {
        const assigneeName = await lookupAssigneeName(admin, trimmed);
        update.assignee_id = trimmed;
        update.assignee_name = assigneeName;
        await notifyAssignee(admin, trimmed, user.id, profile.name, lead.business_name);
      }
      break;
    }
    case "phone": {
      const trimmed = value.trim();
      update.phone = trimmed ? formatPhone(trimmed) : null;
      break;
    }
    case "note": {
      const trimmed = value.trim();
      update.note = trimmed || null;
      break;
    }
    case "owner_name": {
      const trimmed = value.trim();
      update.owner_name = trimmed || null;
      break;
    }
    case "region": {
      const trimmed = value.trim();
      update.region = trimmed || null;
      break;
    }
    case "source": {
      const trimmed = value.trim();
      update.source = trimmed || "기타";
      break;
    }
    default:
      return { row: null, error: "올바르지 않은 항목입니다." };
  }

  const { data, error } = await admin
    .from("own_leads")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    if (isMissingLeadsTable(error)) return { row: null, error: MISSING_TABLE_ERROR };
    return { row: null, error: error.message };
  }

  revalidatePath("/leads");
  return { row: data as OwnLead, error: null };
}

export async function closeLead(
  id: string,
  reason: string,
): Promise<{ row: OwnLead | null; error: string | null }> {
  const caller = await requireCaller();
  if (!caller.ok) return { row: null, error: caller.error };

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("own_leads")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError) {
    if (isMissingLeadsTable(fetchError)) return { row: null, error: MISSING_TABLE_ERROR };
    return { row: null, error: "자체리드를 찾을 수 없습니다." };
  }
  if (!existing) return { row: null, error: "자체리드를 찾을 수 없습니다." };
  if (isLeadClosed(existing as OwnLead)) {
    return { row: null, error: "이미 종결된 건입니다." };
  }

  const { data, error } = await admin
    .from("own_leads")
    .update({ closed_at: new Date().toISOString(), close_reason: reason.trim() || null })
    .eq("id", id)
    .select()
    .single();
  if (error) {
    if (isMissingLeadsTable(error)) return { row: null, error: MISSING_TABLE_ERROR };
    return { row: null, error: error.message };
  }

  revalidatePath("/leads");
  return { row: data as OwnLead, error: null };
}

export async function reopenLead(
  id: string,
): Promise<{ row: OwnLead | null; error: string | null }> {
  const caller = await requireCaller();
  if (!caller.ok) return { row: null, error: caller.error };

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("own_leads")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError) {
    if (isMissingLeadsTable(fetchError)) return { row: null, error: MISSING_TABLE_ERROR };
    return { row: null, error: "자체리드를 찾을 수 없습니다." };
  }
  if (!existing) return { row: null, error: "자체리드를 찾을 수 없습니다." };
  const lead = existing as OwnLead;
  if (lead.converted_franchise_id) {
    return { row: null, error: "가맹접수로 전환된 건은 다시 열 수 없습니다." };
  }

  const { data, error } = await admin
    .from("own_leads")
    .update({
      closed_at: null,
      close_reason: null,
      // 접수아님으로 자동 종결된 건을 다시 열면 판단도 처음으로 돌린다. 그대로 두면 "진행 중인데 접수아님"이 된다.
      ...(lead.decision === "접수아님" ? { decision: "미정" } : {}),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) {
    if (isMissingLeadsTable(error)) return { row: null, error: MISSING_TABLE_ERROR };
    return { row: null, error: error.message };
  }

  revalidatePath("/leads");
  return { row: data as OwnLead, error: null };
}

export async function markLeadConverted(
  id: string,
  franchiseId: string,
): Promise<{ error: string | null }> {
  const caller = await requireCaller();
  if (!caller.ok) return { error: caller.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("own_leads")
    .update({
      converted_franchise_id: franchiseId,
      decision: "접수대상",
      closed_at: new Date().toISOString(),
      close_reason: "가맹접수 전환",
    })
    .eq("id", id);
  if (error) {
    if (isMissingLeadsTable(error)) return { error: MISSING_TABLE_ERROR };
    return { error: error.message };
  }

  revalidatePath("/leads");
  revalidatePath("/franchise");
  return { error: null };
}

export async function deleteLeads(
  ids: string[],
): Promise<{ deleted: number; error: string | null }> {
  const caller = await requireCaller();
  if (!caller.ok) return { deleted: 0, error: caller.error };
  const { user, profile } = caller;

  if (!ids.length) return { deleted: 0, error: null };

  const admin = createAdminClient();
  const isPrivileged = profile.role === "admin" || profile.role === "master";

  let deletedTotal = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);

    let deletableIds = chunk;
    if (!isPrivileged) {
      const { data: rows, error: fetchError } = await admin
        .from("own_leads")
        .select("id, created_by")
        .in("id", chunk);
      if (fetchError) {
        if (isMissingLeadsTable(fetchError))
          return { deleted: deletedTotal, error: MISSING_TABLE_ERROR };
        return { deleted: deletedTotal, error: fetchError.message };
      }
      deletableIds = (rows ?? [])
        .filter((row) => row.created_by === user.id)
        .map((row) => row.id as string);
    }
    if (deletableIds.length === 0) continue;

    const { error } = await admin.from("own_leads").delete().in("id", deletableIds);
    if (error) {
      if (isMissingLeadsTable(error)) return { deleted: deletedTotal, error: MISSING_TABLE_ERROR };
      return { deleted: deletedTotal, error: error.message };
    }
    deletedTotal += deletableIds.length;
  }

  revalidatePath("/leads");
  return { deleted: deletedTotal, error: null };
}

export async function fetchLeadForConversion(id: string): Promise<{
  lead: Pick<
    OwnLead,
    | "id"
    | "business_name"
    | "owner_name"
    | "phone"
    | "assignee_id"
    | "note"
    | "converted_franchise_id"
  > | null;
  error: string | null;
}> {
  const caller = await requireCaller();
  if (!caller.ok) return { lead: null, error: caller.error };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("own_leads")
    .select("id, business_name, owner_name, phone, assignee_id, note, converted_franchise_id")
    .eq("id", id)
    .single();
  if (error) {
    if (isMissingLeadsTable(error)) return { lead: null, error: MISSING_TABLE_ERROR };
    return { lead: null, error: error.message };
  }

  return { lead: data, error: null };
}
