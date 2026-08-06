import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ChangesClient from "./ChangesClient";

interface Props {
  searchParams: Promise<{ id?: string }>;
}

export default async function ChangesPage({ searchParams }: Props) {
  const { id } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: rows, error }, { data: csProfiles }, { data: currentProfile }] = await Promise.all(
    [
      supabase
        .from("change_requests")
        .select(
          "*, cs:profiles!change_requests_cs_id_fkey(id,name,role), creator:profiles!change_requests_created_by_fkey(id,name,role)",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("id,name,role")
        .in("role", ["cs", "admin", "master"])
        .order("name"),
      supabase.from("profiles").select("name,role").eq("id", user.id).single(),
    ],
  );

  return (
    <div className="flex flex-col h-screen p-6 gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">변경 관리</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          통장변경 · 상호변경 · 대표자변경 · 주소변경 · 업종변경
        </p>
      </div>
      {error ? (
        <div className="text-red-500 text-sm">데이터를 불러오지 못했습니다: {error.message}</div>
      ) : (
        <ChangesClient
          rows={rows ?? []}
          csProfiles={csProfiles ?? []}
          currentUserId={user.id}
          currentUserName={currentProfile?.name ?? ""}
          currentUserRole={currentProfile?.role ?? ""}
          initialHighlightId={id}
        />
      )}
    </div>
  );
}
