"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { kstToday } from "@/lib/date";
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
  // 주소에 쓰인 값(이름 또는 id). 월을 넘겨도 들어온 형태를 그대로 유지한다.
  slug: string;
}

// CATEGORY_COLOR는 "bg-xxx text-xxx border-xxx" 형태다. 카드 왼쪽 구분 막대에는
// 배경·글자색 없이 테두리 색만 필요해 그 토큰만 뽑아 쓴다.
function borderClass(category: string) {
  const cls = CATEGORY_COLOR[category] ?? CATEGORY_COLOR["기타"];
  return cls.split(" ").find((c) => c.startsWith("border-")) ?? "border-slate-200";
}

export default function StaffScheduleMobileView({ staff, schedules, month, slug }: Props) {
  const router = useRouter();
  const [year, monthNum] = month.split("-").map(Number);
  const today = kstToday();

  function shiftMonth(delta: number) {
    const date = new Date(Date.UTC(year, monthNum - 1 + delta, 1));
    const nextMonth = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    router.replace(`/staff-schedules/${slug}?month=${nextMonth}`);
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

  const todayCount = groups.find(([date]) => date === today)?.[1].length ?? 0;
  const isThisMonth = today.slice(0, 7) === month;

  const heading = `${staff.name ?? "이름 미상"}${staff.position ? ` ${staff.position}님` : "님"}`;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-5 pb-24">
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          {heading} {monthNum}월 일정
        </h1>
        {/* 폰으로 열자마자 "오늘 뭐 있지"에 답이 되도록 요약을 먼저 보여준다. */}
        <p className="mt-1 text-sm text-slate-500">
          {isThisMonth ? (
            todayCount > 0 ? (
              <>
                오늘 <span className="font-bold text-blue-600">{todayCount}건</span> · 이번 달{" "}
                {schedules.length}건
              </>
            ) : (
              <>오늘은 일정이 없습니다 · 이번 달 {schedules.length}건</>
            )
          ) : (
            <>
              {year}년 {monthNum}월 · {schedules.length}건
            </>
          )}
        </p>
      </div>

      {/* 월 이동 — 손가락으로 누르기 좋게 버튼을 크게 잡는다. */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-2 py-1.5">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="이전 달"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors active:bg-slate-100"
        >
          <ChevronLeft size={22} />
        </button>
        <span className="text-base font-bold text-slate-800">
          {year}년 {monthNum}월
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="다음 달"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors active:bg-slate-100"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-400">이번 달 일정이 없습니다</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(([date, events]) => {
            const dow = new Date(`${date}T00:00:00+09:00`).getDay();
            const dayLabel = `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 (${DAYS[dow]})`;
            const isToday = date === today;
            // 이미 지난 날은 흐리게 둬서 앞으로의 일정이 먼저 눈에 들어오게 한다.
            const isPast = date < today;
            return (
              <div
                key={date}
                className={`rounded-2xl border bg-white p-4 ${
                  isToday ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200"
                } ${isPast ? "opacity-60" : ""}`}
              >
                <p className="mb-3 flex items-center gap-2">
                  <span
                    className={`text-[15px] font-bold ${
                      isToday
                        ? "text-blue-700"
                        : dow === 0
                          ? "text-red-500"
                          : dow === 6
                            ? "text-blue-500"
                            : "text-slate-700"
                    }`}
                  >
                    {dayLabel}
                  </span>
                  {isToday && (
                    <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">
                      오늘
                    </span>
                  )}
                </p>
                <div className="flex flex-col gap-3">
                  {events.map((ev) => (
                    <div
                      key={ev.id}
                      className={`rounded-r-lg border-l-4 py-1 pl-3 ${borderClass(ev.category)}`}
                    >
                      <span
                        className={`mb-1 inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          CATEGORY_COLOR[ev.category] ?? CATEGORY_COLOR["기타"]
                        }`}
                      >
                        {ev.category}
                      </span>
                      <p className="text-[22px] leading-tight font-extrabold text-slate-900 tabular-nums">
                        {ev.all_day
                          ? "종일"
                          : `${toTimePart(ev.starts_at)} ~ ${toTimePart(ev.ends_at)}`}
                      </p>
                      <p className="mt-0.5 text-[17px] leading-snug font-semibold text-slate-800">
                        {ev.title}
                      </p>
                      {ev.location && (
                        <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                          <MapPin size={13} className="shrink-0" />
                          {ev.location}
                        </p>
                      )}
                      {ev.memo && (
                        <p className="mt-0.5 text-sm leading-snug text-slate-500">{ev.memo}</p>
                      )}
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
