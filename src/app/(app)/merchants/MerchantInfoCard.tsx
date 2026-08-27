"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppSelect } from "@/components/ui/AppSelect";
import { VAN_COMPANIES } from "@/types";
import { updateMerchantInfo } from "./actions";
import {
  MERCHANT_OPERATION_STATUS_LABEL,
  type Merchant360Merchant,
  type MerchantOperationStatus,
} from "./merchant360";

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

const OPERATION_STATUS_OPTIONS = (
  Object.keys(MERCHANT_OPERATION_STATUS_LABEL) as MerchantOperationStatus[]
).map((value) => ({ value, label: MERCHANT_OPERATION_STATUS_LABEL[value] }));

const VAN_COMPANY_OPTIONS = [
  { value: "", label: "선택 안 함" },
  ...VAN_COMPANIES.map((value) => ({ value, label: value })),
];

export default function MerchantInfoCard({
  merchant,
  programLabel,
  applicationVanCompany,
}: {
  merchant: Merchant360Merchant;
  programLabel: string | null;
  // 가맹점 자체 값(merchants.van_company)이 비어 있으면 연결된 가맹접수 값을 대신 보여준다.
  // 덕분에 117번 마이그레이션 후 백필 UPDATE 없이도 기존 가맹점의 VAN사가 그대로 보인다.
  applicationVanCompany: string | null;
}) {
  const effectiveVanCompany = merchant.van_company || applicationVanCompany;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState({
    businessName: merchant.business_name ?? "",
    ownerName: merchant.owner_name ?? "",
    phone: merchant.phone ?? "",
    address: merchant.address ?? "",
    addressDetail: merchant.address_detail ?? "",
    businessNumber: merchant.business_number ?? "",
    contactName: merchant.contact_name ?? "",
    contactPhone: merchant.contact_phone ?? "",
    operationStatus: (merchant.operation_status ?? "active") as MerchantOperationStatus,
    tossMerchantNo: merchant.toss_merchant_no ?? "",
    contractExpiresAt: merchant.contract_expires_at ?? "",
    contractStartedAt: merchant.contract_started_at ?? "",
    brand: merchant.brand ?? "",
    vanCompany: merchant.van_company ?? applicationVanCompany ?? "",
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.businessName.trim()) return;
    setSubmitting(true);
    const result = await updateMerchantInfo(merchant.id, draft);
    setSubmitting(false);
    if (result.error) {
      alert("가맹점 정보 수정 실패: " + result.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 md:px-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-900">기본정보</h3>
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
              <span className="mb-1 block font-semibold text-slate-500">상호명</span>
              <input
                required
                value={draft.businessName}
                onChange={(e) => setDraft((p) => ({ ...p, businessName: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-slate-500">대표자</span>
              <input
                value={draft.ownerName}
                onChange={(e) => setDraft((p) => ({ ...p, ownerName: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-slate-500">사업자번호</span>
              <input
                value={draft.businessNumber}
                onChange={(e) => setDraft((p) => ({ ...p, businessNumber: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-slate-500">연락처</span>
              <input
                value={draft.phone}
                onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block text-xs sm:col-span-2">
              <span className="mb-1 block font-semibold text-slate-500">주소</span>
              <input
                value={draft.address}
                onChange={(e) => setDraft((p) => ({ ...p, address: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block text-xs sm:col-span-2">
              <span className="mb-1 block font-semibold text-slate-500">상세주소</span>
              <input
                value={draft.addressDetail}
                onChange={(e) => setDraft((p) => ({ ...p, addressDetail: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-slate-500">매장 담당자</span>
              <input
                value={draft.contactName}
                onChange={(e) => setDraft((p) => ({ ...p, contactName: e.target.value }))}
                placeholder="점장 등"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-slate-500">담당자 연락처</span>
              <input
                value={draft.contactPhone}
                onChange={(e) => setDraft((p) => ({ ...p, contactPhone: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-slate-500">토스 가맹점번호</span>
              <input
                value={draft.tossMerchantNo}
                onChange={(e) => setDraft((p) => ({ ...p, tossMerchantNo: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-slate-500">VAN사</span>
              <AppSelect
                value={draft.vanCompany}
                onValueChange={(value) => setDraft((p) => ({ ...p, vanCompany: value }))}
                options={VAN_COMPANY_OPTIONS}
                className="h-9 w-full text-sm"
                aria-label="VAN사"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-slate-500">소속 브랜드</span>
              <input
                value={draft.brand}
                onChange={(e) => setDraft((p) => ({ ...p, brand: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-slate-500">운영 상태</span>
              <AppSelect
                value={draft.operationStatus}
                onValueChange={(value) =>
                  setDraft((p) => ({ ...p, operationStatus: value as MerchantOperationStatus }))
                }
                options={OPERATION_STATUS_OPTIONS}
                className="h-9 w-full text-sm"
                aria-label="운영 상태"
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
              disabled={submitting || !draft.businessName.trim()}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <DetailField label="상호명" value={merchant.business_name} />
          <DetailField label="사업자번호" value={merchant.business_number} />
          <DetailField label="대표자" value={merchant.owner_name} />
          <DetailField label="연락처" value={merchant.phone} />
          <DetailField label="주소" value={merchant.address} />
          <DetailField label="상세주소" value={merchant.address_detail} />
          <DetailField
            label="담당자"
            value={
              [merchant.contact_name, merchant.contact_phone].filter(Boolean).join(" / ") || null
            }
          />
          <DetailField label="사용 프로그램" value={programLabel} />
          <DetailField label="VAN사" value={effectiveVanCompany} />
        </div>
      )}
    </section>
  );
}
