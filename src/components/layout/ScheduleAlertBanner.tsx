"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, X } from "lucide-react";
import { kstToday } from "@/lib/date";

interface ScheduleAlert {
  ticketId: string;
  label: string;
  date: string;
  name: string;
}

const DISMISS_KEY = "schedule_alert_dismissed";
const RECHECK_INTERVAL = 2 * 60 * 60 * 1000;

function todayStr() {
  return kstToday();
}

function daysUntil(date: string) {
  const diff =
    new Date(date + "T00:00:00").getTime() - new Date(todayStr() + "T00:00:00").getTime();
  return Math.round(diff / 86400000);
}

function dDayLabel(n: number) {
  if (n === 0) return "D-DAY";
  return `D-${n}`;
}

function alertKey(a: ScheduleAlert) {
  return `${a.ticketId}_${a.label}_${a.date}`;
}

function readDismissed(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export default function ScheduleAlertBanner({ alerts }: { alerts: ScheduleAlert[] }) {
  const router = useRouter();
  const [visible, setVisible] = useState<ScheduleAlert[]>([]);

  function recompute() {
    const dismissed = readDismissed();
    const now = Date.now();
    const filtered = alerts.filter((a) => {
      const until = dismissed[alertKey(a)];
      return !until || until <= now;
    });
    setVisible(filtered.sort((a, b) => a.date.localeCompare(b.date)));
  }

  useEffect(() => {
    recompute();
    const timer = setInterval(recompute, RECHECK_INTERVAL);
    return () => clearInterval(timer);
  }, [alerts]);

  function dismiss(a: ScheduleAlert) {
    const dismissed = readDismissed();
    dismissed[alertKey(a)] = Date.now() + RECHECK_INTERVAL;
    localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissed));
    setVisible((prev) => prev.filter((v) => v !== a));
  }

  function dismissAll() {
    const dismissed = readDismissed();
    const until = Date.now() + RECHECK_INTERVAL;
    visible.forEach((a) => {
      dismissed[alertKey(a)] = until;
    });
    localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissed));
    setVisible([]);
  }

  if (visible.length === 0) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4">
      <div className="bg-amber-50 border border-amber-300 rounded-2xl shadow-lg overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-100 border-b border-amber-200">
          <CalendarClock size={15} className="text-amber-700" />
          <p className="text-xs font-bold text-amber-800 flex-1">
            다가오는 일정 {visible.length}건
          </p>
          <button onClick={dismissAll} className="text-amber-600 hover:text-amber-800">
            <X size={15} />
          </button>
        </div>
        <div className="max-h-60 overflow-y-auto divide-y divide-amber-100">
          {visible.map((a, i) => {
            const n = daysUntil(a.date);
            return (
              <div
                key={`${a.ticketId}_${a.label}_${a.date}_${i}`}
                onClick={() => router.push(`/tickets/${a.ticketId}`)}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-amber-50 cursor-pointer transition-colors"
              >
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                    n <= 0
                      ? "bg-red-500 text-white"
                      : n === 1
                        ? "bg-orange-500 text-white"
                        : "bg-amber-200 text-amber-800"
                  }`}
                >
                  {dDayLabel(n)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate" title={a.name}>
                    {a.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {a.label} · {a.date.slice(5).replace("-", "/")}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    dismiss(a);
                  }}
                  className="text-slate-300 hover:text-slate-500 flex-shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
