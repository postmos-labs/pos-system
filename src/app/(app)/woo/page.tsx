import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import WooClient from "./WooClient";
import { fetchAllRows, fetchByIdChunks, DEFAULT_MAX_ROWS } from "@/lib/fetchAllRows";
import { TruncationNotice } from "@/components/ui/TruncationNotice";
import type { WooCustomer } from "@/types";

export default async function WooPage({
  searchParams,
}: {
  searchParams: Promise<{ highlight?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { highlight } = await searchParams;

  const {
    data: rows,
    error,
    truncated,
  } = await fetchAllRows<WooCustomer>(
    (from, to) =>
      supabase
        .from("woo_customers")
        .select("*")
        .order("created_at", { ascending: false })
        // 페이지 경계에서 행이 중복·누락되지 않도록 유니크 컬럼으로 순서를 확정한다.
        .order("id", { ascending: false })
        .range(from, to),
    { label: "woo/page" },
  );

  const linkedInstalls: Record<string, { id: string; status: string }> = {};
  if (rows && rows.length > 0) {
    const { data: installs } = await fetchByIdChunks(
      rows.map((r) => r.id),
      (chunk) =>
        supabase
          .from("installations")
          .select("id, status, woo_customer_id")
          .in("woo_customer_id", chunk),
    );
    for (const inst of installs ?? []) {
      if (inst.woo_customer_id)
        linkedInstalls[inst.woo_customer_id] = { id: inst.id, status: inst.status };
    }
  }

  return (
    <div className="flex flex-col h-screen p-6 gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">우국상 관리</h1>
        <p className="text-sm text-slate-500 mt-0.5">우리동네국민상회 고객관리대장 CRM</p>
      </div>
      {error ? (
        <div className="text-red-500 text-sm">데이터를 불러오지 못했습니다: {error.message}</div>
      ) : (
        <>
          {truncated && <TruncationNotice maxRows={DEFAULT_MAX_ROWS} />}
          <WooClient
            rows={rows ?? []}
            currentUserId={user.id}
            linkedInstalls={linkedInstalls}
            initialHighlightId={highlight}
          />
        </>
      )}
    </div>
  );
}
