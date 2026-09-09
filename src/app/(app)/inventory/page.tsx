import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import InventoryClient from "./InventoryClient";

export default async function InventoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, name")
    .eq("id", user.id)
    .single();
  if (!profile || !["master", "admin", "cs", "tech"].includes(profile.role)) redirect("/dashboard");

  const { data: items } = await supabase
    .from("inventory_items")
    .select("*")
    .order("major_category", { ascending: true })
    .order("mid_category", { ascending: true });

  const { data: logs } = await supabase
    .from("inventory_logs")
    .select("*, user:profiles!inventory_logs_user_id_fkey(name)")
    .order("created_at", { ascending: false })
    .limit(300);

  return (
    <InventoryClient
      initialItems={items ?? []}
      initialLogs={logs ?? []}
      currentUserRole={profile.role}
      currentUserName={profile.name ?? ""}
    />
  );
}
