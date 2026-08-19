"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDeletePermission } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import { isAsChecklistComplete, type MerchantMemoEntryType } from "@/lib/asChecklist";
import { fetchRowsForDeletion, recordDeletions } from "@/lib/deletionLog";

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
  return { error: null, skipped: false };
}

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
    brand?: string;
  },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };
  if (!merchantId) return { error: "가맹점을 찾을 수 없습니다." };
  if (!input.businessName.trim()) return { error: "상호명을 입력해주세요." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("merchants")
    .update({
      business_name: input.businessName.trim(),
      owner_name: input.ownerName.trim(),
      phone: input.phone.trim(),
      address: input.address.trim() || null,
      address_detail: input.addressDetail.trim() || null,
      business_number: input.businessNumber?.trim() || null,
      toss_merchant_no: input.tossMerchantNo?.trim() || null,
      contract_expires_at: input.contractExpiresAt?.trim() || null,
      brand: input.brand?.trim() || null,
    })
    .eq("id", merchantId);
  if (error) return { error: error.message };

  revalidatePath("/merchants");
  return { error: null };
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

export async function addMerchantEquipment(
  merchantId: string,
  input: { name: string; serialNumber: string; installedDate: string; notes: string },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다.", skipped: false, data: null };
  if (!merchantId || !input.name.trim()) {
    return { error: "장비명을 입력해주세요.", skipped: false, data: null };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("merchant_equipment")
    .insert({
      merchant_id: merchantId,
      name: input.name.trim(),
      serial_number: input.serialNumber.trim() || null,
      installed_date: input.installedDate || null,
      notes: input.notes.trim() || null,
      created_by: user.id,
    })
    .select("id,name,serial_number,status,installed_date,notes,created_at")
    .single();
  if (error) {
    if (isMissingMerchantEquipmentTable(error)) {
      return { error: null, skipped: true, data: null };
    }
    return { error: error.message, skipped: false, data: null };
  }

  revalidatePath("/merchants");
  return { error: null, skipped: false, data };
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
