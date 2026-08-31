"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface MerchantResult {
  id: string;
  business_name: string;
  phone: string | null;
  address: string | null;
}

const COLUMNS = "id,business_name,phone,address";

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
  const [field, setField] = useState<"phone" | "business_name">("phone");
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<MerchantResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [saving, setSaving] = useState(false);

  async function runSearch() {
    const value = term.trim();
    if (!value) return;
    setSearching(true);
    const supabase = createClient();
    // ilike 패턴에서 %·_는 와일드카드다. 문법 문자를 지워 문자 그대로 찾게 한다.
    const safe = value.replace(/[,()"'\\%*_]/g, "");
    let rows: MerchantResult[] = [];

    if (field === "phone") {
      const digits = value.replace(/[^0-9]/g, "");
      if (digits) {
        // 숫자만 남긴 컬럼으로 찾아 형식이 달라도 같은 번호로 취급한다.
        const res = await supabase
          .from("merchants")
          .select(COLUMNS)
          .ilike("phone_digits", `%${digits}%`)
          .order("created_at", { ascending: false })
          .limit(20);
        if (res.error) {
          // 127번 마이그레이션 미적용 환경 — 저장된 형식 그대로 찾는다.
          const fallback = await supabase
            .from("merchants")
            .select(COLUMNS)
            .ilike("phone", `%${safe}%`)
            .order("created_at", { ascending: false })
            .limit(20);
          rows = (fallback.data as MerchantResult[]) ?? [];
        } else {
          rows = (res.data as MerchantResult[]) ?? [];
        }
      }
    } else if (safe) {
      const res = await supabase
        .from("merchants")
        .select(COLUMNS)
        .ilike("business_name", `%${safe}%`)
        .order("created_at", { ascending: false })
        .limit(20);
      rows = (res.data as MerchantResult[]) ?? [];
    }

    setResults(rows);
    setSearched(true);
    setSearching(false);
  }

  async function handleSelect(next: MerchantResult) {
    if (next.id === merchantId) {
      alert("이미 연결된 가맹점입니다.");
      return;
    }
    if (!confirm(`가맹점을 "${next.business_name}"(으)로 바꿉니다.\n계속할까요?`)) return;

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("tickets")
      .update({ merchant_id: next.id })
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

            {searched && results.length === 0 && (
              <p className="mt-3 rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500">
                검색 결과가 없습니다.
              </p>
            )}

            <p className="mt-3 text-[11px] text-gray-400">
              연결만 바꿉니다. 기존 가맹점은 삭제되지 않습니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
