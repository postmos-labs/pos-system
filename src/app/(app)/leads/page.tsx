import { createClient } from "@/lib/supabase/server";
import { kstDate } from "@/lib/date";
import { redirect } from "next/navigation";
import LeadsClient from "./LeadsClient";

// 42P01: relation does not exist / PGRST205: PostgREST 스키마 캐시에 표가 없음.
// 149번 마이그레이션(own_leads)이 아직 적용되지 않은 환경에서 쓴다.
function isMissingLeadsTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /own_leads|schema cache|relation .* does not exist/i.test(error.message ?? "")
  );
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id: highlight } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");

  const { data: rows, error } = await supabase
    .from("own_leads")
    .select("*")
    .order("created_at", { ascending: false });

  const schemaMissing = isMissingLeadsTable(error);

  const { data: csProfiles } = await supabase
    .from("profiles")
    .select("id, name, role")
    .in("role", ["cs", "master", "admin"])
    .order("name", { ascending: true });

  const today = kstDate();

  return (
    <div className="flex flex-col h-screen p-6 gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">자체리드 관리</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          대표님·자체영업으로 들어온 건을 확인하고 접수 여부를 판단한 뒤, 접수대상만 가맹접수로
          넘깁니다
        </p>
      </div>
      {error && !schemaMissing ? (
        <div className="text-red-500 text-sm">데이터를 불러오지 못했습니다: {error.message}</div>
      ) : (
        <LeadsClient
          rows={rows ?? []}
          profile={profile}
          csProfiles={csProfiles ?? []}
          today={today}
          schemaMissing={schemaMissing}
          initialHighlightId={highlight}
        />
      )}
    </div>
  );
}
