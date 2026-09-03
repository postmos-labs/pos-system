import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TransfersClient from "./TransfersClient";
import { fetchAllRows, fetchByIdChunks, DEFAULT_MAX_ROWS } from "@/lib/fetchAllRows";
import { TruncationNotice } from "@/components/ui/TruncationNotice";

export default async function TransfersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: rows, error, truncated }, { data: techProfiles }] = await Promise.all([
    fetchAllRows(
      (from, to) =>
        supabase
          .from("franchise_applications")
          .select("*, tech:profiles!franchise_applications_tech_id_fkey(id,name,role)")
          .eq("case_type", "conversion")
          .order("updated_at", { ascending: false })
          // 페이지 경계에서 행이 중복·누락되지 않도록 유니크 컬럼으로 순서를 확정한다.
          .order("id", { ascending: false })
          .range(from, to),
      { label: "transfers/page" },
    ),
    supabase
      .from("profiles")
      .select("id,name,role")
      .in("role", ["tech", "admin", "master"])
      .order("name"),
  ]);

  const linkedInstalls: Record<string, { id: string; status: string }> = {};
  if (rows && rows.length > 0) {
    const { data: installs } = await fetchByIdChunks(
      rows.map((r) => r.id),
      (chunk) =>
        supabase
          .from("installations")
          .select("id, status, franchise_application_id")
          .in("franchise_application_id", chunk),
    );
    for (const inst of installs ?? []) {
      if (inst.franchise_application_id)
        linkedInstalls[inst.franchise_application_id] = { id: inst.id, status: inst.status };
    }
  }

  return (
    <div className="flex flex-col h-screen p-6 gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">전환건</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          가맹 접수 중 구분이 &quot;전환&quot;인 건만 모아보기
        </p>
      </div>
      {error ? (
        <div className="text-red-500 text-sm">데이터를 불러오지 못했습니다: {error.message}</div>
      ) : (
        <>
          {truncated && <TruncationNotice maxRows={DEFAULT_MAX_ROWS} />}
          <TransfersClient
            rows={rows ?? []}
            techProfiles={techProfiles ?? []}
            currentUserId={user.id}
            linkedInstalls={linkedInstalls}
          />
        </>
      )}
    </div>
  );
}
