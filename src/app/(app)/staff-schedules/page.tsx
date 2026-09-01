import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { kstToday } from "@/lib/date";
import { positionRank } from "@/types";
import StaffSchedulesClient, {
  type StaffMember,
  type StaffScheduleRow,
} from "./StaffSchedulesClient";

const STAFF_SCHEDULE_CATEGORIES = ["미팅", "회의", "교육", "외출", "휴가", "기타"] as const;

interface Props {
  searchParams: Promise<{ month?: string; category?: string; mine?: string; staff?: string }>;
}

// 134번 마이그레이션이 아직 적용되지 않은 환경에서는 staff_schedules 표가 없어
// 이를 참조하는 쿼리가 42P01(relation does not exist) 또는 PGRST205(schema cache)로
// 실패한다. 500으로 죽이지 않고 빈 목록 + 안내 배너로 흡수한다.
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

export default async function StaffSchedulesPage({ searchParams }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const month =
    params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : kstToday().slice(0, 7);
  const category =
    params.category && (STAFF_SCHEDULE_CATEGORIES as readonly string[]).includes(params.category)
      ? params.category
      : "";
  const mine = params.mine === "1";

  const monthStart = `${month}-01`;
  const monthEnd = nextMonthStart(month);

  let scheduleQuery = supabase
    .from("staff_schedules")
    .select("id,title,category,starts_at,ends_at,all_day,location,memo,created_by,created_by_name")
    .gte("starts_at", `${monthStart}T00:00:00+09:00`)
    .lt("starts_at", `${monthEnd}T00:00:00+09:00`)
    .order("starts_at", { ascending: true });
  if (category) scheduleQuery = scheduleQuery.eq("category", category);

  const [{ data: scheduleRows, error: scheduleError }, staffResult, { data: profileRow }] =
    await Promise.all([
      scheduleQuery,
      supabase.from("profiles").select("id,name,position").order("name", { ascending: true }),
      supabase.from("profiles").select("name,role").eq("id", user.id).single(),
    ]);

  const schemaReady = !isMissingStaffSchedulesTable(scheduleError);

  let staffRows: { id: string; name: string | null; position?: string | null }[] | null =
    staffResult.data;
  if (isMissingPositionColumnError(staffResult.error)) {
    const fallback = await supabase
      .from("profiles")
      .select("id,name")
      .order("name", { ascending: true });
    staffRows = fallback.data;
  }

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

  const schedules: StaffScheduleRow[] = (scheduleRows ?? []).map((row) => ({
    ...row,
    participants: participantsByScheduleId[row.id] ?? [],
  }));

  // 직급 등급 내림차순 -> 이름 오름차순. position_rank(supabase/136)와 같은 등급표를 TS에서 재사용한다.
  const staffList: StaffMember[] = [...(staffRows ?? [])].sort(
    (a, b) =>
      positionRank(b.position) - positionRank(a.position) ||
      (a.name ?? "").localeCompare(b.name ?? "", "ko"),
  );

  // 직원 선택과 "내 일정만"은 화면 안에서 거른다. 그 달 일정은 이미 전부 내려보내므로
  // 서버를 다시 다녀올 필요가 없고, 버튼이 바로 반응한다(주소만 바꾸면 화면이 갱신되지
  // 않는 경우가 있어 버튼이 안 꺼지는 문제가 있었다).
  const initialStaff =
    params.staff && staffList.some((s) => s.id === params.staff) ? params.staff : "";

  return (
    <StaffSchedulesClient
      schedules={schemaReady ? schedules : []}
      staffList={staffList}
      month={month}
      category={category}
      initialMine={mine}
      initialStaff={initialStaff}
      schemaReady={schemaReady}
      currentUser={{ id: user.id, name: profileRow?.name ?? null, role: profileRow?.role ?? null }}
    />
  );
}
