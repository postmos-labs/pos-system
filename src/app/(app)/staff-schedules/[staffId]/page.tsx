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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { staffId } = await params;
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : kstToday().slice(0, 7);

  let staffRow: { id: string; name: string | null; position?: string | null } | null = null;
  const staffResult = await supabase
    .from("profiles")
    .select("id,name,position")
    .eq("id", staffId)
    .single();
  if (isMissingPositionColumnError(staffResult.error)) {
    const fallback = await supabase.from("profiles").select("id,name").eq("id", staffId).single();
    staffRow = fallback.data;
  } else {
    staffRow = staffResult.data;
  }

  if (!staffRow) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center justify-center gap-2 px-4 py-16 text-center">
        <p className="text-base font-medium text-slate-600">직원을 찾을 수 없습니다.</p>
      </div>
    );
  }

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
    />
  );
}
