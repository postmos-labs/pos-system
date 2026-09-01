import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { kstToday } from "@/lib/date";
import StaffScheduleMobileView from "./StaffScheduleMobileView";
import type { StaffScheduleRow } from "../StaffSchedulesClient";

interface Props {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<{ month?: string }>;
}

// 134번 마이그레이션이 아직 적용되지 않은 환경에서는 staff_schedules 표가 없어
// 이를 참조하는 쿼리가 42P01(relation does not exist) 또는 PGRST205(schema cache)로
// 실패한다. 500으로 죽이지 않고 빈 목록으로 흡수한다.
function isMissingStaffSchedulesTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /staff_schedule|schema cache|relation .* does not exist/i.test(error.message ?? "")
  );
}

// 136번 마이그레이션이 아직 적용되지 않은 환경에서는 position 컬럼이 없어
// 이를 참조하는 쿼리가 "column does not exist"(42703)로 실패한다. 실패로 취급하지 않고
// position 없는 컬럼셋으로 재조회한다.
function isMissingPositionColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist/i.test(error.message ?? "")
  );
}

function profileName(value: { name: string | null }[] | { name: string | null } | null) {
  return Array.isArray(value) ? (value[0]?.name ?? null) : (value?.name ?? null);
}

function nextMonthStart(month: string) {
  const [year, monthNum] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNum, 1)).toISOString().slice(0, 10);
}

export default async function StaffScheduleMobilePage({ params, searchParams }: Props) {
  const supabase = await createClient();
  const { staffId } = await params;
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : kstToday().slice(0, 7);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  // 링크를 받은 사람이 로그인하고 나면 이 페이지로 돌아오도록 원래 주소를 넘긴다.
  // 넘기지 않으면 로그인 후 첫 화면으로 가버려 링크를 다시 눌러야 한다.
  if (!user) {
    const back = `/staff-schedules/${staffId}?month=${month}`;
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }

  // 주소에는 이름이 들어온다(/staff-schedules/박은서). 예전에 복사해 둔 id 주소도 그대로 열리도록
  // 둘 다 받는다. 이름이 겹치는 직원이 있으면 누구인지 정할 수 없으므로 id 주소만 쓴다.
  const decoded = decodeURIComponent(staffId);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded);

  let staffRow: { id: string; name: string | null; position?: string | null } | null = null;
  let duplicateName = false;

  async function lookup(columns: string) {
    return isUuid
      ? supabase.from("profiles").select(columns).eq("id", decoded).limit(2)
      : supabase.from("profiles").select(columns).eq("name", decoded).limit(2);
  }

  const staffResult = await lookup("id,name,position");
  let rows = staffResult.data as unknown as
    { id: string; name: string | null; position?: string | null }[] | null;
  if (isMissingPositionColumnError(staffResult.error)) {
    const fallback = await lookup("id,name");
    rows = fallback.data as unknown as { id: string; name: string | null }[] | null;
  }
  if (rows && rows.length > 1) {
    duplicateName = true;
  } else {
    staffRow = rows?.[0] ?? null;
  }

  if (duplicateName) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center justify-center gap-2 px-4 py-16 text-center">
        <p className="text-base font-medium text-slate-600">
          같은 이름의 직원이 여러 명이라 일정을 특정할 수 없습니다.
        </p>
        <p className="text-sm text-slate-400">
          일정 캘린더에서 해당 직원의 링크를 다시 복사해 주세요.
        </p>
      </div>
    );
  }

  if (!staffRow) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center justify-center gap-2 px-4 py-16 text-center">
        <p className="text-base font-medium text-slate-600">직원을 찾을 수 없습니다.</p>
      </div>
    );
  }

  // 수정·삭제 버튼 노출을 위해 지금 로그인한 사람의 역할이 필요하다(서버 액션도 같은 조건으로 막는다).
  const { data: meRow } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  const monthStart = `${month}-01`;
  const monthEnd = nextMonthStart(month);

  const { data: scheduleRows, error: scheduleError } = await supabase
    .from("staff_schedules")
    .select("id,title,category,starts_at,ends_at,all_day,location,memo,created_by,created_by_name")
    .gte("starts_at", `${monthStart}T00:00:00+09:00`)
    .lt("starts_at", `${monthEnd}T00:00:00+09:00`)
    .order("starts_at", { ascending: true });

  const schemaReady = !isMissingStaffSchedulesTable(scheduleError);

  const scheduleIds = (scheduleRows ?? []).map((row) => row.id);
  const participantsByScheduleId: Record<string, { userId: string; name: string | null }[]> = {};
  if (schemaReady && scheduleIds.length) {
    const { data: participantRows } = await supabase
      .from("staff_schedule_participants")
      .select("schedule_id,user_id,profiles(name)")
      .in("schedule_id", scheduleIds);
    for (const row of participantRows ?? []) {
      const name = profileName(
        row.profiles as { name: string | null }[] | { name: string | null } | null,
      );
      if (!participantsByScheduleId[row.schedule_id])
        participantsByScheduleId[row.schedule_id] = [];
      participantsByScheduleId[row.schedule_id].push({ userId: row.user_id, name });
    }
  }

  const allSchedules: StaffScheduleRow[] = (scheduleRows ?? []).map((row) => ({
    ...row,
    participants: participantsByScheduleId[row.id] ?? [],
  }));

  // 그 직원이 등록했거나 참석자로 들어간 일정만 남긴다 (기존 page.tsx의 staff 필터와 동일한 판정).
  const schedules = schemaReady
    ? allSchedules.filter(
        (row) =>
          row.created_by === staffRow!.id ||
          row.participants.some((p) => p.userId === staffRow!.id),
      )
    : [];

  return (
    <StaffScheduleMobileView
      staff={{ id: staffRow.id, name: staffRow.name, position: staffRow.position ?? null }}
      schedules={schedules}
      month={month}
      slug={staffId}
      currentUser={{ id: user.id, role: (meRow?.role as string | null) ?? null }}
    />
  );
}
