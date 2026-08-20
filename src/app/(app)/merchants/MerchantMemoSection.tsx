"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { addMerchantMemo } from "./actions";
import type { MerchantMemoEntry, MerchantMemoStage } from "./merchant360";
import {
  AS_CHECKLIST_SECTIONS,
  MERCHANT_MEMO_ENTRY_TYPE_LABEL,
  isAsChecklistComplete,
  type MerchantMemoEntryType,
} from "@/lib/asChecklist";

function formatMemoDate(value: string) {
  return format(new Date(value), "yyyy. M. d. a h:mm", { locale: ko });
}

const MEMO_STAGE_LABEL: Record<MerchantMemoStage, string> = {
  before_transfer: "이관 전",
  after_transfer: "이관 후",
  after_completion: "설치완료 후",
};

const MEMO_STAGE_CLASS: Record<MerchantMemoStage, string> = {
  before_transfer: "bg-slate-100 text-slate-600",
  after_transfer: "bg-blue-50 text-blue-600",
  after_completion: "bg-emerald-50 text-emerald-600",
};

export default function MerchantMemoSection({
  merchantId,
  memos,
}: {
  merchantId: string;
  memos: MerchantMemoEntry[];
}) {
  const router = useRouter();
  const [memoContent, setMemoContent] = useState("");
  const [memoSubmitting, setMemoSubmitting] = useState(false);
  const [memoEntryType, setMemoEntryType] = useState<MerchantMemoEntryType>("general");
  const [memoChecklist, setMemoChecklist] = useState<Record<string, boolean>>({});

  const isAsEntry = memoEntryType === "as";
  const asChecklistComplete = isAsChecklistComplete(memoChecklist);
  const canSubmitMemo = memoContent.trim().length > 0 && (!isAsEntry || asChecklistComplete);

  function toggleChecklistItem(id: string) {
    setMemoChecklist((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function submitMemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmitMemo) return;

    setMemoSubmitting(true);
    const result = await addMerchantMemo(
      merchantId,
      memoContent,
      memoEntryType,
      isAsEntry ? memoChecklist : null,
    );
    setMemoSubmitting(false);
    if (result.error) {
      alert("메모 등록 실패: " + result.error);
      return;
    }
    if (result.skipped) {
      alert("메모 테이블이 아직 적용되지 않아 저장하지 않았습니다.");
      return;
    }
    setMemoContent("");
    setMemoEntryType("general");
    setMemoChecklist({});
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 md:px-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-900">메모 히스토리</h3>
        <span className="text-xs text-slate-400">{memos.length}건</span>
      </div>
      <form
        onSubmit={submitMemo}
        className="mt-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3"
      >
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(MERCHANT_MEMO_ENTRY_TYPE_LABEL) as MerchantMemoEntryType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setMemoEntryType(type)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                memoEntryType === type
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {MERCHANT_MEMO_ENTRY_TYPE_LABEL[type]}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
          <textarea
            value={memoContent}
            onChange={(event) => setMemoContent(event.target.value)}
            placeholder="새 히스토리를 입력하세요"
            rows={2}
            maxLength={2000}
            className="min-h-16 flex-1 resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="submit"
            disabled={memoSubmitting || !canSubmitMemo}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {memoSubmitting ? "등록 중..." : "새 히스토리 추가"}
          </button>
        </div>
        {isAsEntry && (
          <div className="mt-3 max-h-72 space-y-3 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <p className="text-xs font-semibold text-amber-700">
              AS 응대 원칙 체크리스트 — 전 항목을 확인해야 저장할 수 있습니다.
            </p>
            {AS_CHECKLIST_SECTIONS.map((section) => (
              <div key={section.id}>
                <p className="mb-1 text-xs font-bold text-slate-700">{section.title}</p>
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <li key={item.id}>
                      <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={memoChecklist[item.id] === true}
                          onChange={() => toggleChecklistItem(item.id)}
                          className="mt-0.5 size-3.5 shrink-0"
                        />
                        <span>{item.label}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!asChecklistComplete && (
              <p className="text-[11px] font-semibold text-red-500">
                체크되지 않은 항목이 있습니다. 모두 확인해야 저장됩니다.
              </p>
            )}
          </div>
        )}
      </form>
      {memos.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">등록된 메모가 없습니다.</p>
      ) : (
        <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-slate-200">
          <div className="divide-y divide-slate-100">
            {memos.map((memo) => (
              <article key={memo.id} className="px-3.5 py-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                  <span
                    className={`rounded-full px-2 py-1 font-semibold ${MEMO_STAGE_CLASS[memo.stage]}`}
                  >
                    {MEMO_STAGE_LABEL[memo.stage]}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600">
                    {MERCHANT_MEMO_ENTRY_TYPE_LABEL[memo.entry_type]}
                  </span>
                  <time dateTime={memo.created_at}>{formatMemoDate(memo.created_at)}</time>
                  <span>·</span>
                  <span>{memo.author_name ?? "기존 기록"}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-5 text-slate-700">
                  {memo.content}
                </p>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
