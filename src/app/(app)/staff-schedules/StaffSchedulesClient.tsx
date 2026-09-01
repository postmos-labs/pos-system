"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, X, Trash2, Pencil, ImageDown, Link2 } from "lucide-react";
import { AppSelect } from "@/components/ui/AppSelect";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { useToast } from "@/components/ui/Toast";
import { createStaffSchedule, updateStaffSchedule, deleteStaffSchedule } from "./actions";

// 시각은 24시간제로 고른다. <input type="time">은 브라우저 언어에 따라 "오후 2:00"으로 보여서
// 직원마다 다르게 표시되고, 모달 안에서 기본 시계 UI가 잘리는 문제도 있다.
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const value = String(i).padStart(2, "0");
  return { value, label: `${value}시` };
});
const MINUTE_VALUES = ["00", "10", "20", "30", "40", "50"];
// 예전에 다른 방식으로 저장돼 목록에 없는 분(예: 15분)이면 그 값을 끼워 넣는다.
// 그러지 않으면 수정 창에서 분이 빈칸으로 보인다.
function minuteOptions(current: string) {
  const values = MINUTE_VALUES.includes(current)
    ? MINUTE_VALUES
    : [...MINUTE_VALUES, current].sort();
  return values.map((value) => ({ value, label: `${value}분` }));
}

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

const CATEGORIES = ["미팅", "회의", "교육", "외출", "휴가", "기타"] as const;

export const CATEGORY_COLOR: Record<string, string> = {
  미팅: "bg-blue-50 text-blue-700 border-blue-200",
  회의: "bg-violet-50 text-violet-700 border-violet-200",
  교육: "bg-emerald-50 text-emerald-700 border-emerald-200",
  외출: "bg-amber-50 text-amber-700 border-amber-200",
  휴가: "bg-rose-50 text-rose-700 border-rose-200",
  기타: "bg-slate-50 text-slate-700 border-slate-200",
};

// 캔버스에 그릴 때 쓰는 색. Tailwind 클래스는 캔버스에서 해석되지 않으므로
// CATEGORY_COLOR와 같은 색을 hex로 따로 둔다.
const CATEGORY_HEX: Record<string, { bg: string; border: string; text: string }> = {
  미팅: { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" },
  회의: { bg: "#f5f3ff", border: "#ddd6fe", text: "#6d28d9" },
  교육: { bg: "#ecfdf5", border: "#a7f3d0", text: "#047857" },
  외출: { bg: "#fffbeb", border: "#fde68a", text: "#b45309" },
  휴가: { bg: "#fff1f2", border: "#fecdd3", text: "#be123c" },
  기타: { bg: "#f8fafc", border: "#e2e8f0", text: "#334155" },
};

export interface StaffScheduleParticipant {
  userId: string;
  name: string | null;
}

export interface StaffScheduleRow {
  id: string;
  title: string;
  category: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  memo: string | null;
  created_by: string | null;
  created_by_name: string | null;
  participants: StaffScheduleParticipant[];
}

// 일정이 누구 것인지 한 줄로 만든다. 등록자 + 참석자를 합쳐 중복을 없애고,
// 여럿이면 "박은서 외 2"처럼 줄인다. 전체 보기에서 칩에 붙인다.
export function ownerLabel(schedule: {
  created_by_name: string | null;
  participants: { name: string | null }[];
}): string {
  const names = Array.from(
    new Set(
      [schedule.created_by_name, ...schedule.participants.map((p) => p.name)].filter(
        (n): n is string => !!n && n.trim().length > 0,
      ),
    ),
  );
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names[0]} 외 ${names.length - 1}`;
}

export interface StaffMember {
  id: string;
  name: string | null;
  position?: string | null;
}

interface CurrentUser {
  id: string;
  name: string | null;
  role: string | null;
}

interface FormState {
  id: string | null;
  title: string;
  category: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string;
  memo: string;
  participantIds: string[];
}

function emptyForm(date: string): FormState {
  return {
    id: null,
    title: "",
    category: CATEGORIES[0],
    date,
    startTime: "09:00",
    endTime: "10:00",
    allDay: false,
    location: "",
    memo: "",
    participantIds: [],
  };
}

// starts_at/ends_at은 Supabase가 UTC 문자열로 돌려준다. 그대로 잘라 쓰면 한국시각보다
// 9시간 이르게 보이므로(14:00 -> 05:00), 항상 Asia/Seoul로 변환해서 날짜·시각을 뽑는다.
const KST_DATE_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });
const KST_TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function toDatePart(iso: string) {
  return KST_DATE_FMT.format(new Date(iso));
}

export function toTimePart(iso: string) {
  return KST_TIME_FMT.format(new Date(iso));
}

interface Props {
  schedules: StaffScheduleRow[];
  staffList: StaffMember[];
  month: string;
  category: string;
  initialMine: boolean;
  initialStaff: string;
  schemaReady: boolean;
  currentUser: CurrentUser;
}

export default function StaffSchedulesClient({
  schedules,
  staffList,
  month,
  category,
  initialMine,
  initialStaff,
  schemaReady,
  currentUser,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailSchedule, setDetailSchedule] = useState<StaffScheduleRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(`${month}-01`));
  const [participantSearch, setParticipantSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = currentUser.role === "admin" || currentUser.role === "master";

  // 직원 선택과 "내 일정만"은 화면 안에서 처리한다. 주소만 바꾸면 화면이 갱신되지 않아
  // 버튼이 눌린 채로 남는 경우가 있었다. 둘은 함께 걸면 대개 빈 화면이 되므로 서로 배타적으로 둔다.
  const [staff, setStaff] = useState(initialStaff);
  const [mine, setMine] = useState(initialMine);
  function selectStaff(next: string) {
    setStaff(next);
    if (next) setMine(false);
  }
  function toggleMine() {
    setMine((prev) => {
      const next = !prev;
      if (next) setStaff("");
      return next;
    });
  }

  // 오른쪽 목록의 건수는 필터를 걸기 전 목록으로 센다. 필터 후에 세면 고른 직원 말고는 0이 된다.
  const totalCount = schedules.length;
  const staffCounts: Record<string, number> = {};
  for (const member of staffList) {
    staffCounts[member.id] = schedules.filter(
      (row) => row.created_by === member.id || row.participants.some((p) => p.userId === member.id),
    ).length;
  }
  const visibleSchedules = schedules.filter((row) => {
    if (
      mine &&
      !(
        row.created_by === currentUser.id ||
        row.participants.some((p) => p.userId === currentUser.id)
      )
    )
      return false;
    if (staff && !(row.created_by === staff || row.participants.some((p) => p.userId === staff)))
      return false;
    return true;
  });
  const [year, monthNum] = month.split("-").map(Number);

  // 달과 구분만 주소로 관리한다(조회 조건이라 서버를 다시 다녀와야 한다).
  function updateQuery(next: { month?: string; category?: string }) {
    const nextMonth = next.month ?? month;
    const nextCategory = next.category ?? category;
    const params = new URLSearchParams();
    params.set("month", nextMonth);
    if (nextCategory) params.set("category", nextCategory);
    router.replace(`/staff-schedules?${params.toString()}`);
  }

  function shiftMonth(delta: number) {
    const date = new Date(Date.UTC(year, monthNum - 1 + delta, 1));
    const nextMonth = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    updateQuery({ month: nextMonth });
    setSelectedDate(null);
  }

  const eventsByDate = useMemo(() => {
    const map: Record<string, StaffScheduleRow[]> = {};
    for (const schedule of visibleSchedules) {
      const date = toDatePart(schedule.starts_at);
      if (!map[date]) map[date] = [];
      map[date].push(schedule);
    }
    return map;
  }, [visibleSchedules]);

  const firstDay = new Date(year, monthNum - 1, 1).getDay();
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // 화면을 그대로 캡처하는 라이브러리는 Tailwind 4의 oklch 색을 해석하지 못해 깨진다.
  // 그래서 달력을 캔버스에 직접 그려 이미지를 만든다.
  async function copyAsImage() {
    const CELL_W = 260;
    // 그 달에 하루 최대 몇 건인지 보고 칸 높이를 정한다. 일정이 적은 달은 칸을 키워
    // 글씨를 크게 뽑고, 많은 달은 지금 크기를 유지해 넘치지 않게 한다.
    const busiest = Math.max(1, ...Object.values(eventsByDate).map((list) => list.length));
    const MAX_CHIPS = Math.max(4, Math.min(busiest, 6));
    const CHIP_H = busiest <= 1 ? 60 : busiest === 2 ? 46 : busiest === 3 ? 38 : 30;
    const CHIP_FONT = busiest <= 1 ? 26 : busiest === 2 ? 21 : busiest === 3 ? 18 : 15;
    const CELL_H = 46 + MAX_CHIPS * (CHIP_H + 5) + 8;
    const PAD = 36;
    const HEAD = 110;
    const DAY_H = 44;
    const rows = cells.length / 7;
    const width = PAD * 2 + CELL_W * 7;
    const height = PAD * 2 + HEAD + DAY_H + CELL_H * rows;

    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast.error("이미지를 만들지 못했습니다.");
      return;
    }
    ctx.scale(scale, scale);
    const font = (size: number, weight = "400") =>
      `${weight} ${size}px "Pretendard", "Malgun Gothic", sans-serif`;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // 제목 — 특정 직원을 골라 뽑았으면 "박은서 대표님 9월 일정"처럼 그 사람 이름을 앞에 세운다.
    // 그래야 받는 사람이 전체 일정으로 오해하지 않는다.
    const selected = staff ? staffList.find((m) => m.id === staff) : undefined;
    const owner = selected
      ? `${selected.name}${selected.position ? ` ${selected.position}님` : "님"}`
      : "";
    const heading = owner ? `${owner} ${monthNum}월 일정` : `${year}년 ${monthNum}월 일정`;
    ctx.fillStyle = "#0f172a";
    ctx.font = font(38, "800");
    ctx.fillText(heading, PAD, PAD + 36);

    // 부제 — 연도(제목에서 빠졌을 때)와 걸어둔 구분을 적는다.
    const subParts = [owner ? `${year}년` : "", category].filter(Boolean);
    if (subParts.length) {
      ctx.fillStyle = "#64748b";
      ctx.font = font(19);
      ctx.fillText(subParts.join(" · "), PAD, PAD + 70);
    }

    const gridTop = PAD + HEAD;
    // 요일 머리글 — 옅은 띠를 깔아 본문과 구분한다.
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(PAD, gridTop, CELL_W * 7, DAY_H);
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i === 0 ? "#ef4444" : i === 6 ? "#3b82f6" : "#475569";
      ctx.font = font(19, "700");
      ctx.textAlign = "center";
      ctx.fillText(DAYS[i], PAD + CELL_W * i + CELL_W / 2, gridTop + 29);
    }
    ctx.textAlign = "left";

    const bodyTop = gridTop + DAY_H;
    for (let idx = 0; idx < cells.length; idx++) {
      const col = idx % 7;
      const row = Math.floor(idx / 7);
      const x = PAD + col * CELL_W;
      const y = bodyTop + row * CELL_H;
      const day = cells[idx];

      // 칸 바탕 — 주말은 옅게 깔아 주중과 구분한다.
      ctx.fillStyle = !day ? "#f8fafc" : col === 0 || col === 6 ? "#fbfcfe" : "#ffffff";
      ctx.fillRect(x, y, CELL_W, CELL_H);
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, CELL_W - 1, CELL_H - 1);

      if (!day) continue;

      ctx.fillStyle = col === 0 ? "#dc2626" : col === 6 ? "#2563eb" : "#0f172a";
      ctx.font = font(19, "700");
      ctx.fillText(String(day), x + 13, y + 28);

      const events = eventsByDate[dateStr(day)] ?? [];
      events.slice(0, MAX_CHIPS).forEach((ev, i) => {
        const tone = CATEGORY_HEX[ev.category] ?? CATEGORY_HEX["기타"];
        const cy = y + 40 + i * (CHIP_H + 5);
        const cx = x + 10;
        const cw = CELL_W - 20;
        // 칩 — 왼쪽에 구분 색 막대를 세워 종류가 한눈에 들어오게 한다.
        ctx.fillStyle = tone.bg;
        ctx.fillRect(cx, cy, cw, CHIP_H);
        ctx.strokeStyle = tone.border;
        ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, CHIP_H - 1);
        ctx.fillStyle = tone.text;
        ctx.fillRect(cx, cy, 5, CHIP_H);

        const timeLabel = ev.all_day ? "종일" : toTimePart(ev.starts_at);
        const pad = 14;
        // 칩이 커지면 시간과 제목을 두 줄로 나눠 각각 더 크게 보여준다.
        // 전체 보기에서는 누구 일정인지 함께 적는다(직원을 골라 뽑았으면 제목에 이미 있다).
        const who = staff ? "" : ownerLabel(ev);
        if (CHIP_H >= 46) {
          ctx.font = font(CHIP_FONT, "800");
          ctx.fillText(who ? `${who} · ${timeLabel}` : timeLabel, cx + pad, cy + CHIP_H / 2 - 2);
          ctx.font = font(CHIP_FONT - 3, "500");
          let text = ev.title;
          const maxW = cw - pad * 2;
          if (ctx.measureText(text).width > maxW) {
            while (text.length > 1 && ctx.measureText(text + "…").width > maxW) {
              text = text.slice(0, -1);
            }
            text += "…";
          }
          ctx.fillText(text, cx + pad, cy + CHIP_H - 12);
          return;
        }

        const leadLabel = who ? `${who} ${timeLabel}` : timeLabel;
        ctx.font = font(CHIP_FONT, "800");
        const timeW = ctx.measureText(leadLabel).width;
        ctx.fillText(leadLabel, cx + pad, cy + CHIP_H / 2 + CHIP_FONT / 3);

        ctx.font = font(CHIP_FONT, "500");
        const titleX = cx + pad + timeW + 7;
        const maxW = cx + cw - 10 - titleX;
        let text = ev.title;
        if (ctx.measureText(text).width > maxW) {
          while (text.length > 1 && ctx.measureText(text + "…").width > maxW) {
            text = text.slice(0, -1);
          }
          text += "…";
        }
        ctx.fillText(text, titleX, cy + CHIP_H / 2 + CHIP_FONT / 3);
      });
      if (events.length > MAX_CHIPS) {
        ctx.fillStyle = "#64748b";
        ctx.font = font(15, "700");
        ctx.fillText(
          `+${events.length - MAX_CHIPS}건`,
          x + 13,
          y + 40 + MAX_CHIPS * (CHIP_H + 5) + 15,
        );
      }
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      toast.error("이미지를 만들지 못했습니다.");
      return;
    }

    // 클립보드 이미지 복사는 브라우저·보안 설정에 따라 막힐 수 있다. 그때는 파일로 내려받게 한다.
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("달력 이미지를 복사했습니다. 붙여넣기(Ctrl+V) 하세요.");
    } catch {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${owner ? `${owner}_` : "일정캘린더_"}${year}-${String(monthNum).padStart(2, "0")}.png`;
      link.click();
      URL.revokeObjectURL(url);
      toast.warning("복사가 막혀 있어 이미지 파일로 내려받았습니다.");
    }
  }

  function dateStr(day: number) {
    return `${year}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function openCreateForm(date: string) {
    setForm(emptyForm(date));
    setParticipantSearch("");
    setDetailSchedule(null);
    setFormOpen(true);
  }

  function openEditForm(schedule: StaffScheduleRow) {
    setForm({
      id: schedule.id,
      title: schedule.title,
      category: schedule.category,
      date: toDatePart(schedule.starts_at),
      startTime: schedule.all_day ? "09:00" : toTimePart(schedule.starts_at),
      endTime: schedule.all_day ? "18:00" : toTimePart(schedule.ends_at),
      allDay: schedule.all_day,
      location: schedule.location ?? "",
      memo: schedule.memo ?? "",
      participantIds: schedule.participants.map((p) => p.userId),
    });
    setParticipantSearch("");
    setDetailSchedule(null);
    setFormOpen(true);
  }

  function toggleParticipant(id: string) {
    setForm((prev) => ({
      ...prev,
      participantIds: prev.participantIds.includes(id)
        ? prev.participantIds.filter((pid) => pid !== id)
        : [...prev.participantIds, id],
    }));
  }

  async function handleSubmit() {
    if (!form.title.trim()) {
      toast.error("제목을 입력해주세요.");
      return;
    }
    // 종료 시각은 따로 받지 않는다. DB가 종료를 요구하므로 시작 한 시간 뒤로 채우고,
    // 자정을 넘기면 그날 23:59로 맞춰 종료가 시작보다 빨라지지 않게 한다.
    const startMinutes =
      Number(form.startTime.slice(0, 2)) * 60 + Number(form.startTime.slice(3, 5));
    const endMinutes = startMinutes + 60;
    const computedEnd = `${String(Math.floor(endMinutes / 60) % 24).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
    const safeEnd = computedEnd < form.startTime ? "23:59" : computedEnd;
    const startsAt = form.allDay
      ? `${form.date}T00:00:00+09:00`
      : `${form.date}T${form.startTime}:00+09:00`;
    const endsAt = form.allDay ? `${form.date}T23:59:00+09:00` : `${form.date}T${safeEnd}:00+09:00`;

    setSubmitting(true);
    const input = {
      title: form.title.trim(),
      category: form.category,
      startsAt,
      endsAt,
      allDay: form.allDay,
      location: form.location.trim() || null,
      memo: form.memo.trim() || null,
      participantIds: form.participantIds,
    };
    const result = form.id
      ? await updateStaffSchedule(form.id, input)
      : await createStaffSchedule(input);
    setSubmitting(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(form.id ? "일정을 수정했습니다." : "일정을 등록했습니다.");
    setFormOpen(false);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("이 일정을 삭제하시겠습니까?")) return;
    const result = await deleteStaffSchedule(id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("일정을 삭제했습니다.");
    setDetailSchedule(null);
    router.refresh();
  }

  const filteredStaffList = staffList.filter((s) =>
    (s.name ?? "").toLowerCase().includes(participantSearch.toLowerCase()),
  );

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : [];

  // 그 달에 하루 최대 몇 건인지 보고 칩 크기를 정한다. 일정이 적은 달은 칸이 비어 있으니
  // 글씨를 키워 잘 보이게 하고, 많은 달은 지금 크기를 유지해 넘치지 않게 한다.
  const busiestDay = Math.max(1, ...Object.values(eventsByDate).map((list) => list.length));
  const chipClass =
    busiestDay <= 1
      ? "text-[16px] px-2.5 py-2.5"
      : busiestDay === 2
        ? "text-[14px] px-2 py-2"
        : "text-[12px] px-1.5 py-1";
  const cellMinH =
    busiestDay <= 1 ? "min-h-[132px]" : busiestDay === 2 ? "min-h-[126px]" : "min-h-[118px]";
  const visibleChips = busiestDay <= 2 ? busiestDay : 3;

  return (
    <div className="flex flex-col h-full gap-4">
      {!schemaReady && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          일정 캘린더 마이그레이션(supabase/134)이 아직 적용되지 않았습니다. 관리자에게
          문의해주세요.
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => shiftMonth(-1)}
          className="rounded-lg p-1.5 hover:bg-slate-100 transition-colors"
        >
          <ChevronLeft size={18} className="text-slate-500" />
        </button>
        <h2 className="font-bold text-slate-900 text-lg min-w-[120px] text-center">
          {year}년 {monthNum}월
        </h2>
        <button
          onClick={() => shiftMonth(1)}
          className="rounded-lg p-1.5 hover:bg-slate-100 transition-colors"
        >
          <ChevronRight size={18} className="text-slate-500" />
        </button>

        <div className="w-40">
          <AppSelect
            value={category}
            onValueChange={(value) => updateQuery({ category: value })}
            aria-label="구분 필터"
            options={[
              { value: "", label: "전체" },
              ...CATEGORIES.map((c) => ({ value: c, label: c })),
            ]}
          />
        </div>

        <button
          type="button"
          onClick={toggleMine}
          className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
            mine
              ? "border-blue-300 bg-blue-50 text-blue-700"
              : "border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          내 일정만
        </button>

        <button
          type="button"
          onClick={() => void copyAsImage()}
          className="ml-auto flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition-colors whitespace-nowrap"
        >
          <ImageDown size={14} /> 이미지 복사
        </button>

        {schemaReady && (
          <button
            type="button"
            onClick={() => openCreateForm(selectedDate ?? todayStr)}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <Plus size={14} /> 일정 등록
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map((d, i) => (
              <div
                key={d}
                className={`text-center font-bold text-[13px] py-2 ${
                  i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-600"
                }`}
              >
                {d}
              </div>
            ))}
          </div>

          {mine && visibleSchedules.length === 0 && (
            <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              &apos;내 일정만&apos;이 켜져 있어 내가 등록했거나 참석하는 일정만 보입니다. 전체를
              보려면 버튼을 다시 눌러 끄세요.
            </div>
          )}
          <div className="grid grid-cols-7 flex-1 min-h-0 border-t border-l border-slate-200 rounded-xl overflow-hidden">
            {cells.map((day, idx) => {
              if (!day)
                return (
                  <div
                    key={`empty-${idx}`}
                    className={`border-b border-r border-slate-200 bg-slate-100/60 ${cellMinH}`}
                  />
                );
              const ds = dateStr(day);
              const events = eventsByDate[ds] ?? [];
              const isToday = ds === todayStr;
              const isSelected = ds === selectedDate;
              const dow = (firstDay + day - 1) % 7;
              return (
                <div
                  key={ds}
                  onClick={() => setSelectedDate(isSelected ? null : ds)}
                  className={`border-b border-r border-slate-200 cursor-pointer transition-colors overflow-hidden ${cellMinH} p-2 ${
                    isSelected
                      ? "bg-blue-50"
                      : dow === 0 || dow === 6
                        ? "bg-slate-50/70 hover:bg-slate-100/70"
                        : "hover:bg-slate-50"
                  }`}
                >
                  <div
                    className={`flex items-center justify-center rounded-full font-bold w-7 h-7 text-[15px] mb-1.5 ${
                      isToday
                        ? "bg-blue-600 text-white"
                        : dow === 0
                          ? "text-red-500"
                          : dow === 6
                            ? "text-blue-500"
                            : "text-slate-800"
                    }`}
                  >
                    {day}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {events.slice(0, visibleChips).map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailSchedule(ev);
                        }}
                        className={`block w-full text-left leading-tight rounded-md border-l-[3px] border ${chipClass} ${
                          CATEGORY_COLOR[ev.category] ?? CATEGORY_COLOR["기타"]
                        }`}
                        title={`${ev.all_day ? "종일" : toTimePart(ev.starts_at)} ${ev.title}`}
                      >
                        {!staff && ownerLabel(ev) && (
                          <span className="mr-1 font-bold opacity-70">{ownerLabel(ev)}</span>
                        )}
                        <span className="font-bold tabular-nums">
                          {ev.all_day ? "종일" : toTimePart(ev.starts_at)}
                        </span>{" "}
                        <span className="font-medium">{ev.title}</span>
                      </button>
                    ))}
                    {events.length > visibleChips && (
                      <div className="text-slate-500 px-1 text-[11px] font-semibold">
                        +{events.length - visibleChips}건
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 오른쪽 직원 목록 — 왼쪽 사이드메뉴처럼 이름을 눌러 그 직원 일정만 본다 */}
        <aside className="hidden w-52 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:flex">
          <div className="shrink-0 border-b border-slate-100 px-3 py-2.5">
            <p className="text-xs font-bold text-slate-900">직원</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            <button
              type="button"
              onClick={() => selectStaff("")}
              className={`mb-0.5 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                staff === ""
                  ? "bg-blue-50 font-semibold text-blue-700"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span>전체</span>
              <span className="text-xs text-slate-400">{totalCount}</span>
            </button>
            {staffList.map((member) => {
              const active = staff === member.id;
              const count = staffCounts[member.id] ?? 0;
              return (
                <div
                  key={member.id}
                  className={`mb-0.5 flex w-full items-center gap-1 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                    active
                      ? "bg-blue-50 font-semibold text-blue-700"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectStaff(active ? "" : member.id)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                  >
                    <span className="min-w-0 truncate">
                      {member.name}
                      {member.position && (
                        <span className="ml-1 text-xs font-normal text-slate-400">
                          {member.position}
                        </span>
                      )}
                    </span>
                    {count > 0 && (
                      <span
                        className={`shrink-0 text-xs ${active ? "text-blue-500" : "text-slate-400"}`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        // 주소는 읽기 쉽게 이름으로 만든다. 같은 이름이 여러 명이면
                        // 누구인지 정할 수 없으므로 그 사람만 id 주소를 쓴다.
                        const sameName = staffList.filter(
                          (m) => (m.name ?? "") === (member.name ?? ""),
                        ).length;
                        // 한글 이름을 encodeURIComponent로 감싸면 %EB%B0%95... 형태로 복사돼
                        // 카톡에 붙였을 때 알아볼 수 없다. 브라우저가 알아서 처리하므로 그대로 둔다.
                        const slug = member.name && sameName === 1 ? member.name : member.id;
                        await navigator.clipboard.writeText(
                          `${window.location.origin}/staff-schedules/${slug}`,
                        );
                        toast.success("링크를 복사했습니다.");
                      } catch {
                        toast.error("링크 복사에 실패했습니다.");
                      }
                    }}
                    className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    title="일정 링크 복사"
                  >
                    <Link2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {selectedDate && (
        <div className="border border-slate-200 rounded-xl bg-white p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold text-slate-900 text-sm">
              {selectedDate.slice(5).replace("-", "/")} 일정
            </p>
            <button
              onClick={() => setSelectedDate(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={15} />
            </button>
          </div>
          {selectedEvents.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">등록된 일정이 없습니다</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {selectedEvents.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => setDetailSchedule(ev)}
                  className={`text-left text-xs font-medium rounded-lg border px-3 py-2 ${
                    CATEGORY_COLOR[ev.category] ?? CATEGORY_COLOR["기타"]
                  }`}
                >
                  {ev.all_day ? "종일" : `${toTimePart(ev.starts_at)}~${toTimePart(ev.ends_at)}`}{" "}
                  {ev.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {detailSchedule && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4">
          <div className="flex max-h-[92dvh] w-full max-w-md flex-col rounded-xl bg-white shadow-lg">
            <div className="flex flex-shrink-0 items-center justify-between px-5 py-4 border-b border-slate-100">
              <p className="font-semibold text-slate-900">{detailSchedule.title}</p>
              <button
                onClick={() => setDetailSchedule(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2.5 text-sm">
              <div>
                <span
                  className={`inline-block text-xs font-medium rounded-full border px-2 py-0.5 ${
                    CATEGORY_COLOR[detailSchedule.category] ?? CATEGORY_COLOR["기타"]
                  }`}
                >
                  {detailSchedule.category}
                </span>
              </div>
              <div className="text-slate-600">
                {toDatePart(detailSchedule.starts_at)}{" "}
                {detailSchedule.all_day ? "종일" : toTimePart(detailSchedule.starts_at)}
              </div>
              {detailSchedule.location && (
                <div className="text-slate-600">장소: {detailSchedule.location}</div>
              )}
              <div className="text-slate-600">
                참석자:{" "}
                {detailSchedule.participants.length
                  ? detailSchedule.participants.map((p) => p.name ?? "이름 미상").join(", ")
                  : "없음"}
              </div>
              {detailSchedule.memo && (
                <div className="text-slate-600 whitespace-pre-wrap">
                  메모: {detailSchedule.memo}
                </div>
              )}
              <div className="text-slate-400 text-xs">
                등록자: {detailSchedule.created_by_name ?? "알 수 없음"}
              </div>
            </div>
            {(detailSchedule.created_by === currentUser.id || isAdmin) && (
              <div className="flex flex-shrink-0 justify-end gap-2 px-5 py-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => openEditForm(detailSchedule)}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors font-medium"
                >
                  <Pencil size={12} /> 수정
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(detailSchedule.id)}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors font-medium"
                >
                  <Trash2 size={12} /> 삭제
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-lg max-h-[92dvh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <p className="font-semibold text-slate-900">{form.id ? "일정 수정" : "일정 등록"}</p>
              <button
                onClick={() => setFormOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto min-h-0 flex-1">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  제목 <span className="text-red-500">*</span>
                </label>
                <input
                  autoFocus
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-400"
                  placeholder="일정 제목"
                />
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-500 mb-1">구분</label>
                  <AppSelect
                    value={form.category}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, category: value }))}
                    aria-label="구분"
                    options={CATEGORIES.map((c) => ({ value: c, label: c }))}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-500 mb-1">날짜</label>
                  <DatePickerField
                    value={form.date}
                    onChange={(value) => setForm((prev) => ({ ...prev, date: value }))}
                    ariaLabel="일정 날짜"
                  />
                </div>
              </div>

              {!form.allDay && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">시각</label>
                  <div className="flex gap-1.5">
                    <AppSelect
                      value={form.startTime.slice(0, 2)}
                      onValueChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          startTime: `${value}:${prev.startTime.slice(3, 5)}`,
                        }))
                      }
                      aria-label="시"
                      className="flex-1"
                      options={HOUR_OPTIONS}
                    />
                    <AppSelect
                      value={form.startTime.slice(3, 5)}
                      onValueChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          startTime: `${prev.startTime.slice(0, 2)}:${value}`,
                        }))
                      }
                      aria-label="분"
                      className="flex-1"
                      options={minuteOptions(form.startTime.slice(3, 5))}
                    />
                  </div>
                </div>
              )}

              {/* 종일은 가끔 쓰는 선택지라 시각 입력 아래에 둔다(기본은 시각 입력). */}
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.allDay}
                  onChange={(e) => setForm((prev) => ({ ...prev, allDay: e.target.checked }))}
                />
                하루 종일
              </label>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">장소 (선택)</label>
                <input
                  value={form.location}
                  onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-400"
                  placeholder="장소"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">메모 (선택)</label>
                <textarea
                  value={form.memo}
                  onChange={(e) => setForm((prev) => ({ ...prev, memo: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-400 resize-none"
                  rows={2}
                  placeholder="메모"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">참석자</label>
                <input
                  value={participantSearch}
                  onChange={(e) => setParticipantSearch(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-400 mb-2"
                  placeholder="이름으로 검색"
                />
                <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg p-2 flex flex-col gap-1">
                  {filteredStaffList.length === 0 ? (
                    <p className="text-slate-400 text-xs text-center py-2">직원이 없습니다</p>
                  ) : (
                    filteredStaffList.map((staff) => (
                      <label
                        key={staff.id}
                        className="flex items-center gap-2 text-sm text-slate-600 px-1 py-0.5 rounded hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={form.participantIds.includes(staff.id)}
                          onChange={() => toggleParticipant(staff.id)}
                        />
                        {staff.name ?? "이름 미상"}
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 flex-shrink-0">
              <button
                onClick={() => setFormOpen(false)}
                className="rounded-lg px-4 py-2.5 text-sm text-slate-500 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !form.title.trim()}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
