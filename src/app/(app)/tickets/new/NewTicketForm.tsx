"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { TEAM_LABEL, type TicketTeam } from "@/types";

interface Props {
  salesId: string;
  role: string;
}

const TEAMS: TicketTeam[] = ["cs", "tech"];
const CHANNELS = ["카카오톡", "유선"];

// 123번 마이그레이션(tickets.team)이 아직 적용되지 않은 환경에서 team을 insert하면
// "column does not exist"(42703) 에러가 난다. 등록 자체를 막지 않고 team만 빼고 재시도한다.
// src/app/(app)/merchants/actions.ts의 isMissingColumnError와 같은 패턴.
function isMissingColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist/i.test(error.message ?? "")
  );
}

export default function NewTicketForm({ salesId, role }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<{
    business_name: string;
    phone: string;
    team: TicketTeam | "";
    reception_channel: string;
  }>({
    business_name: "",
    phone: "",
    team: "",
    reception_channel: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.team || !form.reception_channel) return;
    setLoading(true);
    const supabase = createClient();

    // merchants.owner_name은 NOT NULL이라 값을 넘겨야 한다. 대표자명은 받지 않으므로
    // 빈 값으로 두고 가맹점 360에서 채운다.
    const { data: merchantData, error: merchantError } = await supabase
      .from("merchants")
      .insert({
        business_name: form.business_name,
        owner_name: "",
        phone: form.phone,
        sales_id: salesId,
      })
      .select("id")
      .single();

    if (merchantError || !merchantData) {
      alert("가맹점 등록 실패: " + merchantError?.message);
      setLoading(false);
      return;
    }

    const merchantId = merchantData.id;

    // tickets.title은 NOT NULL이라 상호명을 그대로 제목으로 쓴다.
    // 처리를 다 끝낸 뒤 기록하는 로그이므로 상태는 바로 "완료"로 저장한다.
    const ticketPayload = {
      merchant_id: merchantId,
      title: form.business_name,
      type: "install",
      priority: "normal",
      reception_channel: form.reception_channel,
      sales_id: role === "sales" ? salesId : null,
      cs_id: role === "cs" ? salesId : null,
      status: "done",
    };

    let { data: ticket, error } = await supabase
      .from("tickets")
      .insert({ ...ticketPayload, team: form.team })
      .select("id")
      .single();

    if (isMissingColumnError(error)) {
      ({ data: ticket, error } = await supabase
        .from("tickets")
        .insert(ticketPayload)
        .select("id")
        .single());
    }

    if (error || !ticket) {
      await supabase.from("merchants").delete().eq("id", merchantId);
      alert("등록 실패: " + error?.message);
      setLoading(false);
      return;
    }

    const { error: logError } = await supabase.from("ticket_logs").insert({
      ticket_id: ticket.id,
      user_id: salesId,
      to_status: "done",
      message: "신규 인입내역 등록",
    });
    if (logError) {
      alert("인입내역은 등록되었지만 이력 기록에 실패했습니다: " + logError.message);
    }

    router.push(`/tickets/${ticket.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Section title="인입 정보">
        <div className="space-y-3">
          <div>
            <Label>상호명 *</Label>
            <input
              type="text"
              required
              value={form.business_name}
              onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
              className={INPUT}
            />
          </div>

          <div>
            <Label>연락처 *</Label>
            <input
              type="text"
              required
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className={INPUT}
            />
          </div>

          <div>
            <Label>인입 채널 *</Label>
            <div className="grid grid-cols-2 gap-2">
              {CHANNELS.map((channel) => (
                <button
                  key={channel}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, reception_channel: channel }))}
                  aria-pressed={form.reception_channel === channel}
                  className={`py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    form.reception_channel === channel
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {channel}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>담당팀 *</Label>
            <div className="grid grid-cols-2 gap-2">
              {TEAMS.map((team) => (
                <button
                  key={team}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, team }))}
                  aria-pressed={form.team === team}
                  className={`py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    form.team === team
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {TEAM_LABEL[team]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <div className="flex gap-3 pb-6">
        <Link
          href="/tickets"
          className="flex-1 text-center py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          취소
        </Link>
        <button
          type="submit"
          disabled={loading || !form.team || !form.reception_channel}
          className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {loading ? "등록 중..." : "인입내역 등록"}
        </button>
      </div>
    </form>
  );
}

const INPUT =
  "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900";

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs text-gray-500 mb-1">{children}</label>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      {children}
    </div>
  );
}
