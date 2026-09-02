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

// 버튼 문구는 알림 종류에 맞춰 정한다. 예전에는 이동할 곳이 있으면 무조건 "승인요청 보기"라
// 적혀서, 공지처럼 승인과 무관한 알림에도 그 문구가 떴다.
function actionLabelFor(type: string | null, href?: string) {
  if (!href) return "확인";
  if (type?.startsWith("approval_")) return "승인요청 보기";
  if (type === "install_transfer") return "설치건 보기";
  if (type === "ticket_revision") return "수정 요청 보기";
  return "알림 보기";
}

export default function RealtimeNotification({ userId }: Props) {
  const [modal, setModal] = useState<{
    title: string;
    body?: string;
    href?: string;
    actionLabel: string;
  } | null>(null);
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
      const popups: { title: string; body?: string; href?: string; actionLabel: string }[] = [];
      for (const row of data) {
        if ((row.type as string)?.startsWith("schedule_")) {
          hasScheduleNotice = true;
          continue;
        }
        const type = (row.type as string | null) ?? null;
        // 공지는 읽고 닫으면 끝이라 이동할 곳을 두지 않는다(버튼도 "확인"이 된다).
        const href =
          type === "notice"
            ? undefined
            : row.installation_id
              ? `/installs?id=${row.installation_id}`
              : row.franchise_application_id
                ? `/franchise?id=${row.franchise_application_id}`
                : row.ticket_id
                  ? `/tickets/${row.ticket_id}`
                  : "/notifications";
        popups.push({
          title: row.title,
          body: row.body ?? undefined,
          href,
          actionLabel: actionLabelFor(type, href),
        });
      }
      // 폴링 한 번에 여러 건이 오면 마지막 것만 남지 않도록, 2건 이상이면 묶음 모달 하나로 안내한다.
      if (popups.length === 1) {
        setModal(popups[0]);
      } else if (popups.length > 1) {
        setModal({
          title: `새 알림 ${popups.length}건`,
          body: `${popups[0].title} 외 ${popups.length - 1}건`,
          href: "/notifications",
          actionLabel: "알림 보기",
        });
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setModal(null)}
          />
          <div className="relative flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="bg-blue-600 px-5 py-4 flex flex-shrink-0 items-center gap-3">
              <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                <Bell size={18} className="text-white" />
              </div>
              <p className="text-white font-bold text-sm flex-1">새 알림</p>
              <button onClick={() => setModal(null)} className="text-white/70 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <p className="text-slate-900 font-bold text-base mb-1">{modal.title}</p>
              {/* 공지처럼 긴 글도 줄바꿈 그대로 보이고, 넘치면 이 영역만 스크롤된다. */}
              {modal.body && (
                <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {modal.body}
                </p>
              )}
            </div>
            <div className="flex-shrink-0 px-5 pb-5">
              <button
                onClick={() => {
                  const href = modal.href;
                  setModal(null);
                  if (href) router.push(href);
                }}
                className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
              >
                {modal.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
