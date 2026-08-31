"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  searchMerchantCandidates,
  type CandidateField,
  type MerchantCandidate,
} from "@/lib/merchantCandidates";
import { linkWooCustomerToMerchant } from "@/app/(app)/woo/actions";

export default function TicketMerchantCard({
  ticketId,
  merchantId,
  businessName,
  phone,
  canEdit,
}: {
  ticketId: string;
  merchantId: string | null;
  businessName: string | null;
  phone: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<CandidateField>("phone");
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<MerchantCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [saving, setSaving] = useState(false);

  async function runSearch() {
    if (!term.trim()) return;
    setSearching(true);
    setResults(await searchMerchantCandidates(field, term));
    setSearched(true);
    setSearching(false);
  }

  async function handleSelect(next: MerchantCandidate) {
    if (next.source === "merchant" && next.id === merchantId) {
      alert("이미 연결된 가맹점입니다.");
      return;
    }
    const notice =
      next.source === "woo" ? "\n\n우국상 고객이라 가맹점으로 등록한 뒤 연결합니다." : "";
    if (!confirm(`가맹점을 "${next.business_name}"(으)로 바꿉니다.${notice}\n계속할까요?`)) return;

    setSaving(true);

    // 인입내역은 merchants만 가리킬 수 있어(FK), 우국상 고객은 먼저 가맹점으로 만든다.
    let targetId = next.id;
    if (next.source === "woo") {
      const linked = await linkWooCustomerToMerchant(next.id);
      if (linked.error || !linked.merchantId) {
        setSaving(false);
        alert("가맹점 연결 실패: " + (linked.error ?? "알 수 없는 오류"));
        return;
      }
      targetId = linked.merchantId;
      if (targetId === merchantId) {
        setSaving(false);
        alert("이미 연결된 가맹점입니다.");
        return;
      }
    }

    const supabase = createClient();
    const { error } = await supabase
      .from("tickets")
      .update({ merchant_id: targetId })
      .eq("id", ticketId);
    if (error) {
      setSaving(false);
      alert("가맹점 변경 실패: " + error.message);
      return;
    }

    // 누가 어느 가맹점으로 옮겼는지 활동 로그에 남긴다.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("ticket_logs").insert({
      ticket_id: ticketId,
      user_id: user?.id ?? null,
      message: `가맹점 변경: ${businessName ?? "-"} → ${next.business_name}`,
    });

    setSaving(false);
    close();
    router.refresh();
  }

  function close() {
    setOpen(false);
    setTerm("");
    setResults([]);
    setSearched(false);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700">가맹점 정보</h2>
        {canEdit && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            가맹점 변경
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-y-2.5 text-sm">
        <div>
          <p className="text-xs text-gray-400">상호명</p>
          {merchantId ? (
            <Link
              href={`/merchants/${merchantId}`}
              className="font-medium text-blue-600 hover:underline"
            >
              {businessName || "-"}
            </Link>
          ) : (
            <p className="font-medium">{businessName || "-"}</p>
          )}
        </div>
        <div>
          <p className="text-xs text-gray-400">연락처</p>
          <p className="font-medium">{phone || "-"}</p>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">가맹점 변경</h3>
              <button type="button" onClick={close} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

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
                    setField(value);
                    setResults([]);
                    setSearched(false);
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    field === value
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
                value={term}
                onChange={(e) => {
                  setTerm(e.target.value);
                  setSearched(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runSearch();
                  }
                }}
                placeholder={field === "phone" ? "010-1234-5678" : "가맹점 상호명"}
                className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => void runSearch()}
                disabled={searching || !term.trim()}
                className="h-9 shrink-0 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40"
              >
                <Search size={14} />
              </button>
            </div>

            {results.length > 0 && (
              <ul className="mt-2 max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
                {results.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleSelect(m)}
                      className="w-full px-3 py-2 text-left hover:bg-blue-50 disabled:opacity-50"
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
              <p className="mt-3 rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500">
                검색 결과가 없습니다.
              </p>
            )}

            <p className="mt-3 text-[11px] text-gray-400">
              연결만 바꿉니다. 기존 가맹점은 삭제되지 않습니다. 우국상 항목을 고르면 가맹점으로
              등록한 뒤 연결합니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
