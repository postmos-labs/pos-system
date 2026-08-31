"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  searchMerchantCandidates,
  type CandidateField,
  type MerchantCandidate,
} from "@/lib/merchantCandidates";
import { linkWooCustomerToMerchant } from "@/app/(app)/woo/actions";
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

// 컬럼이 없어 저장되지 못한 항목을 직원이 알아볼 수 있는 이름으로 알린다.
const DROPPED_COLUMN_LABEL: Record<string, string> = {
  team: "담당팀",
  reception_channel: "인입 채널",
  progress_note: "처리 내용",
  resolution_steps: "해결 절차",
  issue_category: "문제 유형",
  resolution: "해결 방식",
  is_repeat: "반복 여부",
};

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
    resolution_steps: string;
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
    resolution_steps: "",
    is_repeat: null,
    van_group: "",
  });

  // 가맹점 연결은 사용자가 직접 하게 한다. 저장 시점에 시스템이 상호·번호로 추측해
  // 붙이던 예전 방식은 같은 상호/같은 번호가 여럿일 때 엉뚱한 가맹점에 붙었다.
  // 상태는 셋 중 하나 — 검색 중 / 기존 가맹점 연결됨 / 새 가맹점으로 등록.
  const [linkedMerchant, setLinkedMerchant] = useState<MerchantSuggestion | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [searchField, setSearchField] = useState<CandidateField>("phone");
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<MerchantCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  async function runSearch() {
    if (!searchTerm.trim()) return;
    setSearching(true);
    setResults(await searchMerchantCandidates(searchField, searchTerm));
    setSearched(true);
    setSearching(false);
  }

  // 우국상 고객을 고르면 가맹점으로 만든 뒤 그 가맹점에 연결한다.
  async function chooseCandidate(candidate: MerchantCandidate) {
    if (candidate.source === "merchant") {
      setLinkedMerchant({
        id: candidate.id,
        business_name: candidate.business_name,
        phone: candidate.phone,
        address: candidate.address,
        van_company: candidate.van_company,
      });
      return;
    }

    setSearching(true);
    const linked = await linkWooCustomerToMerchant(candidate.id);
    setSearching(false);
    if (linked.error || !linked.merchantId) {
      alert("가맹점 연결 실패: " + (linked.error ?? "알 수 없는 오류"));
      return;
    }
    setLinkedMerchant({
      id: linked.merchantId,
      business_name: candidate.business_name,
      phone: candidate.phone,
      address: candidate.address,
      van_company: candidate.van_company,
    });
  }

  // 검색해서 없을 때만 새 가맹점으로 넘어간다. 방금 검색한 값을 그대로 채워준다.
  function startNewMerchant() {
    setForm((f) => ({
      ...f,
      business_name: searchField === "business_name" ? searchTerm.trim() : f.business_name,
      phone: searchField === "phone" ? searchTerm.trim() : f.phone,
    }));
    setCreatingNew(true);
  }

  function resetMerchant() {
    setLinkedMerchant(null);
    setCreatingNew(false);
    setResults([]);
    setSearched(false);
  }

  // tickets.merchant_id가 NOT NULL이라 가맹점을 정하기 전에는 저장할 수 없다.
  const merchantChosen = !!linkedMerchant || (creatingNew && !!form.business_name.trim());

  // 기술지원팀 인입은 AS 구분 3종을 모두 선택해야 등록할 수 있다.
  const asIncomplete =
    form.team === "tech" && (!form.issue_category || !form.resolution || form.is_repeat === null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.team || !form.reception_channel || asIncomplete || !merchantChosen) return;
    setLoading(true);
    const supabase = createClient();

    // 가맹점은 사용자가 이미 정해둔 상태다 — 검색해서 연결했거나, 새로 등록하기로 골랐거나.
    let merchantId: string;
    let createdMerchant = false;
    // 계열을 골랐고 연결/재사용한 가맹점의 VAN이 비어 있으면 채운다 (기존 값은 봉인).
    let fillVanCompany = false;
    if (linkedMerchant) {
      merchantId = linkedMerchant.id;
      fillVanCompany = !linkedMerchant.van_company;
    } else {
      // 여기 오는 경우는 "새 가맹점으로 등록"을 명시적으로 고른 때뿐이다.
      // merchants.owner_name은 NOT NULL이라 빈 값을 넣고 가맹점 360에서 채운다.
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
            resolution_steps: form.resolution_steps.trim() || null,
          }
        : {}),
    };

    let ticket: { id: string } | null = null;
    let error: { code?: string; message?: string } | null = null;
    // 마이그레이션이 밀려 컬럼이 없으면 그 값을 빼고 등록한다. 다만 조용히 버리면
    // 직원이 적은 내용이 사라진 걸 아무도 모르므로, 무엇이 빠졌는지 모아 알린다.
    const droppedColumns: string[] = [];
    for (let attempt = 0; attempt < 8; attempt++) {
      const res = await supabase.from("tickets").insert(payload).select("id").single();
      ticket = res.data;
      error = res.error;
      if (!isMissingColumnError(error)) break;
      const missing = missingColumnName(error);
      if (!missing || !(missing in payload)) break;
      delete payload[missing];
      droppedColumns.push(missing);
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

    if (droppedColumns.length > 0) {
      const names = droppedColumns.map((column) => DROPPED_COLUMN_LABEL[column] ?? column);
      alert(
        "인입내역은 등록되었지만 아래 항목은 저장되지 않았습니다." +
          "\n" +
          "\n" +
          names.join(", ") +
          "\n" +
          "\n" +
          "관리자에게 알려주세요. (DB 준비가 아직 안 된 항목입니다)",
      );
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
                  onClick={resetMerchant}
                  className="shrink-0 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  다시 검색
                </button>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">
                기존 가맹점에 연결됩니다. 새 가맹점을 만들지 않습니다.
              </p>
            </div>
          ) : creatingNew ? (
            <>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs font-medium text-amber-700">
                  새 가맹점으로 등록합니다. 저장할 때 함께 만들어집니다.
                </p>
                <button
                  type="button"
                  onClick={resetMerchant}
                  className="shrink-0 text-xs font-medium text-amber-700 hover:text-amber-900"
                >
                  다시 검색
                </button>
              </div>

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
                <Label>연락처</Label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className={INPUT}
                />
              </div>
            </>
          ) : (
            <div>
              <Label>가맹점 *</Label>

              <div className="mb-2 flex w-fit gap-1 rounded-lg bg-gray-100 p-1">
                {(
                  [
                    ["phone", "전화번호로 검색"],
                    ["business_name", "상호명으로 검색"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setSearchField(value);
                      setResults([]);
                      setSearched(false);
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      searchField === value
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setSearched(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void runSearch();
                    }
                  }}
                  className={INPUT}
                  placeholder={searchField === "phone" ? "010-1234-5678" : "가맹점 상호명"}
                />
                <button
                  type="button"
                  onClick={() => void runSearch()}
                  disabled={searching || !searchTerm.trim()}
                  className="shrink-0 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40"
                >
                  {searching ? "검색 중" : "검색"}
                </button>
              </div>

              {results.length > 0 && (
                <ul className="mt-2 max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
                  {results.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => void chooseCandidate(m)}
                        className="w-full px-3 py-2 text-left hover:bg-blue-50"
                      >
                        <p className="text-sm font-medium text-gray-900">
                          {m.business_name}
                          {m.source === "woo" && (
                            <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
                              우국상
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          {m.phone || "-"}
                          {m.address ? ` · ${m.address}` : ""}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {searched && results.length === 0 && (
                <div className="mt-2 rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center">
                  <p className="text-sm text-gray-500">검색 결과가 없습니다.</p>
                  <button
                    type="button"
                    onClick={startNewMerchant}
                    className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    + 새 가맹점으로 등록
                  </button>
                </div>
              )}

              {!searched && (
                <p className="mt-1 text-[11px] text-gray-400">
                  검색해서 기존 가맹점을 연결하거나, 결과가 없으면 새로 등록합니다.
                </p>
              )}
            </div>
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
            <Label>{form.team === "tech" ? "처리 내용" : "답변내용"}</Label>
            <textarea
              value={form.answer}
              onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
              rows={2}
              className={INPUT + " resize-none"}
              placeholder={
                form.team === "tech"
                  ? "이번 건에 무슨 일이 있었는지 적어주세요 (선택)"
                  : "처리한 내용을 입력하세요 (선택)"
              }
            />
          </div>

          {/* 해결 절차는 재사용을 전제로 한 칸이라 기술지원 건에서만 받는다.
              처리 내용(경위)과 섞이면 챗봇 학습 자료에 가맹점 정보가 딸려 들어간다. */}
          {form.team === "tech" && (
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label>해결 절차</Label>
                <span className="text-[11px] font-medium text-blue-600">
                  챗봇 학습에 사용됩니다
                </span>
              </div>
              <textarea
                value={form.resolution_steps}
                onChange={(e) => setForm((f) => ({ ...f, resolution_steps: e.target.value }))}
                rows={4}
                className={INPUT + " resize-none"}
                placeholder={
                  "1) 포스 좌측 상단 [메뉴] 클릭\n2) [설정] -> [결제] 탭 이동\n3) [단말기 재연결] 버튼 클릭"
                }
              />
              <p className="mt-1 text-[11px] text-gray-500">
                같은 문제가 또 왔을 때 다른 사람이 그대로 따라 할 수 있게, 화면에 쓰인 버튼 이름
                그대로 순서대로 적어주세요. 가맹점 이름·전화번호 등 특정 정보는 쓰지 마세요.
              </p>
            </div>
          )}
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
          disabled={
            loading || !form.team || !form.reception_channel || asIncomplete || !merchantChosen
          }
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
