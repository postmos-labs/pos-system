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
  const { error: deleteError } = await supabase.rpc("delete_user_account", { p_user_id: userId });

  if (deleteError?.code === "PGRST202") {
    const nullifyTargets: [string, string][] = [
      ["merchants", "sales_id"],
      ["tickets", "sales_id"],
      ["tickets", "cs_id"],
      ["tickets", "tech_id"],
      ["tickets", "deleted_by"],
      ["ticket_logs", "user_id"],
      ["contact_logs", "user_id"],
      ["attachments", "user_id"],
      ["franchise_applications", "sales_id"],
      ["franchise_applications", "cs_id"],
      ["franchise_applications", "tech_id"],
      ["franchise_applications", "created_by"],
      ["franchise_application_logs", "user_id"],
      ["change_requests", "sales_id"],
      ["change_requests", "cs_id"],
      ["change_requests", "created_by"],
      ["calendar_events", "created_by"],
      ["contracts", "created_by"],
      ["install_blueprints", "created_by"],
      ["install_blueprints", "updated_by"],
      ["inventory_items", "user_id"],
      ["inventory_logs", "user_id"],
      ["notification_logs", "user_id"],
      ["installation_activity_logs", "user_id"],
      ["installation_activity_logs", "from_assigned_to"],
      ["installation_activity_logs", "to_assigned_to"],
      ["franchise_transfer_approvals", "approved_by"],
      ["franchise_transfer_approvals", "cs_approved_by"],
      ["installation_completion_approvals", "approved_by"],
      ["installation_completion_approvals", "responsible_approved_by"],
    ];

    for (const [table, column] of nullifyTargets) {
      await supabase
        .from(table)
        .update({ [column]: null })
        .eq(column, userId);
    }

    for (const [table, column] of [
      ["franchise_transfer_approvals", "requested_by"],
      ["installation_completion_approvals", "requested_by"],
    ] as [string, string][]) {
      await supabase.from(table).delete().eq(column, userId);
    }

    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
    if (authDeleteError) return { error: "계정 삭제 실패(인증): " + authDeleteError.message };

    revalidatePath("/admin/users");
    return { error: null };
  }
  if (deleteError) return { error: "계정 삭제 실패: " + deleteError.message };

  revalidatePath("/admin/users");
  return { error: null };

  /*
  const authError = await requireAdmin()
  if (authError) return { error: authError }

  const sessionClient = await createClient()
  const { data: { user } } = await sessionClient.auth.getUser()
  if (user?.id === userId) return { error: '본인 계정은 삭제할 수 없습니다.' }

  const supabase = createAdminClient()

  // profiles.id는 다른 여러 테이블에서 FK로 참조되는데 대부분 ON DELETE 액션이 없어
  // 그대로 삭제하면 FK 제약 위반으로 실패하고 계정이 DB에 그대로 남는다.
  // 참조를 먼저 NULL 처리해 실제 삭제가 항상 완료되도록 한다.
  const nullifyTargets: [string, string][] = [
    ['merchants', 'sales_id'],
    ['tickets', 'sales_id'],
    ['tickets', 'cs_id'],
    ['tickets', 'tech_id'],
    ['tickets', 'deleted_by'],
    ['ticket_logs', 'user_id'],
    ['contact_logs', 'user_id'],
    ['attachments', 'user_id'],
    ['franchise_applications', 'sales_id'],
    ['franchise_applications', 'cs_id'],
    ['franchise_applications', 'tech_id'],
    ['franchise_applications', 'created_by'],
    ['franchise_application_logs', 'user_id'],
    ['change_requests', 'sales_id'],
    ['change_requests', 'cs_id'],
    ['change_requests', 'created_by'],
    ['calendar_events', 'created_by'],
    ['install_blueprints', 'created_by'],
    ['install_blueprints', 'updated_by'],
    ['inventory_items', 'user_id'],
    ['inventory_logs', 'user_id'],
    ['notification_logs', 'user_id'],
  ]
  for (const [table, column] of nullifyTargets) {
    await supabase.from(table).update({ [column]: null }).eq(column, userId)
  }

  // 채팅 관련 테이블은 NOT NULL FK라 NULL 처리 대신 행 자체를 삭제해야 한다.
  const { data: rooms } = await supabase.from('dm_rooms').select('id').or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
  const roomIds = (rooms ?? []).map(r => r.id)
  if (roomIds.length) {
    await supabase.from('dm_messages').delete().in('room_id', roomIds)
    await supabase.from('dm_rooms').delete().in('id', roomIds)
  }
  await supabase.from('dm_messages').delete().eq('user_id', userId)
  await supabase.from('messages').delete().eq('user_id', userId)

  const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId)
  if (authDeleteError) return { error: '계정 삭제 실패(인증): ' + authDeleteError.message }

  const { error: profileError } = await supabase.from('profiles').delete().eq('id', userId)
  if (profileError) return { error: '계정 삭제 실패(프로필): ' + profileError.message }

  revalidatePath('/admin/users')
  return { error: null }
  */
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
