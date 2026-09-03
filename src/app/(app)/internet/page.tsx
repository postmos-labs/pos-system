import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import InternetClient from "./InternetClient";
import { fetchAllRows, DEFAULT_MAX_ROWS } from "@/lib/fetchAllRows";
import { TruncationNotice } from "@/components/ui/TruncationNotice";
import type { InternetManagement } from "@/types";

export default async function InternetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const {
    data: rows,
    error,
    truncated,
  } = await fetchAllRows<InternetManagement>(
    (from, to) =>
      supabase
        .from("internet_management")
        .select("*")
        .order("sort_order", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        // 페이지 경계에서 행이 중복·누락되지 않도록 유니크 컬럼으로 순서를 확정한다.
        .order("id", { ascending: false })
        .range(from, to),
    { label: "internet/page" },
  );

  return (
    <div className="flex flex-col h-screen p-6 gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">인터넷 관리</h1>
        <p className="text-sm text-slate-500 mt-0.5">인터넷 개통 관리대장</p>
      </div>
      {error ? (
        <div className="text-red-500 text-sm">데이터를 불러오지 못했습니다: {error.message}</div>
      ) : (
        <>
          {truncated && <TruncationNotice maxRows={DEFAULT_MAX_ROWS} />}
          <InternetClient rows={rows ?? []} />
        </>
      )}
    </div>
  );
}
