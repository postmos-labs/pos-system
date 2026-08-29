import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Profile } from "@/types";
import TrashClient from "./TrashClient";

export default async function TicketsTrashPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");
  const p = profile as Profile;
  if (p.role !== "admin" && p.role !== "master" && p.role !== "cs" && !p.can_delete)
    redirect("/tickets");

  const { data: tickets } = await supabase
    .from("tickets")
    .select(
      "*, merchant:merchants(business_name, phone), deleted_by_profile:profiles!tickets_deleted_by_fkey(name)",
    )
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(200);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <Link
          href="/tickets"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-2"
        >
          <ArrowLeft size={14} /> 인입내역으로
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">인입내역 휴지통</h1>
        <p className="text-slate-500 text-sm mt-1">
          삭제된 인입내역 {tickets?.length ?? 0}건 (복구 가능)
        </p>
      </div>

      <TrashClient
        tickets={(tickets ?? []) as any}
        isAdmin={p.role === "admin" || p.role === "master"}
      />
    </div>
  );
}
