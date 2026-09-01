"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  CATEGORY_COLOR,
  toDatePart,
  toTimePart,
  type StaffScheduleRow,
} from "../StaffSchedulesClient";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

interface StaffInfo {
  id: string;
  name: string | null;
  position: string | null;
}

interface Props {
  staff: StaffInfo;
  schedules: StaffScheduleRow[];
  month: string;
}

// CATEGORY_COLOR는 "bg-xxx text-xxx border-xxx" 형태다. 카드 왼쪽 구분 막대에는
// 배경·글자색 없이 테두리 색만 필요해 그 토큰만 뽑아 쓴다.
function borderClass(category: string) {
  const cls = CATEGORY_COLOR[category] ?? CATEGORY_COLOR["기타"];
  return cls.split(" ").find((c) => c.startsWith("border-")) ?? "border-slate-200";
}

export default function StaffScheduleMobileView({ staff, schedules, month }: Props) {
  const router = useRouter();
  const [year, monthNum] = month.split("-").map(Number);

  function shiftMonth(delta: number) {
    const date = new Date(Date.UTC(year, monthNum - 1 + delta, 1));
    const nextMonth = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    router.replace(`/staff-schedules/${staff.id}?month=${nextMonth}`);
  }

  const groups = useMemo(() => {
    const map: Record<string, StaffScheduleRow[]> = {};
    for (const schedule of schedules) {
      const date = toDatePart(schedule.starts_at);
      if (!map[date]) map[date] = [];
      map[date].push(schedule);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [schedules]);

  const heading = `${staff.name ?? "이름 미상"}${staff.position ? ` ${staff.position}님` : "님"} ${monthNum}월 일정`;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{heading}</h1>
        <p className="mt-0.5 text-xs text-slate-400">{year}년</p>
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="rounded-lg p-1.5 hover:bg-slate-100 transition-colors"
        >
          <ChevronLeft size={18} className="text-slate-500" />
        </button>
        <span className="text-sm font-semibold text-slate-700">
          {year}년 {monthNum}월
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="rounded-lg p-1.5 hover:bg-slate-100 transition-colors"
        >
          <ChevronRight size={18} className="text-slate-500" />
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-400">이번 달 일정이 없습니다</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(([date, events]) => {
            const dow = new Date(`${date}T00:00:00+09:00`).getDay();
            const dayLabel = `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 (${DAYS[dow]})`;
            return (
              <div key={date} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p
                  className={`mb-3 text-sm font-bold ${
                    dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-slate-700"
                  }`}
                >
                  {dayLabel}
                </p>
                <div className="flex flex-col gap-3">
                  {events.map((ev) => (
                    <div
                      key={ev.id}
                      className={`rounded-r-lg border-l-4 py-1 pl-3 ${borderClass(ev.category)}`}
                    >
                      <span
                        className={`mb-1 inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          CATEGORY_COLOR[ev.category] ?? CATEGORY_COLOR["기타"]
                        }`}
                      >
                        {ev.category}
                      </span>
                      <p className="text-lg font-bold text-slate-900">
                        {ev.all_day
                          ? "종일"
                          : `${toTimePart(ev.starts_at)} ~ ${toTimePart(ev.ends_at)}`}
                      </p>
                      <p className="text-base font-medium text-slate-700">{ev.title}</p>
                      {ev.location && (
                        <p className="mt-0.5 text-xs text-slate-400">장소: {ev.location}</p>
                      )}
                      {ev.memo && <p className="text-xs text-slate-400">메모: {ev.memo}</p>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
