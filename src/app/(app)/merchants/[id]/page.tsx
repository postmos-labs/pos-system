import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ArrowLeft, MapPin, Phone } from "lucide-react";
import {
  STATUS_LABEL,
  STATUS_COLOR,
  TYPE_LABEL,
  type TicketStatus,
  type TicketType,
} from "@/types";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MerchantDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: merchant }, { data: tickets }] = await Promise.all([
    supabase
      .from("merchants")
      .select("*, sales:profiles!merchants_sales_id_fkey(name)")
      .eq("id", id)
      .single(),
    supabase
      .from("tickets")
      .select("id, title, type, status, created_at")
      .eq("merchant_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!merchant) notFound();

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <Link
        href="/merchants"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        <ArrowLeft size={14} /> 가맹점 목록
      </Link>

      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">{merchant.business_name}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{merchant.owner_name}</p>
          </div>
          {merchant.pos_model && (
            <span className="text-xs bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
              {merchant.pos_model}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5 text-sm text-slate-700">
          <span className="flex items-center gap-1.5">
            <Phone size={13} />
            {merchant.phone}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin size={13} />
            {merchant.address}
            {merchant.address_detail ? ` ${merchant.address_detail}` : ""}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500">
          <span>사업자번호: {merchant.business_number || "-"}</span>
          <span>서비스 종류: {merchant.service_type || "-"}</span>
          <span>담당 영업: {merchant.sales?.name ?? "-"}</span>
          <span>등록일: {format(new Date(merchant.created_at), "yyyy.M.d", { locale: ko })}</span>
        </div>
      </div>

      <h2 className="text-sm font-semibold text-slate-900 mb-2">
        작업 내역 ({tickets?.length ?? 0})
      </h2>
      <div className="flex flex-col gap-2">
        {(tickets ?? []).map((t) => (
          <Link
            key={t.id}
            href={`/tickets/${t.id}`}
            className="flex items-center justify-between bg-white rounded-lg border border-slate-200 px-3 py-2.5 hover:shadow-sm transition-shadow"
          >
            <div>
              <p className="text-sm font-medium text-slate-900">{t.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {TYPE_LABEL[t.type as TicketType]} ·{" "}
                {format(new Date(t.created_at), "M/d", { locale: ko })}
              </p>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[t.status as TicketStatus]}`}
            >
              {STATUS_LABEL[t.status as TicketStatus]}
            </span>
          </Link>
        ))}
        {(!tickets || tickets.length === 0) && (
          <p className="text-sm text-slate-400 text-center py-6">등록된 작업이 없습니다</p>
        )}
      </div>
    </div>
  );
}
