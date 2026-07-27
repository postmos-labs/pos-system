import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TransfersClient from "./TransfersClient";

export default async function TransfersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: rows, error }, { data: techProfiles }] = await Promise.all([
    supabase
      .from("franchise_applications")
      .select("*, tech:profiles!franchise_applications_tech_id_fkey(id,name,role)")
      .eq("reception_channel_legacy", "전환")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id,name,role")
      .in("role", ["tech", "admin", "master"])
      .order("name"),
  ]);

  const linkedInstalls: Record<string, { id: string; status: string }> = {};
  if (rows && rows.length > 0) {
    const { data: installs } = await supabase
      .from("installations")
      .select("id, status, franchise_application_id")
      .in(
        "franchise_application_id",
        rows.map((r) => r.id),
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
          가맹 접수 중 접수채널이 &quot;전환&quot;인 건만 모아보기
        </p>
      </div>
      {error ? (
        <div className="text-red-500 text-sm">데이터를 불러오지 못했습니다: {error.message}</div>
      ) : (
        <TransfersClient
          rows={rows ?? []}
          techProfiles={techProfiles ?? []}
          currentUserId={user.id}
          linkedInstalls={linkedInstalls}
        />
      )}
    </div>
  );
}
