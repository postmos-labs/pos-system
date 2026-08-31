"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  KICC_VAN_COMPANY,
  TEAM_LABEL,
  VAN_GROUP_LABEL,
  type TicketTeam,
  type VanGroup,
} from "@/types";
import {
  MEMO_ISSUE_CATEGORIES,
  MEMO_ISSUE_CATEGORY_LABEL,
  MEMO_RESOLUTIONS,
  MEMO_RESOLUTION_LABEL,
} from "@/app/(app)/merchants/merchant360";

interface Props {
  salesId: string;
  role: string;
}

const TEAMS: TicketTeam[] = ["cs", "tech"];

interface MerchantSuggestion {
  id: string;
  business_name: string;
  phone: string | null;
  address: string | null;
  van_company: string | null;
}

// 가맹점 계열 판정(토스계열 = VAN 있고 KICC 아님)에 맞는 저장 값.
// 토스계열은 특정 밴사가 아니라 계열이므로 자리표시 값 "토스"를 넣는다.
const VAN_GROUP_VALUE: Record<VanGroup, string> = {
  toss: "토스",
  kicc: KICC_VAN_COMPANY,
};
const VAN_GROUPS: VanGroup[] = ["toss", "kicc"];
const CHANNELS = ["채널톡", "유선"];

// 마이그레이션(123 team / 124 AS 구분 / 125 reception_channel·progress_note)이 아직 적용되지
// 않은 환경에서 해당 컬럼을 insert하면 "column does not exist"(42703/PGRST204) 에러가 난다.
// 등록 자체를 막지 않도록, 에러 메시지에서 없는 컬럼명을 찾아 그 컬럼만 빼고 재시도한다.
function isMissingColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist/i.test(error.message ?? "")
  );
}

// PGRST204: "Could not find the 'team' column of 'tickets' in the schema cache"
// 42703:    'column "team" of relation "tickets" does not exist'
function missingColumnName(error: { message?: string } | null): string | null {
  const message = error?.message ?? "";
  return (
    /Could not find the '([^']+)' column/.exec(message)?.[1] ??
    /column "([^"]+)"/.exec(message)?.[1] ??
    null
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
    inquiry: string;
    answer: string;
    issue_category: string;
    resolution: string;
    is_repeat: boolean | null;
    van_group: VanGroup | "";
  }>({
    business_name: "",
    phone: "",
    team: "",
    reception_channel: "",
    inquiry: "",
    answer: "",
    issue_category: "",
    resolution: "",
    is_repeat: null,
    van_group: "",
  });

  // 같은 가게의 인입마다 가맹점이 새로 생기지 않도록, 상호명 입력 시 기존 가맹점을
  // 검색해 연결할 수 있게 한다. 연결하면 merchants insert를 건너뛴다.
  const [linkedMerchant, setLinkedMerchant] = useState<MerchantSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<MerchantSuggestion[]>([]);

  useEffect(() => {
    if (linkedMerchant) return;
    const term = form.business_name.trim();
    const timer = setTimeout(async () => {
      if (!term) {
        setSuggestions([]);
        return;
      }
      const supabase = createClient();
      // .or() 안에서 쉼표·괄호·따옴표·백슬래시는 문법 문자라 그대로 넘기면 쿼리가 깨진다.
      // 가맹점 360(merchants/page.tsx applySearch)에서 검증된 방식 — 문법 문자를 제거하고 비인용 패턴을 쓴다.
      const safe = term.replace(/[,()"'\\%*_]/g, "");
      if (!safe) {
        setSuggestions([]);
        return;
      }
      const { data, error } = await supabase
        .from("merchants")
        .select("id,business_name,phone,address,van_company")
        .or(`business_name.ilike.%${safe}%,phone.ilike.%${safe}%`)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) console.error("가맹점 검색 실패:", error.message);
      setSuggestions((data as MerchantSuggestion[]) ?? []);
    }, 300);
    return () => clearTimeout(timer);
  }, [form.business_name, linkedMerchant]);

  // 상호명 안내 문구용 — 동일 상호명이 제안에 있으면 등록 시 그 가맹점에 자동 연결된다.
  const trimmedName = form.business_name.trim();
  const exactNameMatch =
    !linkedMerchant &&
    !!trimmedName &&
    suggestions.some((m) => m.business_name.toLowerCase() === trimmedName.toLowerCase());

  // 기술지원팀 인입은 AS 구분 3종을 모두 선택해야 등록할 수 있다.
  const asIncomplete =
    form.team === "tech" && (!form.issue_category || !form.resolution || form.is_repeat === null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.team || !form.reception_channel || asIncomplete) return;
    setLoading(true);
    const supabase = createClient();

    // 기존 가맹점을 연결했으면 그대로 쓰고, 아니면 동일 상호명을 먼저 찾아 재사용한다.
    // 제안을 클릭하지 않고 이름만 입력해도 같은 가맹점에 매핑되도록 하기 위함.
    // merchants.owner_name은 NOT NULL이라 신규 생성 시 빈 값을 넘기고 가맹점 360에서 채운다.
    let merchantId: string;
    let createdMerchant = false;
    // 계열을 골랐고 연결/재사용한 가맹점의 VAN이 비어 있으면 채운다 (기존 값은 봉인).
    let fillVanCompany = false;
    if (linkedMerchant) {
      merchantId = linkedMerchant.id;
      fillVanCompany = !linkedMerchant.van_company;
    } else {
      // 대소문자만 다른 중복 생성을 막기 위해 ilike로 정확 일치(와일드카드 이스케이프)를 찾는다.
      const exactPattern = form.business_name.trim().replace(/[\%_]/g, (m) => "\\" + m);
      const { data: exact } = await supabase
        .from("merchants")
        .select("id,van_company")
        .ilike("business_name", exactPattern)
        .order("created_at", { ascending: false })
        .limit(1);

      if (exact && exact.length > 0) {
        merchantId = exact[0].id;
        fillVanCompany = !exact[0].van_company;
      } else {
        const { data: merchantData, error: merchantError } = await supabase
          .from("merchants")
          .insert({
            business_name: form.business_name.trim(),
            owner_name: "",
            phone: form.phone,
            sales_id: salesId,
            van_company: form.van_group ? VAN_GROUP_VALUE[form.van_group] : null,
          })
          .select("id")
          .single();

        if (merchantError || !merchantData) {
          alert("가맹점 등록 실패: " + merchantError?.message);
          setLoading(false);
          return;
        }
        merchantId = merchantData.id;
        createdMerchant = true;
      }
    }

    // 처리를 다 끝낸 뒤 기록하는 로그이므로 상태는 바로 "완료"로 저장한다.
    // 문의내용이 목록 제목(title) 역할을 하고, 답변내용은 progress_note를 재사용한다.
    const ticketPayload = {
      merchant_id: merchantId,
      title: form.inquiry,
      type: "install",
      priority: "normal",
      reception_channel: form.reception_channel,
      progress_note: form.answer || null,
      sales_id: role === "sales" ? salesId : null,
      cs_id: role === "cs" ? salesId : null,
      // 기술지원 목록은 tech_id로 거르므로(tickets/page.tsx), 비워두면 등록자가
      // 방금 올린 건을 자기 목록에서 못 본다. sales/cs와 같은 규칙으로 채운다.
      tech_id: role === "tech" ? salesId : null,
      status: "done",
    };

    // 어떤 컬럼이 없어도 등록이 실패하지 않도록, 없는 컬럼을 하나씩 빼며 재시도한다.
    const payload: Record<string, unknown> = {
      ...ticketPayload,
      team: form.team,
      ...(form.team === "tech"
        ? {
            issue_category: form.issue_category,
            resolution: form.resolution,
            is_repeat: form.is_repeat,
          }
        : {}),
    };

    let ticket: { id: string } | null = null;
    let error: { code?: string; message?: string } | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const res = await supabase.from("tickets").insert(payload).select("id").single();
      ticket = res.data;
      error = res.error;
      if (!isMissingColumnError(error)) break;
      const missing = missingColumnName(error);
      if (!missing || !(missing in payload)) break;
      delete payload[missing];
    }

    if (error || !ticket) {
      // 이번 등록에서 새로 만든 가맹점일 때만 롤백한다. 기존 가맹점은 건드리지 않는다.
      if (createdMerchant) await supabase.from("merchants").delete().eq("id", merchantId);
      alert("등록 실패: " + error?.message);
      setLoading(false);
      return;
    }

    if (!createdMerchant && fillVanCompany && form.van_group) {
      const { error: vanError } = await supabase
        .from("merchants")
        .update({ van_company: VAN_GROUP_VALUE[form.van_group] })
        .eq("id", merchantId);
      if (vanError) console.error("VAN 계열 기록 실패:", vanError.message);
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
          {linkedMerchant ? (
            <div>
              <Label>가맹점</Label>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {linkedMerchant.business_name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {linkedMerchant.phone || "-"}
                    {linkedMerchant.van_company ? ` · ${linkedMerchant.van_company}` : ""}
                    {linkedMerchant.address ? ` · ${linkedMerchant.address}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLinkedMerchant(null)}
                  className="shrink-0 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  연결 해제
                </button>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">
                기존 가맹점에 연결됩니다. 새 가맹점을 만들지 않습니다.
              </p>
            </div>
          ) : (
            <>
              <div className="relative">
                <Label>상호명 *</Label>
                <input
                  type="text"
                  required
                  value={form.business_name}
                  onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
                  className={INPUT}
                  placeholder="입력하면 기존 가맹점을 검색합니다"
                />
                {suggestions.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {suggestions.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setLinkedMerchant(m);
                            setSuggestions([]);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-blue-50"
                        >
                          <p className="text-sm font-medium text-gray-900">{m.business_name}</p>
                          <p className="text-xs text-gray-500">
                            {m.phone || "-"}
                            {m.address ? ` · ${m.address}` : ""}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {trimmedName &&
                  (exactNameMatch ? (
                    <p className="mt-1 text-[11px] text-blue-600">
                      동일 상호명 가맹점이 있어 등록 시 그 가맹점에 연결됩니다.
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-gray-400">
                      일치하는 가맹점이 없으면 등록 시 새 가맹점이 함께 등록됩니다. 기존 가맹점이면
                      목록에서 선택해 연결하세요.
                    </p>
                  ))}
              </div>

              <div>
                <Label>연락처</Label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className={INPUT}
                />
              </div>
            </>
          )}

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

          {!(linkedMerchant && linkedMerchant.van_company) && (
            <div>
              <Label>VAN 계열 (선택)</Label>
              <div className="grid grid-cols-2 gap-2">
                {VAN_GROUPS.map((group) => (
                  <button
                    key={group}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, van_group: f.van_group === group ? "" : group }))
                    }
                    aria-pressed={form.van_group === group}
                    className={`py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                      form.van_group === group
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {VAN_GROUP_LABEL[group]}
                  </button>
                ))}
              </div>
            </div>
          )}

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

          {form.team === "tech" && (
            <>
              <div>
                <Label>무엇이 문제였나요? *</Label>
                <div className="grid grid-cols-3 gap-2">
                  {MEMO_ISSUE_CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, issue_category: c }))}
                      aria-pressed={form.issue_category === c}
                      className={`py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                        form.issue_category === c
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {MEMO_ISSUE_CATEGORY_LABEL[c]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>어떻게 해결했나요? *</Label>
                <div className="grid grid-cols-3 gap-2">
                  {MEMO_RESOLUTIONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, resolution: r }))}
                      aria-pressed={form.resolution === r}
                      className={`py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                        form.resolution === r
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {MEMO_RESOLUTION_LABEL[r]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>처음인가요? *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      [false, "처음"],
                      [true, "또 그럼"],
                    ] as [boolean, string][]
                  ).map(([value, label]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, is_repeat: value }))}
                      aria-pressed={form.is_repeat === value}
                      className={`py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                        form.is_repeat === value
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <Label>문의내용 *</Label>
            <textarea
              required
              value={form.inquiry}
              onChange={(e) => setForm((f) => ({ ...f, inquiry: e.target.value }))}
              rows={2}
              className={INPUT + " resize-none"}
              placeholder="예: 메뉴수정 요청"
            />
          </div>

          <div>
            <Label>답변내용</Label>
            <textarea
              value={form.answer}
              onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
              rows={2}
              className={INPUT + " resize-none"}
              placeholder="처리한 내용을 입력하세요 (선택)"
            />
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
          disabled={loading || !form.team || !form.reception_channel || asIncomplete}
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
