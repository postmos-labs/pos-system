"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { updateMerchantInstallNote } from "./actions";
import { caseTypeLabel } from "./loadMerchant360";
import type { Merchant360Merchant, MerchantDerivedSummary } from "./merchant360";

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2">
      <p className="text-xs font-semibold text-slate-400">{label}</p>
      <p className="truncate text-sm text-slate-800" title={value || "-"}>
        {value || "-"}
      </p>
    </div>
  );
}

function formatDateOnly(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return format(date, "yyyy-MM-dd", { locale: ko });
}

export default function InstallInfoCard({
  merchant,
  derivedSummary,
  caseType,
}: {
  merchant: Merchant360Merchant;
  derivedSummary: MerchantDerivedSummary | null;
  caseType: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState(merchant.install_note ?? "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const result = await updateMerchantInstallNote(merchant.id, note);
    setSubmitting(false);
    if (result.error) {
      alert("설치 특이사항 수정 실패: " + result.error);
      return;
    }
    if (result.skipped) {
      alert("설치 특이사항 컬럼이 아직 적용되지 않아 저장하지 않았습니다.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  const latest = derivedSummary?.latestInstallation ?? null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 md:px-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-900">설치정보</h3>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            특이사항 수정
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <DetailField
          label="최초 설치일"
          value={formatDateOnly(derivedSummary?.firstInstalledAt ?? null)}
        />
        <DetailField
          label="최근 재설치일"
          value={formatDateOnly(derivedSummary?.lastReinstalledAt ?? null)}
        />
        <DetailField label="설치 담당자" value={latest?.assigneeName} />
        <DetailField label="설치 상태" value={latest?.statusLabel} />
        <DetailField label="설치 유형" value={caseTypeLabel(caseType, latest?.deliveryType)} />
      </div>

      {editing ? (
        <form onSubmit={submit} className="mt-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="설치 관련 특이사항을 입력하세요"
            className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setNote(merchant.install_note ?? "");
                setEditing(false);
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2">
          <p className="text-xs font-semibold text-slate-400">특이사항</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-800">
            {merchant.install_note || "-"}
          </p>
        </div>
      )}
    </section>
  );
}
