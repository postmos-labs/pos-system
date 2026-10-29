import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import SurveysClient, { type SurveyListRow } from "./SurveysClient";

export default async function SurveysPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("franchise_surveys")
    .select("*, franchise:franchise_applications(id, business_name, owner_name, phone)")
    .not("sent_at", "is", null)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("sent_at", { ascending: false })
    .limit(1000);

  return (
    <SurveysClient
      rows={error ? [] : ((data ?? []) as unknown as SurveyListRow[])}
      unavailable={!!error}
    />
  );
}
