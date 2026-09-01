"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const STAFF_SCHEDULE_CATEGORIES = ["미팅", "회의", "교육", "외출", "휴가", "기타"] as const;
type StaffScheduleCategory = (typeof STAFF_SCHEDULE_CATEGORIES)[number];

interface StaffScheduleInput {
  title: string;
  category: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string | null;
  memo: string | null;
  participantIds: string[];
}

// 134번 마이그레이션이 아직 적용되지 않은 환경에서는 staff_schedules 표가 없어
// 이를 참조하는 쿼리가 42P01(relation does not exist) 또는 PGRST205(schema cache)로
// 실패한다. 원문 대신 안내 문구로 바꿔 돌려준다.
function isMissingStaffSchedulesTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /staff_schedule|schema cache|relation .* does not exist/i.test(error.message ?? "")
  );
}

// 137번 마이그레이션이 아직 적용되지 않은 환경에서는 response/responded_at 컬럼이 없어
// 이를 참조하는 쿼리가 "column does not exist"(42703)로 실패한다. 조용히 건너뛴다.
function isMissingResponseColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist/i.test(error.message ?? "")
  );
}

function validateInput(input: StaffScheduleInput): string | null {
  const title = input.title.trim();
  if (!title) return "제목을 입력해주세요.";
  if (title.length > 200) return "제목은 200자 이하로 입력해주세요.";
  if (!STAFF_SCHEDULE_CATEGORIES.includes(input.category as StaffScheduleCategory)) {
    return "잘못된 구분입니다.";
  }
  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "날짜/시간을 확인해주세요.";
  }
  if (end.getTime() < start.getTime()) {
    return "종료 시각은 시작 시각보다 빠를 수 없습니다.";
  }
  return null;
}

// startsAt은 "YYYY-MM-DDTHH:mm:ss+09:00" 형식으로 클라이언트에서 만들어 보내므로
// 다시 타임존 변환을 거치지 않고 문자열만 잘라 사람이 읽을 라벨을 만든다.
function formatScheduleDateLabel(startsAt: string, allDay: boolean) {
  const datePart = startsAt.slice(0, 10).replace(/-/g, ".");
  if (allDay) return `${datePart} 종일`;
  return `${datePart} ${startsAt.slice(11, 16)}`;
}

export async function createStaffSchedule(input: StaffScheduleInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const validationError = validateInput(input);
  if (validationError) return { error: validationError };

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  const { data: schedule, error } = await supabase
    .from("staff_schedules")
    .insert({
      title: input.title.trim(),
      category: input.category,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      all_day: input.allDay,
      location: input.location?.trim() || null,
      memo: input.memo?.trim() || null,
      created_by: user.id,
      created_by_name: profile?.name ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (isMissingStaffSchedulesTable(error)) {
      return { error: "일정 캘린더 마이그레이션(supabase/134)이 아직 적용되지 않았습니다." };
    }
    return { error: error.message };
  }

  const participantIds = Array.from(new Set(input.participantIds.filter(Boolean)));
  if (participantIds.length) {
    const { error: participantError } = await supabase
      .from("staff_schedule_participants")
      .insert(participantIds.map((userId) => ({ schedule_id: schedule.id, user_id: userId })));
    if (participantError) return { error: participantError.message };

    // 알림 발송이 실패해도 일정 등록은 이미 끝났으므로 되돌리지 않는다. 알림은
    // 참고용 부가 기능이라 실패를 사용자에게 노출하면 오히려 혼란만 준다.
    const recipients = participantIds.filter((id) => id !== user.id);
    if (recipients.length) {
      const scheduleDateLabel = formatScheduleDateLabel(input.startsAt, input.allDay);
      await supabase.from("notifications").insert(
        recipients.map((userId) => ({
          user_id: userId,
          type: "staff_schedule",
          title: `새 일정: ${input.title.trim()}`,
          body: `${scheduleDateLabel} · ${input.category}`,
        })),
      );
    }
  }

  revalidatePath("/staff-schedules");
  return { error: null };
}

export async function updateStaffSchedule(id: string, input: StaffScheduleInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };
  if (!id) return { error: "잘못된 요청입니다." };

  const validationError = validateInput(input);
  if (validationError) return { error: validationError };

  const { data: existing, error: fetchError } = await supabase
    .from("staff_schedules")
    .select("created_by, title, category, starts_at, ends_at, all_day")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    if (isMissingStaffSchedulesTable(fetchError)) {
      return { error: "일정 캘린더 마이그레이션(supabase/134)이 아직 적용되지 않았습니다." };
    }
    return { error: fetchError.message };
  }
  if (!existing) return { error: "일정을 찾을 수 없습니다." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isOwner = existing.created_by === user.id;
  const isAdmin = profile?.role === "admin" || profile?.role === "master";
  if (!isOwner && !isAdmin) return { error: "수정 권한이 없습니다." };

  const { data: existingParticipants } = await supabase
    .from("staff_schedule_participants")
    .select("user_id")
    .eq("schedule_id", id);
  const existingParticipantIds = new Set((existingParticipants ?? []).map((p) => p.user_id));

  const { error } = await supabase
    .from("staff_schedules")
    .update({
      title: input.title.trim(),
      category: input.category,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      all_day: input.allDay,
      location: input.location?.trim() || null,
      memo: input.memo?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  const participantIds = Array.from(new Set(input.participantIds.filter(Boolean)));
  const { error: deleteError } = await supabase
    .from("staff_schedule_participants")
    .delete()
    .eq("schedule_id", id);
  if (deleteError) return { error: deleteError.message };

  if (participantIds.length) {
    const { error: insertError } = await supabase
      .from("staff_schedule_participants")
      .insert(participantIds.map((userId) => ({ schedule_id: id, user_id: userId })));
    if (insertError) return { error: insertError.message };

    // 새로 추가된 참석자에게만 알림을 보낸다. 기존 참석자는 이미 알고 있으므로
    // 수정할 때마다 다시 알림을 받으면 스팸이 된다.
    const newParticipantIds = participantIds.filter(
      (userId) => userId !== user.id && !existingParticipantIds.has(userId),
    );
    if (newParticipantIds.length) {
      const scheduleDateLabel = formatScheduleDateLabel(input.startsAt, input.allDay);
      await supabase.from("notifications").insert(
        newParticipantIds.map((userId) => ({
          user_id: userId,
          type: "staff_schedule",
          title: `새 일정: ${input.title.trim()}`,
          body: `${scheduleDateLabel} · ${input.category}`,
        })),
      );
    }
  }

  // 제목·시작시각·종료시각·종일 여부 중 하나라도 바뀌었으면 기존 참석자(새로 추가된
  // 사람 제외, 본인 제외)에게 변경 알림을 보낸다. 새로 추가된 참석자는 위에서 이미
  // "새 일정" 알림을 받았으므로 여기서는 제외한다.
  const scheduleChanged =
    existing.title !== input.title.trim() ||
    existing.category !== input.category ||
    !sameInstant(existing.starts_at, input.startsAt) ||
    !sameInstant(existing.ends_at, input.endsAt) ||
    existing.all_day !== input.allDay;
  if (scheduleChanged) {
    const remainingParticipantIds = participantIds.filter(
      (userId) => userId !== user.id && existingParticipantIds.has(userId),
    );
    if (remainingParticipantIds.length) {
      const scheduleDateLabel = formatScheduleDateLabel(input.startsAt, input.allDay);
      await supabase.from("notifications").insert(
        remainingParticipantIds.map((userId) => ({
          user_id: userId,
          type: "staff_schedule",
          title: `일정 변경: ${input.title.trim()}`,
          body: `${scheduleDateLabel} · ${input.category}`,
        })),
      );

      // 시각이 바뀌었으면 참석자의 응답을 다시 물어야 하므로 대기로 되돌린다.
      // 137번 마이그레이션이 아직 적용되지 않았으면 컬럼이 없어 실패하므로 조용히 건너뛴다.
      const timeChanged =
        !sameInstant(existing.starts_at, input.startsAt) ||
        !sameInstant(existing.ends_at, input.endsAt) ||
        existing.all_day !== input.allDay;
      if (timeChanged) {
        // 컬럼이 없으면(42703/PGRST204) supabase가 에러를 반환하지만 무시한다 — 137번
        // 마이그레이션 미적용 환경에서도 일정 수정 자체는 계속 진행돼야 한다.
        await supabase
          .from("staff_schedule_participants")
          .update({ response: "pending", responded_at: null })
          .eq("schedule_id", id)
          .in("user_id", remainingParticipantIds);
      }
    }
  }

  revalidatePath("/staff-schedules");
  return { error: null };
}

export async function deleteStaffSchedule(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };
  if (!id) return { error: "잘못된 요청입니다." };

  const { data: existing, error: fetchError } = await supabase
    .from("staff_schedules")
    .select("created_by, title, category, starts_at, all_day")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    if (isMissingStaffSchedulesTable(fetchError)) {
      return { error: "일정 캘린더 마이그레이션(supabase/134)이 아직 적용되지 않았습니다." };
    }
    return { error: fetchError.message };
  }
  if (!existing) return { error: "일정을 찾을 수 없습니다." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isOwner = existing.created_by === user.id;
  const isAdmin = profile?.role === "admin" || profile?.role === "master";
  if (!isOwner && !isAdmin) return { error: "삭제 권한이 없습니다." };

  const { data: participantRows } = await supabase
    .from("staff_schedule_participants")
    .select("user_id")
    .eq("schedule_id", id);
  const participantIds = (participantRows ?? []).map((p) => p.user_id);

  // 참석자 행은 staff_schedule_participants의 ON DELETE CASCADE로 함께 지워진다.
  const { error } = await supabase.from("staff_schedules").delete().eq("id", id);
  if (error) return { error: error.message };

  // 알림 발송이 실패해도 삭제는 이미 끝났으므로 되돌리지 않는다.
  const recipients = participantIds.filter((userId) => userId !== user.id);
  if (recipients.length) {
    const scheduleDateLabel = formatScheduleDateLabel(existing.starts_at, existing.all_day);
    await supabase.from("notifications").insert(
      recipients.map((userId) => ({
        user_id: userId,
        type: "staff_schedule",
        title: `일정 취소: ${existing.title}`,
        body: `${scheduleDateLabel} · ${existing.category}`,
      })),
    );
  }

  revalidatePath("/staff-schedules");
  return { error: null };
}

// DB는 시각을 UTC 문자열("...T02:00:00+00:00")로 돌려주고 화면은 "+09:00" 형태로 보낸다.
// 문자열끼리 비교하면 같은 시각도 다르다고 판정되므로 실제 시점으로 견준다.
function sameInstant(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return a === b;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b;
  return ta === tb;
}

export async function respondToStaffSchedule(
  scheduleId: string,
  response: "accepted" | "declined",
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };
  if (!scheduleId) return { error: "잘못된 요청입니다." };

  const { data: updated, error } = await supabase
    .from("staff_schedule_participants")
    .update({ response, responded_at: new Date().toISOString() })
    .eq("schedule_id", scheduleId)
    .eq("user_id", user.id)
    .select("schedule_id");
  if (error) {
    if (isMissingResponseColumnError(error)) {
      return { error: "참석 요청 마이그레이션(supabase/137)이 아직 적용되지 않았습니다." };
    }
    return { error: error.message };
  }
  if (!updated || updated.length === 0) return { error: "참석자로 지정된 일정이 아닙니다." };

  // 알림은 참고용 부가 기능이라 실패해도 응답 저장 자체는 이미 끝났으므로 되돌리지 않는다.
  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();
  const { data: schedule } = await supabase
    .from("staff_schedules")
    .select("title, created_by")
    .eq("id", scheduleId)
    .maybeSingle();

  if (schedule?.created_by && schedule.created_by !== user.id) {
    const responseLabel = response === "accepted" ? "수락했습니다" : "거절했습니다";
    await supabase.from("notifications").insert({
      user_id: schedule.created_by,
      type: "staff_schedule",
      title: `${profile?.name ?? "참석자"}님이 ${responseLabel}`,
      body: schedule.title,
    });
  }

  revalidatePath("/staff-schedules");
  return { error: null };
}
