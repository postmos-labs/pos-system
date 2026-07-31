"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";

interface Props {
  userId: string;
  initialCount: number;
}

const POLL_INTERVAL_MS = 60_000;

export default function RealtimeNotification({ userId }: Props) {
  const [modal, setModal] = useState<{ title: string; body?: string; href?: string } | null>(null);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const sinceRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const { data } = await supabase
        .from("notifications")
        .select(
          "type, title, body, created_at, installation_id, franchise_application_id, ticket_id",
        )
        .eq("user_id", userId)
        .gt("created_at", sinceRef.current)
        .order("created_at", { ascending: true });

      if (cancelled || !data || data.length === 0) return;

      sinceRef.current = data[data.length - 1].created_at;

      let hasScheduleNotice = false;
      for (const row of data) {
        if ((row.type as string)?.startsWith("schedule_")) {
          hasScheduleNotice = true;
          continue;
        }
        const href = row.installation_id
          ? `/installs?id=${row.installation_id}`
          : row.franchise_application_id
            ? `/franchise?id=${row.franchise_application_id}`
            : row.ticket_id
              ? `/tickets/${row.ticket_id}`
              : "/notifications";
        setModal({ title: row.title, body: row.body ?? undefined, href });
      }
      if (hasScheduleNotice) router.refresh();
    }

    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [router, supabase, userId]);

  return (
    <>
      {}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setModal(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm mx-4 overflow-hidden">
            <div className="bg-blue-600 px-5 py-4 flex items-center gap-3">
              <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                <Bell size={18} className="text-white" />
              </div>
              <p className="text-white font-bold text-sm flex-1">새 알림</p>
              <button onClick={() => setModal(null)} className="text-white/70 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-5">
              <p className="text-slate-900 font-bold text-base mb-1">{modal.title}</p>
              {modal.body && <p className="text-slate-500 text-sm">{modal.body}</p>}
            </div>
            <div className="px-5 pb-5">
              <button
                onClick={() => {
                  const href = modal.href;
                  setModal(null);
                  if (href) router.push(href);
                }}
                className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
              >
                {modal.href ? "승인요청 보기" : "확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
