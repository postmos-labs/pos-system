import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { KICC_VAN_COMPANY, type VanGroup } from "@/types";
import { computeCsReportMetrics, type CsReportMemoInput } from "@/lib/csReport";
import CsReportClient from "./CsReportClient";

interface Props {
  searchParams: Promise<{ month?: string; van?: string }>;
}

// 117번 마이그레이션(van_company/issue_category/resolution/is_repeat)이 아직 적용되지 않은
// 환경에서 이 컬럼들을 select하면 "column does not exist"(42703) 에러가 난다.
// src/app/(app)/merchants/loadMerchant360.ts의 isMissingColumnError와 같은 패턴.
function isMissingColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist/i.test(error.message ?? "")
  );
}

// src/app/(app)/franchise/FranchiseClient.tsx의 parseVanList와 동일한 로직.
// van_company는 "코세스2,코벤"처럼 쉼표로 여러 개가 들어갈 수 있어 펼쳐서 다뤄야 한다.
function parseVanList(value: string | null | undefined): string[] {
  return value
    ? value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

function isValidMonth(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}$/.test(value);
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNum] = month.split("-").map(Number);
  const total = year * 12 + (monthNum - 1) + delta;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return `${newYear}-${String(newMonth).padStart(2, "0")}`;
}

// KST 기준 월 시작/끝. dashboard/page.tsx, franchise/fetchFranchiseListData.ts와 같은 방식.
function monthRangeKst(month: string) {
  const startIso = new Date(`${month}-01T00:00:00+09:00`).toISOString();
  const endIso = new Date(`${shiftMonth(month, 1)}-01T00:00:00+09:00`).toISOString();
  return { startIso, endIso };
}

const MERCHANT_BASE_COLUMNS = "id,brand,franchise_application_id";
const MERCHANT_FULL_COLUMNS = `${MERCHANT_BASE_COLUMNS},van_company`;

const MEMO_BASE_COLUMNS = "id,merchant_id,entry_type,created_at";
const MEMO_FULL_COLUMNS = `${MEMO_BASE_COLUMNS},issue_category,resolution,is_repeat`;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Supabase는 select에 범위를 주지 않으면 한 번에 최대 1000행만 돌려준다. 가맹점이 1000개를
// 넘으면 보고서 숫자가 조용히 줄어들어 잘못된 값을 KICC에 보내게 되므로 끝까지 나눠 읽는다.
// ExcelDownloadButton.tsx의 fetchAllRows와 같은 방식.
const PAGE_SIZE = 1000;
// PostgREST의 in(...)은 쿼리스트링으로 나가므로 id를 한꺼번에 넣으면 URL 길이 제한에 걸린다.
const IN_CHUNK_SIZE = 100;

async function fetchAllPages<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ rows: T[]; error: unknown }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await run(from, from + PAGE_SIZE - 1);
    if (error) {
      // 결과가 0건일 때 PostgREST가 던지는 PGRST103은 실패가 아니라 빈 결과다.
      if ((error as { code?: string }).code === "PGRST103") break;
      return { rows, error };
    }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return { rows, error: null };
}

type MerchantRow = {
  id: string;
  brand: string | null;
  franchise_application_id: string | null;
  van_company?: string | null;
};

type MemoRow = {
  id: string;
  merchant_id: string;
  entry_type: "as" | "claim" | "general" | "etc";
  created_at: string;
  issue_category?: CsReportMemoInput["issue_category"];
  resolution?: CsReportMemoInput["resolution"];
  is_repeat?: CsReportMemoInput["is_repeat"];
};

async function fetchMerchants(supabase: SupabaseServerClient) {
  const full = await fetchAllPages<MerchantRow>((from, to) =>
    supabase
      .from("merchants")
      .select(MERCHANT_FULL_COLUMNS)
      .range(from, to)
      .overrideTypes<MerchantRow[]>(),
  );
  if (full.error && isMissingColumnError(full.error as { code?: string; message?: string })) {
    const base = await fetchAllPages<MerchantRow>((from, to) =>
      supabase
        .from("merchants")
        .select(MERCHANT_BASE_COLUMNS)
        .range(from, to)
        .overrideTypes<MerchantRow[]>(),
    );
    return { rows: base.rows, error: base.error, schemaReady: false };
  }
  return { rows: full.rows, error: full.error, schemaReady: true };
}

async function fetchMemos(supabase: SupabaseServerClient, startIso: string, endIso: string) {
  const query = (columns: string) => (from: number, to: number) =>
    supabase
      .from("merchant_memo_entries")
      .select(columns)
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .range(from, to)
      .overrideTypes<MemoRow[]>();

  const full = await fetchAllPages<MemoRow>(query(MEMO_FULL_COLUMNS));
  if (full.error && isMissingColumnError(full.error as { code?: string; message?: string })) {
    const base = await fetchAllPages<MemoRow>(query(MEMO_BASE_COLUMNS));
    return { rows: base.rows, error: base.error, schemaReady: false };
  }
  return { rows: full.rows, error: full.error, schemaReady: true };
}

export default async function CsReportPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const kstToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const month = isValidMonth(params.month) ? params.month : kstToday.slice(0, 7);
  // 리포트는 개별 VAN사가 아니라 계열(토스계열/KICC) 단위로만 본다. 기본은 토스계열.
  const van: VanGroup = params.van === "kicc" ? "kicc" : "toss";

  const { startIso, endIso } = monthRangeKst(month);
  const { startIso: prevStartIso, endIso: prevEndIso } = monthRangeKst(shiftMonth(month, -1));

  const [merchantsResult, memosResult, prevMemosResult, equipmentResult] = await Promise.all([
    fetchMerchants(supabase),
    fetchMemos(supabase, startIso, endIso),
    fetchMemos(supabase, prevStartIso, prevEndIso),
    fetchAllPages<{ id: string; merchant_id: string; status: string }>((from, to) =>
      supabase
        .from("merchant_equipment")
        .select("id,merchant_id,status")
        .eq("status", "as")
        .range(from, to),
    ),
  ]);

  const schemaReady =
    merchantsResult.schemaReady && memosResult.schemaReady && prevMemosResult.schemaReady;

  const merchants = merchantsResult.rows;
  const franchiseApplicationIds = [
    ...new Set(merchants.map((m) => m.franchise_application_id).filter((id): id is string => !!id)),
  ];
  // in(...)은 쿼리스트링으로 나가므로 id를 나눠서 조회한다. 한 번에 몰면 URL 길이 제한에 걸린다.
  const franchiseVanById = new Map<string, string | null>();
  let franchiseVanError: unknown = null;
  for (let i = 0; i < franchiseApplicationIds.length; i += IN_CHUNK_SIZE) {
    const chunk = franchiseApplicationIds.slice(i, i + IN_CHUNK_SIZE);
    const { data, error } = await supabase
      .from("franchise_applications")
      .select("id,van_company")
      .in("id", chunk);
    if (error) {
      franchiseVanError = error;
      break;
    }
    for (const row of data ?? []) franchiseVanById.set(row.id, row.van_company);
  }

  // 조회 자체가 실패했는데 0으로 표시하면 "장애 0건"처럼 보여 잘못된 보고로 이어진다.
  // 스키마 미적용(schemaReady=false)은 별도 안내가 있으므로 여기서 제외한다.
  const loadFailed = !!(
    merchantsResult.error ||
    memosResult.error ||
    prevMemosResult.error ||
    equipmentResult.error ||
    franchiseVanError
  );

  // merchants.van_company가 비어 있으면 연결된 franchise_applications.van_company로 폴백한다.
  // MerchantInfoCard.tsx의 effectiveVanCompany와 같은 원칙.
  function effectiveVanList(merchant: MerchantRow): string[] {
    const own = merchant.van_company;
    const fallback = merchant.franchise_application_id
      ? (franchiseVanById.get(merchant.franchise_application_id) ?? null)
      : null;
    return parseVanList(own || fallback || "");
  }

  // 가맹점 탭의 계열 필터와 같은 정의 — kicc: KICC 포함 / toss: VAN사가 있고 KICC 미포함.
  const isKiccList = (list: string[]) =>
    list.some((v) => v.toUpperCase().includes(KICC_VAN_COMPANY));
  const matchingMerchantIds = new Set(
    merchants
      .filter((m) => {
        const list = effectiveVanList(m);
        return van === "kicc" ? isKiccList(list) : list.length > 0 && !isKiccList(list);
      })
      .map((m) => m.id),
  );
  const brandByMerchantId = new Map(merchants.map((m) => [m.id, m.brand ?? null]));

  function toReportInput(rows: MemoRow[]): CsReportMemoInput[] {
    return rows
      .filter((row) => matchingMerchantIds.has(row.merchant_id))
      .map((row) => ({
        entry_type: row.entry_type,
        issue_category: row.issue_category ?? null,
        resolution: row.resolution ?? null,
        is_repeat: row.is_repeat ?? null,
        brand: brandByMerchantId.get(row.merchant_id) ?? null,
      }));
  }

  const metrics = computeCsReportMetrics(
    toReportInput(memosResult.rows),
    toReportInput(prevMemosResult.rows),
  );

  const replacementEquipmentCount = equipmentResult.rows.filter((row) =>
    matchingMerchantIds.has(row.merchant_id),
  ).length;

  return (
    <CsReportClient
      month={month}
      van={van}
      schemaReady={schemaReady}
      loadFailed={loadFailed}
      managedMerchantCount={matchingMerchantIds.size}
      replacementEquipmentCount={replacementEquipmentCount}
      metrics={metrics}
    />
  );
}
