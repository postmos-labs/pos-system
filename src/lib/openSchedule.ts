import { kstToday } from "./date";

// 날짜 기준 사전 점검 신호 — 기술지원팀 "오픈일정 누락 방지" 개선안.
//
// 날짜가 다가올수록 확인 강도를 높인다. 색은 단순 표시가 아니라 담당자가 그날 해야 하는
// 행동을 가리키는 신호다.
//
//   D-5 ~ D-4  노란색
//   D-3 ~ D-1  빨간색
//   D-DAY      파란색
//
// 발표자료 문구는 "D-5 노란색 / D-3 빨간색"이지만 그대로 두 날짜에만 색을 켜면 D-4·D-2에
// 신호가 꺼져 오히려 놓치게 된다. 구간으로 해석해 경계 사이를 메운다.
//
// 같은 규칙을 두 축에 쓴다.
//   오픈일   (openBadge)    가맹점이 문을 여는 날 — 통화·최종점검 대상. 알림 cron도 이 축.
//   설치예정일 (installBadge) 기사가 현장에 나가는 날 — 목록에서 일정을 좇는 축.

export const CALL_DAYS = 5; // 이 날부터 노란색
export const FINAL_DAYS = 3; // 이 날부터 빨간색

export type ScheduleUrgency =
  | "none" // 날짜가 없거나, 이미 끝난 건
  | "upcoming" // 아직 여유 있음 — 날짜만 표시
  | "call" // D-5 ~ D-4
  | "final" // D-3 ~ D-1
  | "dday" // 오늘
  | "passed"; // 날짜가 지남

/** 판정에 필요한 최소 형태. 설치건 행을 그대로 넘길 수 있다. */
export interface OpenScheduleSource {
  status?: string | null;
  open_date?: string | null;
  scheduled_date?: string | null;
  // Supabase 조인 결과는 관계 설정에 따라 객체로도 배열로도 올 수 있다.
  franchise?: { open_date?: string | null } | { open_date?: string | null }[] | null;
}

/** 가맹접수에서 넘어온 오픈 예정일. */
export function franchiseOpenDate(source: OpenScheduleSource): string | null {
  const franchise = source.franchise;
  const row = Array.isArray(franchise) ? franchise[0] : franchise;
  return row?.open_date ?? null;
}

/**
 * 이 설치건에 적용할 오픈일.
 * 설치관리에서 확정한 값이 있으면 그 값이, 없으면 가맹접수의 오픈 예정일이 기준이 된다.
 */
export function effectiveOpenDate(source: OpenScheduleSource): string | null {
  return source.open_date || franchiseOpenDate(source) || null;
}

/**
 * 이 오픈일이 설치관리에서 확정한 값인지. false면 가맹접수의 오픈 예정일을 따르고 있다는 뜻이다.
 * 화면에서 "예정"과 "확정"을 구분해 보여줘야 담당자가 다시 확인할 대상을 안다.
 */
export function isConfirmedOpenDate(source: OpenScheduleSource): boolean {
  return !!source.open_date;
}

/** 남은 일수. 오늘이면 0, 지났으면 음수. 날짜가 없으면 null. */
export function daysLeftUntil(date: string | null, today: string = kstToday()): number | null {
  if (!date) return null;
  // YYYY-MM-DD를 UTC 자정으로 고정해 빼면 타임존과 무관하게 일수만 남는다.
  const target = Date.parse(`${date}T00:00:00Z`);
  const base = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(target) || Number.isNaN(base)) return null;
  return Math.round((target - base) / 86400000);
}

/** 끝난 건인지 — 완료·반려에는 신호를 켜지 않는다. */
function isClosed(status?: string | null): boolean {
  return status === "completed" || status === "rejected";
}

/** 어떤 날짜의 임박 단계. */
export function urgencyOf(
  date: string | null,
  status?: string | null,
  today: string = kstToday(),
): ScheduleUrgency {
  // 끝난 건에 빨간불이 남아 있으면 신호 전체가 의미를 잃는다.
  if (isClosed(status)) return "none";
  const daysLeft = daysLeftUntil(date, today);
  if (daysLeft === null) return "none";
  if (daysLeft < 0) return "passed";
  if (daysLeft === 0) return "dday";
  if (daysLeft <= FINAL_DAYS) return "final";
  if (daysLeft <= CALL_DAYS) return "call";
  return "upcoming";
}

export interface ScheduleBadge {
  urgency: ScheduleUrgency;
  daysLeft: number;
  /** "D-5" · "D-DAY" · "D+2" */
  label: string;
  /** 담당자가 할 일. 여유 있는 건은 빈 문자열. */
  hint: string;
  /** 칩에 그대로 붙이는 Tailwind 클래스 */
  className: string;
}

const CHIP_CLASS: Record<Exclude<ScheduleUrgency, "none">, string> = {
  upcoming: "border-slate-200 bg-slate-50 text-slate-500",
  call: "border-amber-300 bg-amber-100 text-amber-800",
  final: "border-red-300 bg-red-100 text-red-700",
  dday: "border-blue-300 bg-blue-100 text-blue-700",
  passed: "border-slate-200 bg-slate-100 text-slate-400",
};

type HintSet = Record<Exclude<ScheduleUrgency, "none">, string>;

// 오픈일 축 — 발표자료의 D-5 통화 / D-3 최종점검 그대로.
const OPEN_HINT: HintSet = {
  upcoming: "",
  call: "필수 통화",
  final: "최종 점검",
  dday: "오픈",
  passed: "오픈일 지남",
};

// 설치예정일 축 — 기사 일정 기준이라 할 일이 다르다.
const INSTALL_HINT: HintSet = {
  upcoming: "",
  call: "일정 확인",
  final: "설치 준비",
  dday: "설치일",
  passed: "예정일 지남",
};

function buildBadge(
  date: string | null,
  status: string | null | undefined,
  hints: HintSet,
  today: string,
): ScheduleBadge | null {
  const urgency = urgencyOf(date, status, today);
  if (urgency === "none") return null;
  const daysLeft = daysLeftUntil(date, today) ?? 0;
  const label = daysLeft === 0 ? "D-DAY" : daysLeft > 0 ? `D-${daysLeft}` : `D+${-daysLeft}`;
  return { urgency, daysLeft, label, hint: hints[urgency], className: CHIP_CLASS[urgency] };
}

/**
 * 오픈일 칩. 색을 칠할 이유가 없으면 null을 돌려준다.
 *
 * 색은 행 배경이 아니라 칩에만 쓴다 — 설치관리 표는 승인 대기(빨강)와 내 담당건(노랑)이
 * 이미 행 배경을 쓰고 있어, 여기에 얹으면 둘을 구분할 수 없다.
 */
export function openBadge(
  source: OpenScheduleSource,
  today: string = kstToday(),
): ScheduleBadge | null {
  return buildBadge(effectiveOpenDate(source), source.status, OPEN_HINT, today);
}

/** 설치예정일 칩. 목록에서 D-day를 좇는 기본 축이다. */
export function installBadge(
  source: OpenScheduleSource,
  today: string = kstToday(),
): ScheduleBadge | null {
  return buildBadge(source.scheduled_date ?? null, source.status, INSTALL_HINT, today);
}

/** 설치가 임박한 건인지 — 목록의 "설치 임박" 필터와 건수에 쓴다. */
export function isInstallSoon(source: OpenScheduleSource, today: string = kstToday()): boolean {
  const urgency = urgencyOf(source.scheduled_date ?? null, source.status, today);
  return urgency === "call" || urgency === "final" || urgency === "dday";
}

/** 오픈이 임박한 건인지 — 알림 cron과 같은 축. */
export function isOpenSoon(source: OpenScheduleSource, today: string = kstToday()): boolean {
  const urgency = urgencyOf(effectiveOpenDate(source), source.status, today);
  return urgency === "call" || urgency === "final" || urgency === "dday";
}
