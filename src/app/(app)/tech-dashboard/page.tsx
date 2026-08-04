import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TechDashboardClient from "./TechDashboardClient";

export default async function TechDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile || !["tech", "cs", "admin", "master"].includes(profile.role)) redirect("/dashboard");

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const [y, m] = today.split("-").map(Number);
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

  const base = () => supabase.from("installations").select("id", { count: "exact", head: true });

  const [
    { count: totalInstallCount },
    { count: totalAsCount },
    { count: pendingInstallCount },
    { count: completedInstallCount },
    { count: completedAsCount },
    { count: pendingTransferCount },
    { data: weeklyRows },
    { data: calendarInstallRows },
    { data: techProfiles },
    { data: searchRows },
  ] = await Promise.all([
    base()
      .eq("delivery_type", "install")
      .gte("scheduled_date", monthStart)
      .lte("scheduled_date", monthEnd),
    base()
      .eq("delivery_type", "as")
      .gte("scheduled_date", monthStart)
      .lte("scheduled_date", monthEnd),
    base()
      .eq("delivery_type", "install")
      .not("status", "in", "(completed,rejected)")
      .gte("scheduled_date", monthStart)
      .lte("scheduled_date", monthEnd),
    base()
      .eq("delivery_type", "install")
      .eq("status", "completed")
      .gte("scheduled_date", monthStart)
      .lte("scheduled_date", monthEnd),
    base()
      .eq("delivery_type", "as")
      .eq("status", "completed")
      .gte("scheduled_date", monthStart)
      .lte("scheduled_date", monthEnd),
    supabase
      .from("franchise_transfer_approvals")
      .select("id", { count: "exact", head: true })
      .in("status", ["requested", "cs_responsible_approved"]),
    supabase
      .from("installations")
      .select("id, delivery_type, scheduled_date, status")
      .in("delivery_type", ["install", "as"])
      .gte("scheduled_date", monthStart)
      .lte("scheduled_date", monthEnd),
    supabase
      .from("installations")
      .select(
        "id, customer_name, status, scheduled_date, assigned_to, delivery_type, assignee:profiles!installations_assigned_to_fkey(name)",
      )
      .in("delivery_type", ["install", "as"])
      .not("scheduled_date", "is", null),
    supabase.from("profiles").select("id, name").eq("role", "tech"),
    supabase
      .from("installations")
      .select(
        "id, customer_name, contact_name, customer_phone, address, status, delivery_type, scheduled_date, scheduled_time, assigned_to, notes, franchise_application_id, assignee:profiles!installations_assigned_to_fkey(name)",
      )
      .in("delivery_type", ["install", "as"])
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const weeksInMonth: { start: string; end: string; label: string }[] = [];
  {
    const lastDay = new Date(y, m, 0).getDate();
    let weekStart = 1;
    let weekNo = 1;
    while (weekStart <= lastDay) {
      const weekEnd = Math.min(weekStart + 6, lastDay);
      weeksInMonth.push({
        start: `${y}-${String(m).padStart(2, "0")}-${String(weekStart).padStart(2, "0")}`,
        end: `${y}-${String(m).padStart(2, "0")}-${String(weekEnd).padStart(2, "0")}`,
        label: `${weekNo}주`,
      });
      weekStart = weekEnd + 1;
      weekNo++;
    }
  }
  const weeklyBars = weeksInMonth.map((w) => {
    const rowsInWeek = (weeklyRows ?? []).filter(
      (r) => r.scheduled_date && r.scheduled_date >= w.start && r.scheduled_date <= w.end,
    );
    return {
      label: w.label,
      install: rowsInWeek.filter((r) => r.delivery_type === "install").length,
      as: rowsInWeek.filter((r) => r.delivery_type === "as").length,
    };
  });

  const installRate =
    (completedInstallCount ?? 0) + (pendingInstallCount ?? 0) > 0
      ? Math.round(((completedInstallCount ?? 0) / ((totalInstallCount ?? 0) || 1)) * 100)
      : 0;
  const asRate =
    (totalAsCount ?? 0) > 0 ? Math.round(((completedAsCount ?? 0) / (totalAsCount ?? 1)) * 100) : 0;

  return (
    <TechDashboardClient
      profileName={profile.name}
      monthLabel={`${y}년 ${m}월`}
      currentUserId={user.id}
      cards={{
        totalSchedule: (totalInstallCount ?? 0) + (totalAsCount ?? 0),
        totalInstall: totalInstallCount ?? 0,
        totalAs: totalAsCount ?? 0,
        pendingInstall: pendingInstallCount ?? 0,
        completedInstall: completedInstallCount ?? 0,
        completedAs: completedAsCount ?? 0,
        pendingTransfer: pendingTransferCount ?? 0,
      }}
      installRate={installRate}
      asRate={asRate}
      weeklyBars={weeklyBars}
      calendarInstallRows={(calendarInstallRows ?? []) as any}
      techProfiles={(techProfiles ?? []) as any}
      searchRows={(searchRows ?? []) as any}
    />
  );
}
