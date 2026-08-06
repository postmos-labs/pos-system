"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDeletePermission } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";

const CHUNK_SIZE = 100;

function isMissingMerchantMemoEntriesTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /merchant_memo_entries|schema cache|relation .* does not exist/i.test(error.message ?? "")
  );
}

export async function addMerchantMemo(merchantId: string, content: string) {
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

  const admin = createAdminClient();
  const { error } = await admin.from("merchant_memo_entries").insert({
    merchant_id: merchantId,
    content: trimmedContent,
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

export async function deleteMerchants(ids: string[]) {
  const authError = await requireDeletePermission();
  if (authError) return { error: authError };
  if (!ids.length) return { error: null };
  const supabase = createAdminClient();
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from("merchants").delete().in("id", chunk);
    if (error) return { error: error.message };
  }
  return { error: null };
}
