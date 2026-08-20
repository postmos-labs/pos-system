import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import MerchantsClient from "./MerchantsClient";
import { loadMerchant360 } from "./loadMerchant360";
import type { Merchant360Merchant } from "./merchant360";

const PAGE_SIZE = 50;

interface Props {
  searchParams: Promise<{ page?: string; id?: string }>;
}

export default async function MerchantsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: merchants, count } = await supabase
    .from("merchants")
    .select(
      "id,business_name,owner_name,phone,address,address_detail,created_at,franchise_application_id",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const merchantRows = (merchants ?? []) as Merchant360Merchant[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const selectedId = params.id ?? merchantRows[0]?.id ?? null;
  const selected = selectedId ? await loadMerchant360(supabase, selectedId) : null;

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
        page={page}
        totalPages={totalPages}
      />

      {totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-center gap-2">
          <Link
            href={`/merchants?page=${Math.max(1, page - 1)}${selectedId ? `&id=${selectedId}` : ""}`}
            className={`rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium ${page <= 1 ? "pointer-events-none text-slate-300" : "text-slate-600 hover:bg-slate-50"}`}
          >
            이전
          </Link>
          <span className="text-sm font-medium text-slate-500">
            {page} / {totalPages}
          </span>
          <Link
            href={`/merchants?page=${Math.min(totalPages, page + 1)}${selectedId ? `&id=${selectedId}` : ""}`}
            className={`rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium ${page >= totalPages ? "pointer-events-none text-slate-300" : "text-slate-600 hover:bg-slate-50"}`}
          >
            다음
          </Link>
        </div>
      )}
    </div>
  );
}
