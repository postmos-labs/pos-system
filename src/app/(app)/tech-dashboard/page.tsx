import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TechDashboardClient from "./TechDashboardClient";
import { fetchTechStats, monthRange } from "./stats";

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
  const { start: dateFrom, end: dateTo } = monthRange(y, m);

  const [stats, { data: calendarInstallRows }, { data: techProfiles }, { data: searchRows }] =
    await Promise.all([
      fetchTechStats(supabase, dateFrom, dateTo),
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
          "id, customer_name, contact_name, customer_phone, address, status, delivery_type, scheduled_date, scheduled_time, assigned_to, notes, franchise_application_id, created_at, assignee:profiles!installations_assigned_to_fkey(name)",
        )
        .in("delivery_type", ["install", "as"])
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

  return (
    <TechDashboardClient
      profileName={profile.name}
      currentUserId={user.id}
      initialDateFrom={dateFrom}
      initialDateTo={dateTo}
      initialStats={stats}
      calendarInstallRows={(calendarInstallRows ?? []) as any}
      techProfiles={(techProfiles ?? []) as any}
      searchRows={(searchRows ?? []) as any}
    />
  );
}
