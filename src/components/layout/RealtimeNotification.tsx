"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import { Bell, X, MessageCircle } from "lucide-react";

interface Props {
  userId: string;
  initialCount: number;
}

interface Toast {
  id: number;
  title: string;
  body?: string;
  type: "dm" | "notification";
  href?: string;
}

let toastId = 0;

export default function RealtimeNotification({ userId }: Props) {
  const [modal, setModal] = useState<{ title: string; body?: string; href?: string } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);

  function playSound() {
    try {
      const audioWindow = window as Window &
        typeof globalThis & { webkitAudioContext?: typeof AudioContext };
      const AudioContextConstructor = window.AudioContext || audioWindow.webkitAudioContext;
      if (!AudioContextConstructor) return;
      const ctx = new AudioContextConstructor();
      const times = [0, 0.15, 0.3];
      times.forEach((t) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime + t);
        osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + t + 0.1);
        gain.gain.setValueAtTime(0.3, ctx.currentTime + t);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + 0.15);
      });
    } catch {}
  }

  function addToast(toast: Omit<Toast, "id">) {
    const id = ++toastId;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }

  function removeToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  useEffect(() => {
    const channel = supabase
      .channel("notifications-" + userId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const isScheduleNotice = (payload.new.type as string)?.startsWith("schedule_");
          if (isScheduleNotice) {
            router.refresh();
            return;
          }
          const href = payload.new.installation_id
            ? `/installs?id=${payload.new.installation_id}`
            : payload.new.franchise_application_id
              ? `/franchise?id=${payload.new.franchise_application_id}`
              : payload.new.ticket_id
                ? `/tickets/${payload.new.ticket_id}`
                : "/notifications";
          setModal({ title: payload.new.title, body: payload.new.body, href });
          playSound();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, supabase, userId]);

  useEffect(() => {
    const channel = supabase
      .channel("dm-notify-" + userId)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages" },
        async (payload) => {
          const msg = payload.new;
          if (msg.user_id === userId) return;

          const { data: room } = await supabase
            .from("dm_rooms")
            .select("user1_id, user2_id")
            .eq("id", msg.room_id)
            .single();

          if (!room) return;
          const isMyRoom = room.user1_id === userId || room.user2_id === userId;
          if (!isMyRoom) return;

          if (pathname === `/chat/dm/${msg.room_id}`) return;

          const { data: sender } = await supabase
            .from("profiles")
            .select("name")
            .eq("id", msg.user_id)
            .single();

          playSound();
          addToast({
            type: "dm",
            title: sender?.name ?? "메시지",
            body: msg.content,
            href: `/chat/dm/${msg.room_id}`,
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [pathname, supabase, userId]);

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

      {}
      <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 md:bottom-6">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-96 overflow-hidden flex items-stretch animate-in slide-in-from-right duration-200"
          >
            <div className="bg-[#3e6d9c] w-1.5 flex-shrink-0" />
            <div className="flex items-start gap-4 px-4 py-4 flex-1">
              <div className="w-11 h-11 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <MessageCircle size={20} className="text-blue-600" />
              </div>
              <button
                className="flex-1 text-left"
                onClick={() => {
                  router.push(toast.href!);
                  removeToast(toast.id);
                }}
              >
                <p className="text-base font-bold text-slate-900">{toast.title}</p>
                <p className="text-sm text-slate-500 mt-1 line-clamp-2">{toast.body}</p>
              </button>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-slate-300 hover:text-slate-500 flex-shrink-0 mt-0.5"
              >
                <X size={17} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
