"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";

interface InventoryLogRow {
  id: string;
  item_name: string;
  change: number;
  reason: string | null;
  created_at: string;
}

function isMissingInventoryLink(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "42P01" ||
    /column .* does not exist|relation .* does not exist/i.test(error.message ?? "")
  );
}

export default function MerchantInventorySection({ merchantId }: { merchantId: string }) {
  const [logs, setLogs] = useState<InventoryLogRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("inventory_logs")
      .select("id,item_name,change,reason,created_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // 132번 마이그레이션(merchant_id 컬럼) 미적용 환경이거나 테이블이 없을 때는
          // 오류를 표시하지 않고 조용히 빈 목록으로 둔다.
          if (!isMissingInventoryLink(error)) return;
          setLogs([]);
          return;
        }
        setLogs(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [merchantId]);

  if (logs.length === 0) return null;

  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white px-5 py-5 md:px-6">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">장비 입출고</h3>
          <p className="mt-0.5 text-xs text-slate-400">재고 실사에서 이 가맹점으로 기록된 변동</p>
        </div>
        <span className="text-xs text-slate-400">{logs.length}건</span>
      </div>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {logs.map((log) => (
          <div key={log.id} className="flex items-center gap-3 px-3.5 py-3">
            <span className="w-10 shrink-0 text-xs text-slate-400">
              {format(new Date(log.created_at), "M/d", { locale: ko })}
            </span>
            <span className="flex-1 truncate text-sm font-medium text-slate-800">
              {log.item_name}
            </span>
            <span
              className={`w-12 shrink-0 text-right text-sm font-bold ${
                log.change > 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {log.change > 0 ? `+${log.change}` : log.change}
            </span>
            {log.reason && (
              <span className="w-28 shrink-0 truncate text-right text-xs text-slate-500">
                {log.reason}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
