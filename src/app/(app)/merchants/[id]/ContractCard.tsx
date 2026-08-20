"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { updateMerchantInfo } from "../actions";
import type { Merchant360Merchant, MerchantOperationStatus } from "../merchant360";

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

export default function ContractCard({
  merchant,
  contractMonths,
  vanCompany,
  internet,
}: {
  merchant: Merchant360Merchant;
  contractMonths: number | null;
  vanCompany: string | null;
  internet: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState({
    contractStartedAt: merchant.contract_started_at ?? "",
    contractExpiresAt: merchant.contract_expires_at ?? "",
    tossMerchantNo: merchant.toss_merchant_no ?? "",
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    // 계약조건 카드는 계약 관련 필드만 노출하지만, 서버 액션은 가맹점 행 전체를 업데이트하는
    // 형태라 기본정보 카드의 나머지 값들도 함께 실어 보내 값이 지워지지 않게 한다.
    const result = await updateMerchantInfo(merchant.id, {
      businessName: merchant.business_name,
      ownerName: merchant.owner_name,
      phone: merchant.phone,
      address: merchant.address ?? "",
      addressDetail: merchant.address_detail ?? "",
      businessNumber: merchant.business_number ?? "",
      brand: merchant.brand ?? "",
      contactName: merchant.contact_name ?? "",
      contactPhone: merchant.contact_phone ?? "",
      operationStatus: (merchant.operation_status ?? "active") as MerchantOperationStatus,
      tossMerchantNo: draft.tossMerchantNo,
      contractStartedAt: draft.contractStartedAt,
      contractExpiresAt: draft.contractExpiresAt,
    });
    setSubmitting(false);
    if (result.error) {
      alert("계약조건 수정 실패: " + result.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 md:px-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-900">계약조건</h3>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            수정
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={submit} className="mt-4 space-y-2.5">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-slate-500">계약 시작일</span>
              <DatePickerField
                value={draft.contractStartedAt}
                onChange={(value) => setDraft((p) => ({ ...p, contractStartedAt: value }))}
                ariaLabel="계약 시작일"
                className="w-full"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-slate-500">계약 종료일</span>
              <DatePickerField
                value={draft.contractExpiresAt}
                onChange={(value) => setDraft((p) => ({ ...p, contractExpiresAt: value }))}
                ariaLabel="계약 종료일"
                className="w-full"
              />
            </label>
            <label className="block text-xs sm:col-span-2">
              <span className="mb-1 block font-semibold text-slate-500">토스 가맹점번호</span>
              <input
                value={draft.tossMerchantNo}
                onChange={(e) => setDraft((p) => ({ ...p, tossMerchantNo: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
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
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <DetailField label="계약 시작일" value={merchant.contract_started_at} />
          <DetailField label="계약 종료일" value={merchant.contract_expires_at} />
          <DetailField
            label="계약기간"
            value={contractMonths !== null ? `${contractMonths}개월` : null}
          />
          <DetailField label="토스 가맹점번호" value={merchant.toss_merchant_no} />
          <DetailField label="VAN사" value={vanCompany} />
          <DetailField label="인터넷" value={internet} />
        </div>
      )}
    </section>
  );
}
