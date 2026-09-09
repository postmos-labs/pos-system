"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  canDecideSupplyRequest,
  isEditableByRequester,
  SUPPLY_REQUEST_STATUSES,
  type SupplyRequest,
  type SupplyRequestInput,
  type SupplyRequestStatus,
} from "./supplyRequest";

const NEEDED_BY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// 42P01: relation does not exist / PGRST205: PostgREST 스키마 캐시에 표가 없음.
// 145번 마이그레이션(supply_requests)이 아직 적용되지 않은 환경에서 쓴다.
function isMissingSupplyTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /supply_requests|schema cache|relation .* does not exist/i.test(error.message ?? "")
  );
}

const MISSING_TABLE_ERROR = "물품요청 마이그레이션(supabase/145)이 아직 적용되지 않았습니다.";

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

function validateInput(input: SupplyRequestInput): { error: string | null } {
  const itemName = input.item_name.trim();
  if (!itemName || itemName.length > 100) {
    return { error: "물품명은 1~100자로 입력해주세요." };
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 9999) {
    return { error: "수량은 1~9999 사이의 정수로 입력해주세요." };
  }
  if (input.unit && input.unit.trim().length > 20) {
    return { error: "단위는 20자 이내로 입력해주세요." };
  }
  if (input.description && input.description.trim().length > 1000) {
    return { error: "설명은 1,000자 이내로 입력해주세요." };
  }
  if (input.needed_by && !NEEDED_BY_PATTERN.test(input.needed_by.trim())) {
    return { error: "필요 시기 형식이 올바르지 않습니다." };
  }
  return { error: null };
}

function toRow(input: SupplyRequestInput) {
  const itemName = input.item_name.trim();
  const unit = input.unit.trim();
  const description = input.description.trim();
  const neededBy = input.needed_by.trim();
  return {
    item_name: itemName,
    quantity: input.quantity,
    unit: unit || null,
    description: description || null,
    needed_by: neededBy || null,
    is_urgent: input.is_urgent,
  };
}

export async function createSupplyRequest(
  input: SupplyRequestInput,
): Promise<{ row: SupplyRequest | null; error: string | null }> {
  const caller = await requireCaller();
  if (!caller.ok) return { row: null, error: caller.error };
  const { user, profile } = caller;

  const validation = validateInput(input);
  if (validation.error) return { row: null, error: validation.error };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("supply_requests")
    .insert({
      ...toRow(input),
      requester_id: user.id,
      requester_name: profile.name,
      requester_team: profile.team ?? null,
      status: "요청",
    })
    .select()
    .single();
  if (error) {
    if (isMissingSupplyTable(error)) return { row: null, error: MISSING_TABLE_ERROR };
    return { row: null, error: error.message };
  }

  revalidatePath("/supply-requests");
  return { row: data as SupplyRequest, error: null };
}

export async function updateSupplyRequest(
  id: string,
  input: SupplyRequestInput,
): Promise<{ row: SupplyRequest | null; error: string | null }> {
  const caller = await requireCaller();
  if (!caller.ok) return { row: null, error: caller.error };
  const { user, profile } = caller;

  const validation = validateInput(input);
  if (validation.error) return { row: null, error: validation.error };

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("supply_requests")
    .select("id, status, requester_id")
    .eq("id", id)
    .single();
  if (fetchError) {
    if (isMissingSupplyTable(fetchError)) return { row: null, error: MISSING_TABLE_ERROR };
    return { row: null, error: "물품요청을 찾을 수 없습니다." };
  }
  if (!existing) return { row: null, error: "물품요청을 찾을 수 없습니다." };

  const status = existing.status as SupplyRequestStatus;
  const isOwnerEditable = existing.requester_id === user.id && isEditableByRequester(status);
  const isDecider = canDecideSupplyRequest(profile);
  if (!isOwnerEditable && !isDecider) {
    return { row: null, error: "본인 요청은 승인 전까지만 고칠 수 있습니다." };
  }

  const update: Record<string, unknown> = { ...toRow(input) };
  if (status === "반려") {
    update.status = "요청";
    update.approver_id = null;
    update.approver_name = null;
    update.approved_at = null;
    update.approver_note = null;
  }

  const { data, error } = await admin
    .from("supply_requests")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    if (isMissingSupplyTable(error)) return { row: null, error: MISSING_TABLE_ERROR };
    return { row: null, error: error.message };
  }

  revalidatePath("/supply-requests");
  return { row: data as SupplyRequest, error: null };
}

export async function decideSupplyRequest(
  id: string,
  status: SupplyRequestStatus,
  note: string,
): Promise<{ row: SupplyRequest | null; error: string | null }> {
  const caller = await requireCaller();
  if (!caller.ok) return { row: null, error: caller.error };
  const { user, profile } = caller;

  if (!SUPPLY_REQUEST_STATUSES.includes(status)) {
    return { row: null, error: "올바르지 않은 상태입니다." };
  }
  if (!canDecideSupplyRequest(profile)) {
    return { row: null, error: "실장급 이상만 처리할 수 있습니다." };
  }

  const trimmedNote = note.trim();
  if (status === "반려" && !trimmedNote) {
    return { row: null, error: "반려 사유를 입력해주세요." };
  }
  if (trimmedNote.length > 500) {
    return { row: null, error: "메모는 500자 이내로 입력해주세요." };
  }

  const admin = createAdminClient();

  const update =
    status === "요청"
      ? {
          status,
          approver_id: null,
          approver_name: null,
          approved_at: null,
          approver_note: null,
        }
      : {
          status,
          approver_id: user.id,
          approver_name: profile.name,
          approved_at: new Date().toISOString(),
          approver_note: trimmedNote || null,
        };

  const { data, error } = await admin
    .from("supply_requests")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    if (isMissingSupplyTable(error)) return { row: null, error: MISSING_TABLE_ERROR };
    return { row: null, error: error.message };
  }

  const row = data as SupplyRequest;
  if (row.requester_id && row.requester_id !== user.id) {
    await admin.from("notifications").insert({
      user_id: row.requester_id,
      type: "supply_request",
      title: `물품요청 ${status}: ${row.item_name}`,
      body: trimmedNote || `${profile.name}님이 ${status} 처리했습니다.`,
    });
  }

  revalidatePath("/supply-requests");
  return { row, error: null };
}

export async function deleteSupplyRequests(
  ids: string[],
): Promise<{ deleted: number; error: string | null }> {
  const caller = await requireCaller();
  if (!caller.ok) return { deleted: 0, error: caller.error };
  const { user, profile } = caller;

  if (!ids.length) return { deleted: 0, error: null };
  if (ids.length > 200) return { deleted: 0, error: "한 번에 200건까지만 지울 수 있습니다." };

  const admin = createAdminClient();
  const { data: rows, error: fetchError } = await admin
    .from("supply_requests")
    .select("id, status, requester_id")
    .in("id", ids);
  if (fetchError) {
    if (isMissingSupplyTable(fetchError)) return { deleted: 0, error: MISSING_TABLE_ERROR };
    return { deleted: 0, error: fetchError.message };
  }

  const isPrivileged = profile.role === "admin" || profile.role === "master";
  const deletableIds = (rows ?? [])
    .filter(
      (row) =>
        isPrivileged ||
        (row.requester_id === user.id && isEditableByRequester(row.status as SupplyRequestStatus)),
    )
    .map((row) => row.id as string);
  if (deletableIds.length === 0) return { deleted: 0, error: null };

  const { error } = await admin.from("supply_requests").delete().in("id", deletableIds);
  if (error) {
    if (isMissingSupplyTable(error)) return { deleted: 0, error: MISSING_TABLE_ERROR };
    return { deleted: 0, error: error.message };
  }

  revalidatePath("/supply-requests");
  return { deleted: deletableIds.length, error: null };
}
