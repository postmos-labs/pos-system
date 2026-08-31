import { createClient } from "@/lib/supabase/client";

/**
 * 인입내역의 가맹점 검색 후보.
 *
 * merchants만 보면 우국상 관리(woo_customers)에 있는 가게가 나오지 않는다.
 * 두 표는 서로 가리키는 컬럼이 없는 독립된 표라, 검색에서 함께 보여주고
 * 우국상 쪽을 고르면 그때 가맹점으로 만들어 연결한다(linkWooCustomerToMerchant).
 */
export interface MerchantCandidate {
  /** source가 merchant면 merchants.id, woo면 woo_customers.id */
  id: string;
  source: "merchant" | "woo";
  business_name: string;
  phone: string | null;
  address: string | null;
  van_company: string | null;
  /** 우국상 후보가 이미 연결해 둔 가맹점 id */
  linkedMerchantId: string | null;
}

export type CandidateField = "phone" | "business_name";

const MERCHANT_COLUMNS = "id,business_name,phone,address,van_company";
const WOO_COLUMNS = "id,business_name,phone,address,van_company,merchant_id";
const LIMIT = 20;

/** ilike 패턴에서 %·_는 와일드카드다. 문법 문자를 지워 문자 그대로 찾게 한다. */
function sanitize(term: string) {
  return term.replace(/[,()"'\\%*_]/g, "");
}

function toCandidates(rows: unknown, source: MerchantCandidate["source"]): MerchantCandidate[] {
  return ((rows ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    source,
    business_name: (row.business_name as string) ?? "이름 없음",
    phone: (row.phone as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    van_company: (row.van_company as string | null) ?? null,
    linkedMerchantId: (row.merchant_id as string | null) ?? null,
  }));
}

export async function searchMerchantCandidates(
  field: CandidateField,
  term: string,
): Promise<MerchantCandidate[]> {
  const value = term.trim();
  if (!value) return [];

  const supabase = createClient();
  const safe = sanitize(value);
  const digits = value.replace(/[^0-9]/g, "");
  if (field === "phone" ? !digits : !safe) return [];

  let merchants: MerchantCandidate[] = [];
  if (field === "phone") {
    // 숫자만 남긴 컬럼으로 찾아 "010-1234-5678"과 "01012345678"을 같이 취급한다.
    const res = await supabase
      .from("merchants")
      .select(MERCHANT_COLUMNS)
      .ilike("phone_digits", `%${digits}%`)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (res.error) {
      // 127번 마이그레이션 미적용 환경 — 저장된 형식 그대로 찾는다.
      const fallback = await supabase
        .from("merchants")
        .select(MERCHANT_COLUMNS)
        .ilike("phone", `%${safe}%`)
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      merchants = toCandidates(fallback.data, "merchant");
    } else {
      merchants = toCandidates(res.data, "merchant");
    }
  } else {
    const res = await supabase
      .from("merchants")
      .select(MERCHANT_COLUMNS)
      .ilike("business_name", `%${safe}%`)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    merchants = toCandidates(res.data, "merchant");
  }

  // 우국상은 번호가 자유 형식이라 정규화 컬럼이 없다. 입력한 형태 그대로 찾는다.
  // 131번 마이그레이션 전이면 merchant_id가 없어 조회가 실패하므로 우국상 없이 진행한다.
  const wooRes = await supabase
    .from("woo_customers")
    .select(WOO_COLUMNS)
    .ilike(field === "phone" ? "phone" : "business_name", `%${safe}%`)
    .limit(LIMIT);
  const woo = wooRes.error ? [] : toCandidates(wooRes.data, "woo");

  // 이미 가맹점으로 연결된 우국상 건은 그 가맹점이 목록에 있으면 중복이라 뺀다.
  const merchantIds = new Set(merchants.map((row) => row.id));
  const wooOnly = woo.filter(
    (row) => !row.linkedMerchantId || !merchantIds.has(row.linkedMerchantId),
  );

  // 이미 가맹점인 쪽이 정답일 가능성이 높아 먼저 보여준다.
  return [...merchants, ...wooOnly];
}
