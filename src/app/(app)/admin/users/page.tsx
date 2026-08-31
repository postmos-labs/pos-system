import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import CreateUserForm from "./CreateUserForm";
import UsersList from "./UsersList";
import NoticeButton from "./NoticeButton";

export default async function UsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: users }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase.from("profiles").select("*").order("role").order("name"),
  ]);

  if (!profile || (profile.role !== "admin" && profile.role !== "master")) redirect("/dashboard");

  const emailById: Record<string, string> = {};
  if (users?.length) {
    const adminSupabase = createAdminClient();
    const { data: authList } = await adminSupabase.auth.admin.listUsers({ perPage: 1000 });
    authList?.users.forEach((u) => {
      if (u.email) emailById[u.id] = u.email;
    });
  }

  const usersWithEmail = (users ?? []).map((u) => ({ ...u, email: emailById[u.id] ?? null }));

  // 공지는 사람 단위로 고른다. 팀은 화면에서 한꺼번에 체크하는 단축키로만 쓰인다.
  const noticeMembers = (users ?? []).map((member) => ({
    id: member.id as string,
    name: (member.name as string) ?? "이름 없음",
    team: (member.team as string | null) ?? null,
  }));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">직원 관리</h1>
          <p className="text-slate-500 text-sm mt-1">총 {usersWithEmail.length}명</p>
        </div>
        {/* 공지는 마스터만 보낼 수 있다. 서버 액션도 requireMaster로 같은 조건을 건다. */}
        {profile.role === "master" && <NoticeButton members={noticeMembers} />}
      </div>

      <CreateUserForm />

      <UsersList users={usersWithEmail} currentUserId={user.id} currentUserRole={profile.role} />
    </div>
  );
}
