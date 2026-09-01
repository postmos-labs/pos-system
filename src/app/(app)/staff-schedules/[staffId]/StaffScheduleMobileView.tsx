"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, MapPin, Plus, X } from "lucide-react";
import { kstToday } from "@/lib/date";
import { useToast } from "@/components/ui/Toast";
import { createStaffSchedule } from "../actions";
import {
  CATEGORY_COLOR,
  toDatePart,
  toTimePart,
  type StaffScheduleRow,
} from "../StaffSchedulesClient";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const CATEGORIES = ["미팅", "회의", "교육", "외출", "휴가", "기타"];
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "10", "20", "30", "40", "50"];
const selectClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-base outline-none focus:border-blue-400";

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
  const toast = useToast();
  const [year, monthNum] = month.split("-").map(Number);
  const today = kstToday();

  // 이 화면에서 바로 일정을 넣을 수 있게 한다. 등록하면 이 페이지의 주인이 참석자로 들어가
  // 그대로 목록에 나타난다(등록자는 지금 로그인한 사람).
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: "미팅",
    date: today,
    startHour: "09",
    startMin: "00",
    endHour: "10",
    endMin: "00",
    allDay: false,
    location: "",
    memo: "",
  });

  function openForm() {
    setForm({
      title: "",
      category: "미팅",
      date: today.slice(0, 7) === month ? today : `${month}-01`,
      startHour: "09",
      startMin: "00",
      endHour: "10",
      endMin: "00",
      allDay: false,
      location: "",
      memo: "",
    });
    setFormOpen(true);
  }

  async function submit() {
    if (!form.title.trim()) {
      toast.error("제목을 입력해주세요.");
      return;
    }
    const start = `${form.startHour}:${form.startMin}`;
    const end = `${form.endHour}:${form.endMin}`;
    if (!form.allDay && end < start) {
      toast.error("종료 시각은 시작 시각보다 빠를 수 없습니다.");
      return;
    }
    setSaving(true);
    const result = await createStaffSchedule({
      title: form.title.trim(),
      category: form.category,
      startsAt: form.allDay ? `${form.date}T00:00:00+09:00` : `${form.date}T${start}:00+09:00`,
      endsAt: form.allDay ? `${form.date}T23:59:00+09:00` : `${form.date}T${end}:00+09:00`,
      allDay: form.allDay,
      location: form.location.trim() || null,
      memo: form.memo.trim() || null,
      participantIds: [staff.id],
    });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("일정을 등록했습니다.");
    setFormOpen(false);
    router.refresh();
  }

  function shiftMonth(delta: number) {
    const date = new Date(Date.UTC(year, monthNum - 1 + delta, 1));
    const nextMonth = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    // slug는 주소에서 온 값이라 이미 인코딩돼 있을 수 있다. 한 번 풀었다가 넣어
    // 주소창에 %EB%B0%95... 대신 한글이 그대로 남게 한다.
    router.replace(`/staff-schedules/${decodeURIComponent(slug)}?month=${nextMonth}`);
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

      {/* 폰에서 엄지로 닿는 자리에 등록 버튼을 띄운다. 하단 메뉴에 가리지 않게 위로 올린다. */}
      <button
        type="button"
        onClick={openForm}
        className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-blue-600 px-5 py-3 text-[15px] font-bold text-white shadow-lg active:bg-blue-700"
      >
        <Plus size={18} /> 일정 등록
      </button>

      {formOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white sm:rounded-2xl">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
              <p className="text-base font-bold text-slate-900">
                {staff.name ?? "이름 미상"}님 일정 등록
              </p>
              <button type="button" onClick={() => setFormOpen(false)} aria-label="닫기">
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-600">제목 *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="일정 제목"
                  className={selectClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-600">구분</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                    className={selectClass}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-600">날짜</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                    className={selectClass}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-[15px] text-slate-700">
                <input
                  type="checkbox"
                  checked={form.allDay}
                  onChange={(e) => setForm((p) => ({ ...p, allDay: e.target.checked }))}
                  className="size-5 accent-blue-600"
                />
                종일
              </label>

              {!form.allDay && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-600">시작</label>
                    <div className="flex gap-1.5">
                      <select
                        value={form.startHour}
                        onChange={(e) => setForm((p) => ({ ...p, startHour: e.target.value }))}
                        className={selectClass}
                      >
                        {HOURS.map((h) => (
                          <option key={h} value={h}>{`${h}시`}</option>
                        ))}
                      </select>
                      <select
                        value={form.startMin}
                        onChange={(e) => setForm((p) => ({ ...p, startMin: e.target.value }))}
                        className={selectClass}
                      >
                        {MINUTES.map((m) => (
                          <option key={m} value={m}>{`${m}분`}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-600">종료</label>
                    <div className="flex gap-1.5">
                      <select
                        value={form.endHour}
                        onChange={(e) => setForm((p) => ({ ...p, endHour: e.target.value }))}
                        className={selectClass}
                      >
                        {HOURS.map((h) => (
                          <option key={h} value={h}>{`${h}시`}</option>
                        ))}
                      </select>
                      <select
                        value={form.endMin}
                        onChange={(e) => setForm((p) => ({ ...p, endMin: e.target.value }))}
                        className={selectClass}
                      >
                        {MINUTES.map((m) => (
                          <option key={m} value={m}>{`${m}분`}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-600">장소</label>
                <input
                  value={form.location}
                  onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                  placeholder="선택"
                  className={selectClass}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-600">메모</label>
                <textarea
                  value={form.memo}
                  onChange={(e) => setForm((p) => ({ ...p, memo: e.target.value }))}
                  rows={3}
                  placeholder="선택"
                  className={`${selectClass} resize-none`}
                />
              </div>
            </div>

            <div className="flex flex-shrink-0 gap-2 border-t border-slate-100 px-5 py-3 pb-6">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-[15px] font-semibold text-slate-600"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={saving || !form.title.trim()}
                className="flex-[2] rounded-xl bg-blue-600 py-3 text-[15px] font-bold text-white disabled:opacity-50"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

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
