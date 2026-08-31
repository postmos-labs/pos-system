"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireDeletePermission } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";

const CHUNK_SIZE = 100;

export async function deleteWooRows(ids: string[]) {
  const authError = await requireDeletePermission();
  if (authError) return { error: authError };
  if (!ids.length) return { error: null };
  const supabase = createAdminClient();
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from("woo_customers").delete().in("id", chunk);
    if (error) return { error: error.message };
  }
  return { error: null };
}

// 우국상 고객을 가맹점으로 연결한다. 인입내역은 merchants만 가리킬 수 있어(FK)
// 우국상 고객을 직접 붙일 수 없기 때문이다.
//
// 순서대로 확인해 중복 가맹점이 생기지 않게 한다.
//   1) 이미 연결된 가맹점이 있으면 그것을 쓴다
//   2) 같은 번호의 가맹점이 이미 있으면 그것에 연결한다
//   3) 둘 다 없을 때만 새로 만든다
// 어느 경우든 woo_customers.merchant_id에 결과를 남겨 다음부터는 1)에서 끝난다.
export async function linkWooCustomerToMerchant(wooId: string) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다.", merchantId: null, created: false };
  if (!wooId) return { error: "잘못된 요청입니다.", merchantId: null, created: false };

  const admin = createAdminClient();
  const { data: woo, error: wooError } = await admin
    .from("woo_customers")
    .select("id,business_name,owner_name,business_number,phone,address,van_company,merchant_id")
    .eq("id", wooId)
    .maybeSingle();
  if (wooError) return { error: wooError.message, merchantId: null, created: false };
  if (!woo) return { error: "우국상 고객을 찾을 수 없습니다.", merchantId: null, created: false };

  // 1) 이미 연결돼 있으면 그대로 쓴다.
  if (woo.merchant_id)
    return { error: null, merchantId: woo.merchant_id as string, created: false };

  // 2) 번호가 같은 가맹점이 이미 있으면 새로 만들지 않는다.
  const digits = (woo.phone ?? "").replace(/[^0-9]/g, "");
  if (digits.length >= 8) {
    const { data: existing, error: existingError } = await admin
      .from("merchants")
      .select("id")
      .eq("phone_digits", digits)
      .limit(2);
    // phone_digits가 없는 환경(127 미적용)에서는 이 단계를 건너뛴다.
    if (!existingError && existing && existing.length === 1) {
      await admin.from("woo_customers").update({ merchant_id: existing[0].id }).eq("id", wooId);
      return { error: null, merchantId: existing[0].id as string, created: false };
    }
  }

  // 3) 새로 만든다. merchants.owner_name/phone/address는 NOT NULL이라 빈 값으로 채운다.
  const { data: created, error: createError } = await admin
    .from("merchants")
    .insert({
      business_name: (woo.business_name ?? "").trim() || "이름 없음",
      owner_name: woo.owner_name ?? "",
      business_number: woo.business_number ?? null,
      phone: woo.phone ?? "",
      address: woo.address ?? "",
      van_company: woo.van_company ?? null,
      sales_id: user.id,
    })
    .select("id")
    .single();
  if (createError || !created) {
    return {
      error: createError?.message ?? "가맹점 생성에 실패했습니다.",
      merchantId: null,
      created: false,
    };
  }

  await admin.from("woo_customers").update({ merchant_id: created.id }).eq("id", wooId);
  return { error: null, merchantId: created.id as string, created: true };
}
