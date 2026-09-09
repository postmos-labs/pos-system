import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import MarkAllRead from "./MarkAllRead";
import NotificationRow from "./NotificationRow";

const PAGE_SIZE = 50;

interface Props {
  searchParams: Promise<{ limit?: string }>;
}

export default async function NotificationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const limit = Math.max(PAGE_SIZE, Number(params.limit) || PAGE_SIZE);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: notifications, count } = await supabase
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  const totalCount = count ?? 0;
  const hasMore = totalCount > limit;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-slate-900">알림</h1>
        <MarkAllRead userId={user.id} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-50">
        {notifications?.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-12">알림이 없습니다</p>
        )}
        {notifications?.map((n) => (
          <NotificationRow
            key={n.id}
            id={n.id}
            href={
              n.type === "supply_request"
                ? "/supply-requests"
                : n.ticket_id
                  ? `/tickets/${n.ticket_id}`
                  : n.installation_id
                    ? `/installs?id=${n.installation_id}`
                    : n.franchise_application_id
                      ? `/franchise?id=${n.franchise_application_id}`
                      : "/notifications"
            }
            title={n.title}
            body={n.body}
            createdAtLabel={format(new Date(n.created_at), "M월 d일 HH:mm", { locale: ko })}
            isRead={n.is_read}
          />
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center mt-4">
          <Link
            href={`/notifications?limit=${limit + PAGE_SIZE}`}
            className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors font-medium"
          >
            더 보기
          </Link>
        </div>
      )}
    </div>
  );
}
