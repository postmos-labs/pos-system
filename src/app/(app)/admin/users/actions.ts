"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireMaster } from "@/lib/auth/require-admin";

const ROLES = ["master", "admin", "sales", "cs", "tech", "developer"];
const APPROVAL_ROLES = [
  "cs_manager",
  "cs_responsible",
  "tech_manager",
  "tech_responsible",
  "team_lead",
  "developer",
  "test_account",
];
const TEAMS = ["sales", "cs", "tech", "dev"];

export async function createUserAccount(form: {
  name: string;
  phone: string;
  password: string;
  role: string;
  team: string;
}) {
  const authError = await requireAdmin();
  if (authError) return { error: authError };

  const name = form.name.trim();
  const password = form.password.trim();
  const phone = form.phone.trim();
  const role = form.role;
  const team = form.team;

  if (!name) return { error: "이름을 입력해주세요." };
  if (password.length < 4) return { error: "비밀번호는 4자 이상이어야 합니다." };
  if (!ROLES.includes(role)) return { error: "올바르지 않은 역할입니다." };
  if (!TEAMS.includes(team)) return { error: "올바르지 않은 팀입니다." };

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("name", name)
    .maybeSingle();
  if (existing) return { error: `이미 "${name}" 이름으로 등록된 계정이 있습니다.` };

  const email = `emp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@pos.local`;

  const { data: authData, error: authCreateError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authCreateError || !authData.user) {
    return { error: "계정 생성 실패: " + (authCreateError?.message ?? "알 수 없는 오류") };
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: authData.user.id,
    name,
    phone: phone || null,
    role,
    team,
  });
  if (profileError) {
    const { error: cleanupError } = await supabase.auth.admin.deleteUser(authData.user.id);
    if (cleanupError) {
      console.error(
        "프로필 생성 실패 후 인증 계정 정리 실패:",
        cleanupError.message,
        "userId:",
        authData.user.id,
      );
      return {
        error:
          "프로필 생성 실패: " +
          profileError.message +
          ` (또한 인증 계정 정리 실패: ${cleanupError.message} — 관리자에게 문의하세요. userId: ${authData.user.id})`,
      };
    }
    return { error: "프로필 생성 실패: " + profileError.message };
  }

  revalidatePath("/admin/users");
  return { error: null };
}

export async function deleteUserAccount(userId: string) {
  const authError = await requireAdmin();
  if (authError) return { error: authError };

  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (user?.id === userId) return { error: "본인 계정은 삭제할 수 없습니다." };

  const supabase = createAdminClient();

  // 삭제는 delete_user_account(supabase/072) 한 곳에서만 처리한다.
  // 이 함수는 profiles를 참조하는 FK를 실행 시점에 DB에서 직접 찾아
  //   NULL 허용 컬럼 -> 값만 비우고 (행은 남김)
  //   NOT NULL 컬럼  -> 행을 삭제
  // 하므로 테이블이 늘어나도 코드를 고칠 필요가 없다.
  //
  // 예전에는 참조 목록을 코드에 손으로 적어둔 폴백이 있었는데, 목록이 낡으면
  // 남은 FK가 auth.users 삭제를 막아 실패하고 "계정 삭제 실패(인증): {}"처럼
  // 원인을 알 수 없는 메시지만 남았다. 반쯤 지워진 계정이 생기는 것도 위험해 없앴다.
  const { error: deleteError } = await supabase.rpc("delete_user_account", { p_user_id: userId });
  if (deleteError) {
    if (deleteError.code === "PGRST202") {
      return {
        error:
          "계정 삭제 함수가 DB에 없습니다. supabase/072_delete_user_account_migration.sql을 실행해주세요.",
      };
    }
    return { error: "계정 삭제 실패: " + deleteError.message };
  }

  revalidatePath("/admin/users");
  return { error: null };
}

export async function setUserRole(userId: string, role: string) {
  const authError = await requireAdmin();
  if (authError) return { error: authError };

  if (!ROLES.includes(role)) return { error: "올바르지 않은 역할입니다." };

  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (user?.id === userId) return { error: "본인 역할은 변경할 수 없습니다." };

  const supabase = createAdminClient();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { error: null };
}

export async function setUserTeam(userId: string, team: string) {
  const authError = await requireAdmin();
  if (authError) return { error: authError };
  if (!TEAMS.includes(team)) return { error: "올바르지 않은 팀입니다." };

  const supabase = createAdminClient();
  const { error } = await supabase.from("profiles").update({ team }).eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { error: null };
}

export async function setUserApprovalRole(userId: string, approvalRole: string) {
  const authError = await requireAdmin();
  if (authError) return { error: authError };
  // 빈 값은 해제를 뜻한다 — APPROVAL_ROLES 검증을 건너뛰고 null로 저장한다.
  if (approvalRole !== "" && !APPROVAL_ROLES.includes(approvalRole))
    return { error: "올바른 승인 직책이 아닙니다." };
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ approval_role: approvalRole === "" ? null : approvalRole })
    .eq("id", userId);
  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { error: null };
}

export async function setUserName(userId: string, name: string) {
  const authError = await requireMaster();
  if (authError) return { error: authError };

  const trimmed = name.trim();
  if (!trimmed) return { error: "이름을 입력해주세요." };

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("name", trimmed)
    .neq("id", userId)
    .maybeSingle();
  if (existing) return { error: `이미 "${trimmed}" 이름으로 등록된 계정이 있습니다.` };

  const { error } = await supabase.from("profiles").update({ name: trimmed }).eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { error: null };
}

export async function setUserDeletePermission(userId: string, canDelete: boolean) {
  const authError = await requireAdmin();
  if (authError) return { error: authError };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ can_delete: canDelete })
    .eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { error: null };
}

// 사내 공지 — 마스터만 보낼 수 있다.
// 알림 기능(/notifications + 실시간 팝업)이 이미 있으므로 그 위에 얹는다.
// 받는 사람은 profiles에 있는 직원 전부다. 이 시스템에서는 계정 삭제가 곧 퇴사 처리라
// 비활성 구분이 따로 없다.
export async function sendNotice(input: { title: string; body: string; team: string }) {
  const authError = await requireMaster();
  if (authError) return { error: authError, sentCount: 0 };

  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) return { error: "제목을 입력해주세요.", sentCount: 0 };
  if (title.length > 100) return { error: "제목은 100자 이하로 입력해주세요.", sentCount: 0 };
  if (!body) return { error: "내용을 입력해주세요.", sentCount: 0 };
  if (body.length > 2000) return { error: "내용은 2,000자 이하로 입력해주세요.", sentCount: 0 };
  if (input.team !== "all" && !TEAMS.includes(input.team)) {
    return { error: "잘못된 대상입니다.", sentCount: 0 };
  }

  const admin = createAdminClient();
  let targetQuery = admin.from("profiles").select("id");
  if (input.team !== "all") targetQuery = targetQuery.eq("team", input.team);
  const { data: targets, error: targetError } = await targetQuery;
  if (targetError) return { error: targetError.message, sentCount: 0 };
  if (!targets || targets.length === 0) return { error: "받을 직원이 없습니다.", sentCount: 0 };

  // 한 사람당 한 행. notifications.user_id는 NOT NULL이고 계정 삭제 시 함께 지워진다.
  const { error } = await admin
    .from("notifications")
    .insert(targets.map((target) => ({ user_id: target.id, type: "notice", title, body })));
  if (error) return { error: error.message, sentCount: 0 };

  revalidatePath("/notifications");
  return { error: null, sentCount: targets.length };
}
