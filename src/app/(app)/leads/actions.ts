"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatPhone, formatBusinessNumber } from "@/lib/format";
import { kstDate } from "@/lib/date";
import {
  APPLICANT_TYPE_LABEL,
  FRANCHISE_CHANNEL_LABEL,
  type ApplicantType,
  type EquipmentItem,
  type FranchiseChannel,
} from "@/types";
import { revalidatePath } from "next/cache";
import {
  CONTACT_STATUSES,
  DOC_STATUSES,
  DECISIONS,
  LEAD_TYPES,
  VAN_STATUSES,
  INTERNET_STATUSES,
  isLeadClosed,
  type LeadEditableField,
  type LeadLogAction,
  type OwnLead,
  type OwnLeadInput,
  type OwnLeadLog,
} from "./lead";

const NEXT_ACTION_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** equipment_items 정리 — 이름 없는 항목·수량 범위 밖(1~99 정수 아님) 항목은 버린다 */
function sanitizeEquipment(items: unknown): EquipmentItem[] {
  if (!Array.isArray(items)) return [];
  const result: EquipmentItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const name =
      typeof (item as { name?: unknown }).name === "string"
        ? (item as { name: string }).name.trim()
        : "";
    const quantity = (item as { quantity?: unknown }).quantity;
    if (!name) continue;
    if (typeof quantity !== "number" || !Number.isInteger(quantity)) continue;
    if (quantity < 1 || quantity > 99) continue;
    result.push({ name, quantity });
  }
  return result;
}

/** equipment_items 목록을 로그용 문자열로 — "이름 x수량, ..." */
function formatEquipmentLog(items: EquipmentItem[]): string {
  return items.map((item) => `${item.name} x${item.quantity}`).join(", ");
}

// 42P01: relation does not exist / PGRST205: PostgREST 스키마 캐시에 표가 없음.
// 149번 마이그레이션(own_leads)·152번 마이그레이션(own_lead_logs)이 아직 적용되지 않은 환경에서 쓴다.
function isMissingLeadsTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "PGRST204" ||
    /schema cache|relation .* does not exist|column .* does not exist/i.test(error.message ?? "")
  );
}

const MISSING_TABLE_ERROR =
  "자체리드 마이그레이션(supabase/149 · 152 · 153)이 아직 적용되지 않았습니다.";

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

async function writeLeadLog(
  admin: ReturnType<typeof createAdminClient>,
  entry: {
    lead_id: string;
    user_id: string | null;
    user_name: string | null;
    action: LeadLogAction;
    field?: string | null;
    from_value?: string | null;
    to_value?: string | null;
  },
): Promise<void> {
  try {
    await admin.from("own_lead_logs").insert({
      lead_id: entry.lead_id,
      user_id: entry.user_id,
      user_name: entry.user_name,
      action: entry.action,
      field: entry.field ?? null,
      from_value: entry.from_value ?? null,
      to_value: entry.to_value ?? null,
    });
  } catch {
    // own_lead_logs 표가 아직 없는 환경 등 — 로그 실패로 본 작업(리드 저장)을 막지 않는다.
  }
}

export async function createLead(
  input: OwnLeadInput,
): Promise<{ row: OwnLead | null; error: string | null }> {
  const caller = await requireCaller();
  if (!caller.ok) return { row: null, error: caller.error };
  const { user, profile } = caller;

  const businessName = input.business_name.trim();
  if (!businessName) return { row: null, error: "상호명을 입력하세요." };

  if (!LEAD_TYPES.includes(input.lead_type as (typeof LEAD_TYPES)[number])) {
    return { row: null, error: "리드 구분을 선택하세요." };
  }

  const openDate = input.open_date.trim();
  if (openDate && !NEXT_ACTION_DATE_PATTERN.test(openDate)) {
    return { row: null, error: "날짜 형식이 올바르지 않습니다." };
  }

  if (!(input.applicant_type in APPLICANT_TYPE_LABEL)) {
    return { row: null, error: "올바르지 않은 사업자 유형입니다." };
  }

  const channel = input.channel.trim();
  if (channel && !(channel in FRANCHISE_CHANNEL_LABEL)) {
    return { row: null, error: "올바르지 않은 채널입니다." };
  }

  const receptionDate = input.reception_date.trim();
  if (receptionDate && !NEXT_ACTION_DATE_PATTERN.test(receptionDate)) {
    return { row: null, error: "날짜 형식이 올바르지 않습니다." };
  }
  const cardApplyDate = input.card_apply_date.trim();
  if (cardApplyDate && !NEXT_ACTION_DATE_PATTERN.test(cardApplyDate)) {
    return { row: null, error: "날짜 형식이 올바르지 않습니다." };
  }
  const installDate = input.install_date.trim();
  if (installDate && !NEXT_ACTION_DATE_PATTERN.test(installDate)) {
    return { row: null, error: "날짜 형식이 올바르지 않습니다." };
  }

  const businessNumber = input.business_number.trim();
  const equipmentItems = sanitizeEquipment(input.equipment_items);
  const internet = input.internet.trim();
  const program = input.program.trim();
  const vanCompany = input.van_company.trim();
  const address = input.address.trim();
  const addressDetail = input.address_detail.trim();

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
      lead_type: input.lead_type,
      assignee_id: assigneeId || null,
      assignee_name: assigneeId ? assigneeName : null,
      open_date: openDate || null,
      note: note || null,
      applicant_type: input.applicant_type,
      business_number: businessNumber ? formatBusinessNumber(businessNumber) : null,
      channel: channel || null,
      is_rental: !!input.is_rental,
      is_installment: !!input.is_installment,
      reception_date: receptionDate || kstDate(),
      card_apply_date: cardApplyDate || null,
      internet: internet || null,
      program: program || null,
      equipment_items: equipmentItems,
      address: address || null,
      address_detail: addressDetail || null,
      install_date: installDate || null,
      van_company: vanCompany || null,
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

  await writeLeadLog(admin, {
    lead_id: row.id,
    user_id: user.id,
    user_name: profile.name,
    action: "create",
  });

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

  const update: Record<string, unknown> = {};

  switch (field) {
    case "business_name": {
      const trimmed = value.trim();
      if (!trimmed) return { row: null, error: "상호명을 입력하세요." };
      update.business_name = trimmed;
      break;
    }
    case "lead_type": {
      if (!LEAD_TYPES.includes(value as (typeof LEAD_TYPES)[number])) {
        return { row: null, error: "올바르지 않은 리드 구분입니다." };
      }
      update.lead_type = value;
      break;
    }
    case "van_status": {
      if (!VAN_STATUSES.includes(value as (typeof VAN_STATUSES)[number])) {
        return { row: null, error: "올바르지 않은 VAN 접수 상태입니다." };
      }
      update.van_status = value;
      break;
    }
    case "internet_status": {
      if (!INTERNET_STATUSES.includes(value as (typeof INTERNET_STATUSES)[number])) {
        return { row: null, error: "올바르지 않은 인터넷 진행 상태입니다." };
      }
      update.internet_status = value;
      break;
    }
    case "open_date": {
      const trimmed = value.trim();
      if (trimmed && !NEXT_ACTION_DATE_PATTERN.test(trimmed)) {
        return { row: null, error: "날짜 형식이 올바르지 않습니다." };
      }
      update.open_date = trimmed || null;
      break;
    }
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
        update.close_reason = "접수아님";
        update.completed_by = user.id;
        update.completed_by_name = profile.name;
      } else if (lead.decision === "접수아님") {
        update.closed_at = null;
        update.close_reason = null;
        update.completed_by = null;
        update.completed_by_name = null;
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
    case "applicant_type": {
      if (!(value in APPLICANT_TYPE_LABEL)) {
        return { row: null, error: "올바르지 않은 사업자 유형입니다." };
      }
      update.applicant_type = value;
      break;
    }
    case "channel": {
      const trimmed = value.trim();
      if (trimmed && !(trimmed in FRANCHISE_CHANNEL_LABEL)) {
        return { row: null, error: "올바르지 않은 채널입니다." };
      }
      update.channel = trimmed || null;
      break;
    }
    case "internet": {
      const trimmed = value.trim();
      update.internet = trimmed || null;
      break;
    }
    case "program": {
      const trimmed = value.trim();
      update.program = trimmed || null;
      break;
    }
    case "address": {
      const trimmed = value.trim();
      update.address = trimmed || null;
      break;
    }
    case "address_detail": {
      const trimmed = value.trim();
      update.address_detail = trimmed || null;
      break;
    }
    case "van_company": {
      const trimmed = value.trim();
      update.van_company = trimmed || null;
      break;
    }
    case "business_number": {
      const trimmed = value.trim();
      update.business_number = trimmed ? formatBusinessNumber(trimmed) : null;
      break;
    }
    case "reception_date": {
      const trimmed = value.trim();
      if (trimmed && !NEXT_ACTION_DATE_PATTERN.test(trimmed)) {
        return { row: null, error: "날짜 형식이 올바르지 않습니다." };
      }
      update.reception_date = trimmed || null;
      break;
    }
    case "card_apply_date": {
      const trimmed = value.trim();
      if (trimmed && !NEXT_ACTION_DATE_PATTERN.test(trimmed)) {
        return { row: null, error: "날짜 형식이 올바르지 않습니다." };
      }
      update.card_apply_date = trimmed || null;
      break;
    }
    case "install_date": {
      const trimmed = value.trim();
      if (trimmed && !NEXT_ACTION_DATE_PATTERN.test(trimmed)) {
        return { row: null, error: "날짜 형식이 올바르지 않습니다." };
      }
      update.install_date = trimmed || null;
      break;
    }
    case "is_rental": {
      if (value !== "true" && value !== "false") {
        return { row: null, error: "올바르지 않은 값입니다." };
      }
      update.is_rental = value === "true";
      break;
    }
    case "is_installment": {
      if (value !== "true" && value !== "false") {
        return { row: null, error: "올바르지 않은 값입니다." };
      }
      update.is_installment = value === "true";
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

  let fromValue = field === "assignee_id" ? (lead.assignee_name ?? "") : String(lead[field] ?? "");
  let toValue =
    field === "assignee_id"
      ? ((update.assignee_name as string | null) ?? "")
      : String(update[field] ?? "");
  if (field === "applicant_type") {
    fromValue = APPLICANT_TYPE_LABEL[fromValue as ApplicantType] ?? fromValue;
    toValue = APPLICANT_TYPE_LABEL[toValue as ApplicantType] ?? toValue;
  } else if (field === "channel") {
    fromValue = fromValue
      ? (FRANCHISE_CHANNEL_LABEL[fromValue as FranchiseChannel] ?? fromValue)
      : "";
    toValue = toValue ? (FRANCHISE_CHANNEL_LABEL[toValue as FranchiseChannel] ?? toValue) : "";
  }
  if (fromValue !== toValue) {
    await writeLeadLog(admin, {
      lead_id: id,
      user_id: user.id,
      user_name: profile.name,
      action: "update",
      field,
      from_value: fromValue,
      to_value: toValue,
    });
  }

  if (field === "decision" && value === "접수아님" && !lead.closed_at) {
    await writeLeadLog(admin, {
      lead_id: id,
      user_id: user.id,
      user_name: profile.name,
      action: "close",
      to_value: "접수아님",
    });
  } else if (field === "decision" && lead.decision === "접수아님" && value !== "접수아님") {
    await writeLeadLog(admin, {
      lead_id: id,
      user_id: user.id,
      user_name: profile.name,
      action: "reopen",
    });
  }

  revalidatePath("/leads");
  return { row: data as OwnLead, error: null };
}

export async function updateLeadEquipment(
  id: string,
  items: EquipmentItem[],
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
  const equipmentItems = sanitizeEquipment(items);

  const { data, error } = await admin
    .from("own_leads")
    .update({ equipment_items: equipmentItems })
    .eq("id", id)
    .select()
    .single();
  if (error) {
    if (isMissingLeadsTable(error)) return { row: null, error: MISSING_TABLE_ERROR };
    return { row: null, error: error.message };
  }

  const fromValue = formatEquipmentLog(lead.equipment_items ?? []);
  const toValue = formatEquipmentLog(equipmentItems);
  if (fromValue !== toValue) {
    await writeLeadLog(admin, {
      lead_id: id,
      user_id: user.id,
      user_name: profile.name,
      action: "update",
      field: "equipment_items",
      from_value: fromValue,
      to_value: toValue,
    });
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
  if (isLeadClosed(existing as OwnLead)) {
    return { row: null, error: "이미 완료된 건입니다." };
  }

  const closeReason = reason.trim() || "완료";
  const { data, error } = await admin
    .from("own_leads")
    .update({
      closed_at: new Date().toISOString(),
      close_reason: closeReason,
      completed_by: user.id,
      completed_by_name: profile.name,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) {
    if (isMissingLeadsTable(error)) return { row: null, error: MISSING_TABLE_ERROR };
    return { row: null, error: error.message };
  }

  await writeLeadLog(admin, {
    lead_id: id,
    user_id: user.id,
    user_name: profile.name,
    action: "close",
    to_value: closeReason,
  });

  revalidatePath("/leads");
  return { row: data as OwnLead, error: null };
}

export async function reopenLead(
  id: string,
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
  if (!isLeadClosed(lead)) {
    return { row: null, error: "완료되지 않은 건입니다." };
  }

  const { data, error } = await admin
    .from("own_leads")
    .update({
      closed_at: null,
      close_reason: null,
      completed_by: null,
      completed_by_name: null,
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

  await writeLeadLog(admin, {
    lead_id: id,
    user_id: user.id,
    user_name: profile.name,
    action: "reopen",
  });

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
      converted_at: new Date().toISOString(),
      decision: "접수대상",
    })
    .eq("id", id);
  if (error) {
    if (isMissingLeadsTable(error)) return { error: MISSING_TABLE_ERROR };
    return { error: error.message };
  }

  await writeLeadLog(admin, {
    lead_id: id,
    user_id: caller.user.id,
    user_name: caller.profile.name,
    action: "convert",
    to_value: franchiseId,
  });

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

export async function fetchLeadForConversion(
  id: string,
): Promise<{ lead: OwnLead | null; error: string | null }> {
  const caller = await requireCaller();
  if (!caller.ok) return { lead: null, error: caller.error };

  const admin = createAdminClient();
  const { data, error } = await admin.from("own_leads").select("*").eq("id", id).single();
  if (error) {
    if (isMissingLeadsTable(error)) return { lead: null, error: MISSING_TABLE_ERROR };
    return { lead: null, error: error.message };
  }

  return { lead: data as OwnLead, error: null };
}

export async function fetchLeadLogs(
  id: string,
): Promise<{ logs: OwnLeadLog[]; error: string | null }> {
  const caller = await requireCaller();
  if (!caller.ok) return { logs: [], error: caller.error };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("own_lead_logs")
    .select("*")
    .eq("lead_id", id)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingLeadsTable(error)) return { logs: [], error: null };
    return { logs: [], error: error.message };
  }

  return { logs: (data ?? []) as OwnLeadLog[], error: null };
}
