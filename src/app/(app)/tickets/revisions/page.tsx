import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Profile } from "@/types";
import RevisionsClient from "./RevisionsClient";
import {
  loadRevisionRows,
  REVISION_STATUS_FILTERS,
  type RevisionStatusFilter,
} from "../revisionRows";

interface Props {
  searchParams: Promise<{ status?: string }>;
}

export default async function TicketRevisionsPage({ searchParams }: Props) {
  const params = await searchParams;
  const status: RevisionStatusFilter = REVISION_STATUS_FILTERS.includes(
    params.status as RevisionStatusFilter,
  )
    ? (params.status as RevisionStatusFilter)
    : "open";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");
  if ((profile as Profile).role !== "master") redirect("/tickets");

  const { rows, schemaReady, openCount } = await loadRevisionRows(supabase, status);

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">수정 요청 관리</h1>
        <p className="mt-1 text-sm text-slate-500">
          마스터가 보낸 인입내역 수정 요청과 처리 여부를 관리합니다.
        </p>
      </div>

      {!schemaReady && (
        <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-700">
          수정 요청 마이그레이션(supabase/139)이 아직 적용되지 않았습니다.
        </div>
      )}

      <RevisionsClient rows={rows} status={status} openCount={openCount} />
    </div>
  );
}
