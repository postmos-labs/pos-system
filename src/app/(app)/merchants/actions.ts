"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDeletePermission } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import { isAsChecklistComplete, type MerchantMemoEntryType } from "@/lib/asChecklist";
import { fetchRowsForDeletion, recordDeletions } from "@/lib/deletionLog";
import type { MerchantEquipmentCategory, MerchantOperationStatus } from "./merchant360";

const CHUNK_SIZE = 100;

function isMissingMerchantMemoEntriesTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /merchant_memo_entries|schema cache|relation .* does not exist/i.test(error.message ?? "")
  );
}

export async function addMerchantMemo(
  merchantId: string,
  content: string,
  entryType: MerchantMemoEntryType = "general",
  checklist: Record<string, boolean> | null = null,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다.", skipped: false };

  const trimmedContent = content.trim();
  if (!merchantId || !trimmedContent) {
    return { error: "메모 내용을 입력해주세요.", skipped: false };
  }
  if (trimmedContent.length > 2000) {
    return { error: "메모는 2,000자 이하로 입력해주세요.", skipped: false };
  }
  if (!["as", "claim", "general", "etc"].includes(entryType)) {
    return { error: "잘못된 메모 유형입니다.", skipped: false };
  }
  if (entryType === "as" && !isAsChecklistComplete(checklist)) {
    return { error: "AS 체크리스트를 모두 확인해야 저장할 수 있습니다.", skipped: false };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("merchant_memo_entries").insert({
    merchant_id: merchantId,
    content: trimmedContent,
    entry_type: entryType,
    checklist: entryType === "as" ? checklist : null,
    created_by: user.id,
  });
  if (error) {
    if (isMissingMerchantMemoEntriesTable(error)) {
      return { error: null, skipped: true };
    }
    return { error: error.message, skipped: false };
  }

  revalidatePath("/merchants");
  revalidatePath(`/merchants/${merchantId}`);
  return { error: null, skipped: false };
}

// 113/114번 마이그레이션이 아직 적용되지 않은 환경에서 신규 컬럼을 update하면
// "column does not exist"(42703) 에러가 난다. 저장 자체를 막지 않고 신규 필드만
// 제외한 채 재시도한다.
function isMissingColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist/i.test(error.message ?? "")
  );
}

const MERCHANT_OPERATION_STATUSES: MerchantOperationStatus[] = ["active", "paused", "terminated"];

export async function updateMerchantInfo(
  merchantId: string,
  input: {
    businessName: string;
    ownerName: string;
    phone: string;
    address: string;
    addressDetail: string;
    businessNumber?: string;
    tossMerchantNo?: string;
    contractExpiresAt?: string;
    contractStartedAt?: string;
    brand?: string;
    contactName?: string;
    contactPhone?: string;
    operationStatus?: MerchantOperationStatus;
  },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };
  if (!merchantId) return { error: "가맹점을 찾을 수 없습니다." };
  if (!input.businessName.trim()) return { error: "상호명을 입력해주세요." };
  if (input.operationStatus && !MERCHANT_OPERATION_STATUSES.includes(input.operationStatus)) {
    return { error: "잘못된 운영 상태입니다." };
  }

  const admin = createAdminClient();
  const baseValues = {
    business_name: input.businessName.trim(),
    owner_name: input.ownerName.trim(),
    phone: input.phone.trim(),
    address: input.address.trim() || null,
    address_detail: input.addressDetail.trim() || null,
    business_number: input.businessNumber?.trim() || null,
    toss_merchant_no: input.tossMerchantNo?.trim() || null,
    contract_expires_at: input.contractExpiresAt?.trim() || null,
    brand: input.brand?.trim() || null,
  };
  const extendedValues = {
    ...baseValues,
    contact_name: input.contactName?.trim() || null,
    contact_phone: input.contactPhone?.trim() || null,
    operation_status: input.operationStatus ?? "active",
    contract_started_at: input.contractStartedAt?.trim() || null,
  };

  let { error } = await admin.from("merchants").update(extendedValues).eq("id", merchantId);
  if (error && isMissingColumnError(error)) {
    ({ error } = await admin.from("merchants").update(baseValues).eq("id", merchantId));
  }
  if (error) return { error: error.message };

  revalidatePath("/merchants");
  revalidatePath(`/merchants/${merchantId}`);
  return { error: null };
}

export async function updateMerchantInstallNote(merchantId: string, note: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };
  if (!merchantId) return { error: "가맹점을 찾을 수 없습니다." };
  const trimmed = note.trim();
  if (trimmed.length > 2000) return { error: "특이사항은 2,000자 이하로 입력해주세요." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("merchants")
    .update({ install_note: trimmed || null })
    .eq("id", merchantId);
  if (error) {
    if (isMissingColumnError(error)) {
      return { error: null, skipped: true };
    }
    return { error: error.message, skipped: false };
  }

  revalidatePath("/merchants");
  revalidatePath(`/merchants/${merchantId}`);
  return { error: null, skipped: false };
}

export type MerchantEquipmentStatus = "installed" | "as" | "removed";

function isMissingMerchantEquipmentTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /merchant_equipment|schema cache|relation .* does not exist/i.test(error.message ?? "")
  );
}

const EQUIPMENT_SELECT_COLUMNS =
  "id,name,serial_number,status,installed_date,notes,created_at,category,quantity,components,manufacturer,supplier,location,source";
const EQUIPMENT_SELECT_COLUMNS_BASE =
  "id,name,serial_number,status,installed_date,notes,created_at";

export interface MerchantEquipmentInput {
  name: string;
  serialNumber: string;
  installedDate: string;
  notes: string;
  category?: MerchantEquipmentCategory;
  quantity?: number;
  components?: string;
  manufacturer?: string;
  supplier?: string;
  location?: string;
}

function validateEquipmentInput(input: MerchantEquipmentInput) {
  if (!input.name.trim()) return "장비명을 입력해주세요.";
  if (input.quantity !== undefined && (!Number.isInteger(input.quantity) || input.quantity < 1)) {
    return "수량은 1 이상의 정수로 입력해주세요.";
  }
  return null;
}

export async function addMerchantEquipment(merchantId: string, input: MerchantEquipmentInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다.", skipped: false, data: null };
  if (!merchantId) return { error: "가맹점을 찾을 수 없습니다.", skipped: false, data: null };
  const validationError = validateEquipmentInput(input);
  if (validationError) return { error: validationError, skipped: false, data: null };

  const admin = createAdminClient();
  const baseValues = {
    merchant_id: merchantId,
    name: input.name.trim(),
    serial_number: input.serialNumber.trim() || null,
    installed_date: input.installedDate || null,
    notes: input.notes.trim() || null,
    created_by: user.id,
  };
  const extendedValues = {
    ...baseValues,
    category: input.category ?? "etc",
    quantity: input.quantity ?? 1,
    components: input.components?.trim() || null,
    manufacturer: input.manufacturer?.trim() || null,
    supplier: input.supplier?.trim() || null,
    location: input.location?.trim() || null,
    source: "manual",
  };

  let { data, error } = await admin
    .from("merchant_equipment")
    .insert(extendedValues)
    .select(EQUIPMENT_SELECT_COLUMNS)
    .single();
  if (error && isMissingColumnError(error)) {
    ({ data, error } = await admin
      .from("merchant_equipment")
      .insert(baseValues)
      .select(EQUIPMENT_SELECT_COLUMNS_BASE)
      .single());
  }
  if (error) {
    if (isMissingMerchantEquipmentTable(error)) {
      return { error: null, skipped: true, data: null };
    }
    return { error: error.message, skipped: false, data: null };
  }

  revalidatePath("/merchants");
  revalidatePath(`/merchants/${merchantId}`);
  return { error: null, skipped: false, data };
}

export async function updateMerchantEquipment(
  id: string,
  merchantId: string,
  input: MerchantEquipmentInput,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const validationError = validateEquipmentInput(input);
  if (validationError) return { error: validationError };

  const admin = createAdminClient();
  const { error } = await admin
    .from("merchant_equipment")
    .update({
      name: input.name.trim(),
      serial_number: input.serialNumber.trim() || null,
      installed_date: input.installedDate || null,
      notes: input.notes.trim() || null,
      category: input.category ?? "etc",
      quantity: input.quantity ?? 1,
      components: input.components?.trim() || null,
      manufacturer: input.manufacturer?.trim() || null,
      supplier: input.supplier?.trim() || null,
      location: input.location?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    if (isMissingColumnError(error)) {
      return { error: "설치 구성 상세 정보를 아직 사용할 수 없습니다. (마이그레이션 미적용)" };
    }
    return { error: error.message };
  }

  revalidatePath("/merchants");
  revalidatePath(`/merchants/${merchantId}`);
  return { error: null };
}

export async function updateMerchantEquipmentStatus(id: string, status: MerchantEquipmentStatus) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("merchant_equipment")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/merchants");
  return { error: null };
}

export async function deleteMerchantEquipment(id: string) {
  const authError = await requireDeletePermission();
  if (authError) return { error: authError };
  if (!id) return { error: null };

  const admin = createAdminClient();
  // merchant_id를 스냅샷에서 회수해 삭제 후 해당 가맹점 페이지를 재검증한다.
  const snapshots = await fetchRowsForDeletion("merchant_equipment", [id]);
  const { error } = await admin.from("merchant_equipment").delete().eq("id", id);
  if (error) return { error: error.message };
  await recordDeletions("merchant_equipment", snapshots);

  revalidatePath("/merchants");
  const merchantId = snapshots[0]?.merchant_id;
  if (typeof merchantId === "string") revalidatePath(`/merchants/${merchantId}`);
  return { error: null };
}

export async function deleteMerchants(ids: string[]) {
  const authError = await requireDeletePermission();
  if (authError) return { error: authError };
  if (!ids.length) return { error: null };
  const supabase = createAdminClient();
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    // 가맹점을 지우면 메모·장비 등 연결 데이터도 CASCADE로 사라지므로 삭제 전에 스냅샷을 남긴다
    const snapshots = await fetchRowsForDeletion("merchants", chunk);
    const { error } = await supabase.from("merchants").delete().in("id", chunk);
    if (error) return { error: error.message };
    await recordDeletions("merchant", snapshots);
  }
  return { error: null };
}
