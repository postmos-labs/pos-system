import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CalendarClient from "./CalendarClient";

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile },
    { data: tickets },
    { data: franchiseRows },
    { data: wooRows },
    { data: manualEvents },
    { data: installRows },
    { data: techUsers },
  ] = await Promise.all([
    supabase.from("profiles").select("id, approval_role").eq("id", user.id).single(),
    supabase
      .from("tickets")
      .select(
        "id, title, type, status, scheduled_at, install_date, open_date, card_apply_date, tech_id, sales_id, merchant:merchants(business_name), tech:profiles!tickets_tech_id_fkey(name), sales:profiles!tickets_sales_id_fkey(name)",
      )
      .not("status", "eq", "canceled")
      .or(
        "scheduled_at.not.is.null,install_date.not.is.null,open_date.not.is.null,card_apply_date.not.is.null",
      ),
    supabase
      .from("franchise_applications")
      .select(
        "id, business_name, status, open_date, install_date, sales_id, sales:profiles!franchise_applications_sales_id_fkey(name)",
      )
      .neq("status", "toss_review_done")
      .or("open_date.not.is.null,install_date.not.is.null"),
    supabase
      .from("woo_customers")
      .select("id, business_name, manager, open_date")
      .not("open_date", "is", null),
    supabase
      .from("calendar_events")
      .select(
        "id, date, title, memo, category, assigned_to, created_by, assignee:profiles!calendar_events_assigned_to_fkey(name)",
      ),
    supabase
      .from("installations")
      .select(
        "id, customer_name, status, scheduled_date, assigned_to, delivery_type, assignee:profiles!installations_assigned_to_fkey(name)",
      )
      .not("scheduled_date", "is", null),
    supabase.from("profiles").select("id, name").eq("role", "tech"),
  ]);

  const isResponsibleOrLead =
    profile?.approval_role === "team_lead" || !!profile?.approval_role?.endsWith("_responsible");

  return (
    <div className="flex flex-col p-6 h-screen gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">캘린더</h1>
        <p className="text-sm text-slate-500 mt-0.5">설치·일정 관리</p>
      </div>
      <div className="flex-1 overflow-hidden">
        <CalendarClient
          tickets={(tickets ?? []) as any}
          franchiseRows={(franchiseRows ?? []) as any}
          wooRows={(wooRows ?? []) as any}
          manualEvents={(manualEvents ?? []) as any}
          installRows={(installRows ?? []) as any}
          techProfiles={(techUsers ?? []) as any}
          currentUserId={user.id}
          canViewAssigned={isResponsibleOrLead}
        />
      </div>
    </div>
  );
}
