"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DatePickerField, formatDate, parseDate } from "@/components/ui/DatePickerField";
import { updateMerchantInfo } from "./actions";
import type { Merchant360Merchant, MerchantOperationStatus } from "./merchant360";

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

// contract_started_at/contract_expires_at 두 날짜에서 파생만 하고 개월수 컬럼은 새로 만들지
// 않는다 — loadMerchant360.ts의 contractMonths 계산식과 동일하게 맞춰 화면에 보이는 값과
// 저장 후 다시 계산되는 값이 어긋나지 않게 한다.
function monthsBetween(startValue: string, endValue: string): number | null {
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (!start || !end) return null;
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

function addMonthsToDate(startValue: string, months: number): string | null {
  const start = parseDate(startValue);
  if (!start) return null;
  return formatDate(new Date(start.getFullYear(), start.getMonth() + months, start.getDate()));
}

export default function ContractCard({
  merchant,
  contractMonths,
  internet,
}: {
  merchant: Merchant360Merchant;
  contractMonths: number | null;
  internet: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // 시작일+종료일을 마지막으로 저장된 값 기준으로 초기화하므로, 처음 편집을 열었을 때는
  // "종료일 쪽을 마지막으로 건드린" 상태로 취급한다.
  const [lastTouched, setLastTouched] = useState<"months" | "endDate">("endDate");
  const [draft, setDraft] = useState({
    contractStartedAt: merchant.contract_started_at ?? "",
    contractExpiresAt: merchant.contract_expires_at ?? "",
    contractMonths:
      merchant.contract_started_at && merchant.contract_expires_at
        ? (monthsBetween(merchant.contract_started_at, merchant.contract_expires_at)?.toString() ??
          "")
        : "",
    tossMerchantNo: merchant.toss_merchant_no ?? "",
  });

  function handleStartChange(value: string) {
    setDraft((prev) => {
      const next = { ...prev, contractStartedAt: value };
      if (lastTouched === "months") {
        const months = Number.parseInt(prev.contractMonths, 10);
        if (value && Number.isInteger(months) && months >= 0) {
          next.contractExpiresAt = addMonthsToDate(value, months) ?? prev.contractExpiresAt;
        }
      } else if (value && prev.contractExpiresAt) {
        next.contractMonths = monthsBetween(value, prev.contractExpiresAt)?.toString() ?? "";
      }
      return next;
    });
  }

  function handleMonthsChange(raw: string) {
    setLastTouched("months");
    setDraft((prev) => {
      const next = { ...prev, contractMonths: raw };
      const months = Number.parseInt(raw, 10);
      if (prev.contractStartedAt && Number.isInteger(months) && months >= 0) {
        next.contractExpiresAt =
          addMonthsToDate(prev.contractStartedAt, months) ?? prev.contractExpiresAt;
      }
      return next;
    });
  }

  function handleEndChange(value: string) {
    setLastTouched("endDate");
    setDraft((prev) => ({
      ...prev,
      contractExpiresAt: value,
      contractMonths:
        prev.contractStartedAt && value
          ? (monthsBetween(prev.contractStartedAt, value)?.toString() ?? "")
          : "",
    }));
  }

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
      vanCompany: merchant.van_company ?? "",
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
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-slate-500">계약 시작일</span>
              <DatePickerField
                value={draft.contractStartedAt}
                onChange={handleStartChange}
                ariaLabel="계약 시작일"
                className="w-full"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-slate-500">계약기간(개월)</span>
              <input
                type="number"
                min={0}
                value={draft.contractMonths}
                onChange={(e) => handleMonthsChange(e.target.value)}
                placeholder="예: 36"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-slate-500">계약 종료일</span>
              <DatePickerField
                value={draft.contractExpiresAt}
                onChange={handleEndChange}
                ariaLabel="계약 종료일"
                className="w-full"
              />
            </label>
            <label className="block text-xs sm:col-span-3">
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
          <DetailField label="인터넷" value={internet} />
        </div>
      )}
    </section>
  );
}
