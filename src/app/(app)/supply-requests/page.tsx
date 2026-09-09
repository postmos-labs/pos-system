import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SupplyRequestsClient from "./SupplyRequestsClient";

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

export default async function SupplyRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");

  const { data: rows, error } = await supabase
    .from("supply_requests")
    .select("*")
    .order("is_urgent", { ascending: false })
    .order("created_at", { ascending: false });

  const schemaMissing = isMissingSupplyTable(error);

  return (
    <div className="flex flex-col h-screen p-6 gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">물품요청</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          필요한 물품을 올리면 실장급 이상이 승인합니다
        </p>
      </div>
      {error && !schemaMissing ? (
        <div className="text-red-500 text-sm">데이터를 불러오지 못했습니다: {error.message}</div>
      ) : (
        <SupplyRequestsClient rows={rows ?? []} profile={profile} schemaMissing={schemaMissing} />
      )}
    </div>
  );
}
