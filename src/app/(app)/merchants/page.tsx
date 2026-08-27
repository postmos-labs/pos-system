import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import MerchantsClient from "./MerchantsClient";
import { loadMerchant360 } from "./loadMerchant360";
import type { Merchant360Merchant } from "./merchant360";
import type { VanGroup } from "@/types";

const PAGE_SIZE = 50;
const MERCHANT_LIST_BASE_COLUMNS =
  "id,business_name,owner_name,phone,address,address_detail,created_at,franchise_application_id";
const MERCHANT_LIST_COLUMNS = `${MERCHANT_LIST_BASE_COLUMNS},van_company`;

type VanFilter = VanGroup | "";

interface Props {
  searchParams: Promise<{ page?: string; id?: string; van?: string }>;
}

// 117번 마이그레이션이 아직 적용되지 않은 dev/기존 환경에서는 van_company 컬럼이 없어
// 이 컬럼을 참조하는 쿼리가 "column does not exist"(42703)로 실패한다. 실패로 취급하지 않고
// 필터 없는 원래 쿼리로 흡수한다.
function isMissingColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist/i.test(error.message ?? "")
  );
}

interface VanFilterable<T> {
  ilike(column: string, pattern: string): T;
  not(column: string, operator: string, value: unknown): T;
}

function applyVanFilter<T extends VanFilterable<T>>(query: T, van: VanFilter): T {
  if (van === "kicc") return query.ilike("van_company", "%KICC%");
  if (van === "toss") {
    return query.not("van_company", "is", null).not("van_company", "ilike", "%KICC%");
  }
  return query;
}

export default async function MerchantsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const van: VanFilter = params.van === "toss" || params.van === "kicc" ? params.van : "";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const listQuery = applyVanFilter(
    supabase
      .from("merchants")
      .select(MERCHANT_LIST_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    van,
  );
  const allCountQuery = applyVanFilter(
    supabase.from("merchants").select("id", { count: "exact", head: true }),
    "",
  );
  const tossCountQuery = applyVanFilter(
    supabase.from("merchants").select("id", { count: "exact", head: true }),
    "toss",
  );
  const kiccCountQuery = applyVanFilter(
    supabase.from("merchants").select("id", { count: "exact", head: true }),
    "kicc",
  );

  const [listResult, allCountResult, tossCountResult, kiccCountResult, profileResult] =
    await Promise.all([
      listQuery,
      allCountQuery,
      tossCountQuery,
      kiccCountQuery,
      supabase.from("profiles").select("role, can_delete").eq("id", user.id).single(),
    ]);
  const profile = profileResult.data;
  const canDelete =
    profile?.role === "admin" || profile?.role === "master" || !!profile?.can_delete;

  const vanMigrationMissing =
    isMissingColumnError(listResult.error) ||
    isMissingColumnError(tossCountResult.error) ||
    isMissingColumnError(kiccCountResult.error);

  // 폴백 조회는 van_company가 빠진 컬럼셋이라 두 결과의 추론 타입이 다르다.
  // 어차피 아래에서 Merchant360Merchant[]로 쓰므로 여기서 한 번만 맞춰둔다.
  let merchants = listResult.data as Merchant360Merchant[] | null;
  let count = listResult.count;

  if (vanMigrationMissing && listResult.error) {
    const fallback = await supabase
      .from("merchants")
      .select(MERCHANT_LIST_BASE_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    merchants = fallback.data as Merchant360Merchant[] | null;
    count = fallback.count;
  }

  const merchantRows = merchants ?? [];
  const totalCount = count ?? 0;
  const vanCounts = vanMigrationMissing
    ? { all: null, toss: null, kicc: null }
    : {
        all: allCountResult.count ?? 0,
        toss: tossCountResult.count ?? 0,
        kicc: kiccCountResult.count ?? 0,
      };
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const selectedId = params.id ?? merchantRows[0]?.id ?? null;
  const selected = selectedId ? await loadMerchant360(supabase, selectedId) : null;
  const vanQuery = van ? `&van=${van}` : "";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <div className="flex shrink-0 items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">가맹점 360도 뷰</h1>
          <p className="mt-1 text-sm text-slate-500">
            가맹점 정보와 관련 업무 이력을 한 화면에서 확인합니다.
          </p>
        </div>
        <span className="text-sm font-medium text-slate-500">가맹점 {totalCount}</span>
      </div>

      <MerchantsClient
        merchants={merchantRows}
        selectedId={selectedId}
        selectedMerchant={selected?.merchant ?? null}
        selectedApplication={selected?.application ?? null}
        history={selected?.history ?? []}
        memos={selected?.memos ?? []}
        equipment={selected?.equipment ?? []}
        equipmentCategorySummaries={selected?.equipmentCategorySummaries ?? []}
        derivedSummary={selected?.derivedSummary ?? null}
        page={page}
        totalPages={totalPages}
        van={van}
        vanCounts={vanCounts}
        canDelete={canDelete}
      />

      {totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-center gap-2">
          <Link
            href={`/merchants?page=${Math.max(1, page - 1)}${selectedId ? `&id=${selectedId}` : ""}${vanQuery}`}
            className={`rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium ${page <= 1 ? "pointer-events-none text-slate-300" : "text-slate-600 hover:bg-slate-50"}`}
          >
            이전
          </Link>
          <span className="text-sm font-medium text-slate-500">
            {page} / {totalPages}
          </span>
          <Link
            href={`/merchants?page=${Math.min(totalPages, page + 1)}${selectedId ? `&id=${selectedId}` : ""}${vanQuery}`}
            className={`rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium ${page >= totalPages ? "pointer-events-none text-slate-300" : "text-slate-600 hover:bg-slate-50"}`}
          >
            다음
          </Link>
        </div>
      )}
    </div>
  );
}
