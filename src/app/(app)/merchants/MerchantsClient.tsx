"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ExternalLink, MapPin, Phone, Search } from "lucide-react";
import {
  addMerchantEquipment,
  addMerchantMemo,
  deleteMerchants,
  updateMerchantEquipmentStatus,
  updateMerchantInfo,
  type MerchantEquipmentStatus as MerchantEquipmentStatusInput,
} from "./actions";
import {
  MERCHANT_EQUIPMENT_STATUS_LABEL,
  type Merchant360Application,
  type Merchant360Merchant,
  type MerchantEquipmentItem,
  type MerchantMemoEntry,
  type MerchantMemoStage,
  type WorkHistoryCategory,
  type WorkHistoryItem,
} from "./merchant360";
import EmptyState from "@/components/ui/EmptyState";
import BulkDeleteActions from "@/components/ui/BulkDeleteActions";
import BulkConfirmDialog from "@/components/ui/BulkConfirmDialog";
import { AppSelect } from "@/components/ui/AppSelect";
import { DatePickerField } from "@/components/ui/DatePickerField";
import {
  AS_CHECKLIST_SECTIONS,
  MERCHANT_MEMO_ENTRY_TYPE_LABEL,
  isAsChecklistComplete,
  type MerchantMemoEntryType,
} from "@/lib/asChecklist";

interface Props {
  merchants: Merchant360Merchant[];
  selectedId: string | null;
  selectedMerchant: Merchant360Merchant | null;
  selectedApplication: Merchant360Application | null;
  history: WorkHistoryItem[];
  memos: MerchantMemoEntry[];
  equipment: MerchantEquipmentItem[];
  page: number;
  totalPages: number;
}

const HISTORY_TABS: Array<{ key: "all" | WorkHistoryCategory; label: string }> = [
  { key: "all", label: "전체" },
  { key: "reception", label: "접수" },
  { key: "install", label: "설치" },
  { key: "as", label: "AS" },
  { key: "change", label: "변경" },
  { key: "post", label: "설치·배송 이후 히스토리" },
];

const HISTORY_CATEGORY_LABEL: Record<WorkHistoryCategory, string> = {
  reception: "접수",
  install: "설치",
  as: "AS",
  change: "변경",
  post: "설치·배송 이후",
};

function formatDate(value: string) {
  return format(new Date(value), "yyyy.M.d HH:mm", { locale: ko });
}

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

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-3">
      <p className="mb-1 text-[11px] font-semibold text-slate-400">{label}</p>
      <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{value || "-"}</p>
    </div>
  );
}

const NON_TERMINAL_STATUS_KEYWORDS = ["완료", "반려", "취소"];

function MerchantDetailPanel({
  merchant,
  application,
  history,
  memos,
  equipment,
}: {
  merchant: Merchant360Merchant | null;
  application: Merchant360Application | null;
  history: WorkHistoryItem[];
  memos: MerchantMemoEntry[];
  equipment: MerchantEquipmentItem[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"all" | WorkHistoryCategory>("all");
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoDraft, setInfoDraft] = useState({
    businessName: merchant?.business_name ?? "",
    ownerName: merchant?.owner_name ?? "",
    phone: merchant?.phone ?? "",
    address: merchant?.address ?? "",
    addressDetail: merchant?.address_detail ?? "",
    businessNumber: merchant?.business_number ?? "",
    tossMerchantNo: merchant?.toss_merchant_no ?? "",
    contractExpiresAt: merchant?.contract_expires_at ?? "",
    brand: merchant?.brand ?? "",
  });
  const [infoSubmitting, setInfoSubmitting] = useState(false);
  const [memoContent, setMemoContent] = useState("");
  const [memoSubmitting, setMemoSubmitting] = useState(false);
  const [memoEntryType, setMemoEntryType] = useState<MerchantMemoEntryType>("general");
  const [memoChecklist, setMemoChecklist] = useState<Record<string, boolean>>({});
  const [equipmentDraft, setEquipmentDraft] = useState({
    name: "",
    serialNumber: "",
    installedDate: "",
    notes: "",
  });
  const [equipmentSubmitting, setEquipmentSubmitting] = useState(false);
  const [equipmentStatusUpdating, setEquipmentStatusUpdating] = useState<string | null>(null);

  const filteredHistory = useMemo(
    () => (tab === "all" ? history : history.filter((item) => item.category === tab)),
    [history, tab],
  );

  if (!merchant) {
    return (
      <div className="flex min-h-[420px] flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-sm text-slate-400">
        가맹점을 선택하면 상세 정보가 표시됩니다.
      </div>
    );
  }

  const merchantId = merchant.id;

  const isAsEntry = memoEntryType === "as";
  const asChecklistComplete = isAsChecklistComplete(memoChecklist);
  const canSubmitMemo = memoContent.trim().length > 0 && (!isAsEntry || asChecklistComplete);

  function toggleChecklistItem(id: string) {
    setMemoChecklist((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function submitInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!infoDraft.businessName.trim()) return;
    setInfoSubmitting(true);
    const result = await updateMerchantInfo(merchantId, {
      businessName: infoDraft.businessName,
      ownerName: infoDraft.ownerName,
      phone: infoDraft.phone,
      address: infoDraft.address,
      addressDetail: infoDraft.addressDetail,
      businessNumber: infoDraft.businessNumber,
      tossMerchantNo: infoDraft.tossMerchantNo,
      contractExpiresAt: infoDraft.contractExpiresAt,
      brand: infoDraft.brand,
    });
    setInfoSubmitting(false);
    if (result.error) {
      alert("가맹점 정보 수정 실패: " + result.error);
      return;
    }
    setEditingInfo(false);
    router.refresh();
  }

  async function submitEquipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!equipmentDraft.name.trim()) return;
    setEquipmentSubmitting(true);
    const result = await addMerchantEquipment(merchantId, equipmentDraft);
    setEquipmentSubmitting(false);
    if (result.error) {
      alert("장비 등록 실패: " + result.error);
      return;
    }
    if (result.skipped) {
      alert("장비 테이블이 아직 적용되지 않아 저장하지 않았습니다.");
      return;
    }
    setEquipmentDraft({ name: "", serialNumber: "", installedDate: "", notes: "" });
    router.refresh();
  }

  async function changeEquipmentStatus(id: string, status: MerchantEquipmentStatusInput) {
    setEquipmentStatusUpdating(id);
    const result = await updateMerchantEquipmentStatus(id, status);
    setEquipmentStatusUpdating(null);
    if (result.error) {
      alert("장비 상태 변경 실패: " + result.error);
      return;
    }
    router.refresh();
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

  const progressCount = history.filter(
    (item) => !NON_TERMINAL_STATUS_KEYWORDS.some((keyword) => item.status.includes(keyword)),
  ).length;
  const latestHistory = history[0];

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="shrink-0 border-b border-slate-100 px-5 py-5 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-lg font-bold text-slate-900">{merchant.business_name}</h2>
            {application && (
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${application.status_class}`}
              >
                {application.status_label}
              </span>
            )}
          </div>
          {!editingInfo && (
            <button
              type="button"
              onClick={() => setEditingInfo(true)}
              className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              정보 수정
            </button>
          )}
        </div>
        {(progressCount > 0 || latestHistory) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {progressCount > 0 && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-600">
                진행 중 {progressCount}건
              </span>
            )}
            {latestHistory && (
              <span className="truncate">
                최근 이력: {latestHistory.title} {latestHistory.summary} · {latestHistory.status} ·{" "}
                {latestHistory.date.slice(0, 10)}
              </span>
            )}
          </div>
        )}
        <p className="mt-1 text-sm text-slate-500">가맹점 기본 정보</p>
        {editingInfo ? (
          <form onSubmit={submitInfo} className="mt-5 space-y-2.5">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label className="block text-xs">
                <span className="mb-1 block font-semibold text-slate-500">상호명</span>
                <input
                  required
                  value={infoDraft.businessName}
                  onChange={(event) =>
                    setInfoDraft((prev) => ({ ...prev, businessName: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-semibold text-slate-500">대표자</span>
                <input
                  value={infoDraft.ownerName}
                  onChange={(event) =>
                    setInfoDraft((prev) => ({ ...prev, ownerName: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-semibold text-slate-500">연락처</span>
                <input
                  value={infoDraft.phone}
                  onChange={(event) =>
                    setInfoDraft((prev) => ({ ...prev, phone: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-semibold text-slate-500">주소</span>
                <input
                  value={infoDraft.address}
                  onChange={(event) =>
                    setInfoDraft((prev) => ({ ...prev, address: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="block text-xs sm:col-span-2">
                <span className="mb-1 block font-semibold text-slate-500">상세주소</span>
                <input
                  value={infoDraft.addressDetail}
                  onChange={(event) =>
                    setInfoDraft((prev) => ({ ...prev, addressDetail: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-semibold text-slate-500">사업자번호</span>
                <input
                  value={infoDraft.businessNumber}
                  onChange={(event) =>
                    setInfoDraft((prev) => ({ ...prev, businessNumber: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-semibold text-slate-500">토스 가맹점번호</span>
                <input
                  value={infoDraft.tossMerchantNo}
                  onChange={(event) =>
                    setInfoDraft((prev) => ({ ...prev, tossMerchantNo: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-semibold text-slate-500">계약 만료일</span>
                <DatePickerField
                  value={infoDraft.contractExpiresAt}
                  onChange={(value) =>
                    setInfoDraft((prev) => ({ ...prev, contractExpiresAt: value }))
                  }
                  ariaLabel="계약 만료일"
                  className="w-full"
                />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-semibold text-slate-500">소속 브랜드</span>
                <input
                  value={infoDraft.brand}
                  onChange={(event) =>
                    setInfoDraft((prev) => ({ ...prev, brand: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingInfo(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={infoSubmitting || !infoDraft.businessName.trim()}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {infoSubmitting ? "저장 중..." : "저장"}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <DetailField label="인입경로" value={application?.reception_channel} />
            <DetailField label="대표자" value={merchant.owner_name} />
            <DetailField label="연락처" value={merchant.phone} />
            <DetailField label="사업자번호" value={merchant.business_number} />
            <DetailField label="주소" value={merchant.address} />
            <DetailField label="상세주소" value={merchant.address_detail} />
            <DetailField label="개업 예정일" value={merchant.open_date} />
            <DetailField label="계약 만료일" value={merchant.contract_expires_at} />
            <DetailField label="CS 담당" value={application?.cs_name} />
            <DetailField label="기술 담당" value={application?.tech_name} />
            <DetailField label="토스 가맹점번호" value={merchant.toss_merchant_no} />
            <DetailField label="소속 브랜드" value={merchant.brand} />
            <DetailField
              label="인터넷·VAN사"
              value={[application?.internet, application?.van_company].filter(Boolean).join(" · ")}
            />
          </div>
        )}
      </div>

      <section className="shrink-0 border-b border-slate-100 px-5 py-4 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900">메모 히스토리</h3>
          <span className="text-xs text-slate-400">{memos.length}건</span>
        </div>
        <form
          onSubmit={submitMemo}
          className="mt-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3"
        >
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(MERCHANT_MEMO_ENTRY_TYPE_LABEL) as MerchantMemoEntryType[]).map(
              (type) => (
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
              ),
            )}
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

      <section className="shrink-0 border-b border-slate-100 px-5 py-4 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900">설치 장비</h3>
          <span className="text-xs text-slate-400">{equipment.length}건</span>
        </div>
        <form
          onSubmit={submitEquipment}
          className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-blue-100 bg-blue-50/40 p-3 sm:grid-cols-4"
        >
          <input
            value={equipmentDraft.name}
            onChange={(event) =>
              setEquipmentDraft((prev) => ({ ...prev, name: event.target.value }))
            }
            placeholder="장비명 (필수)"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          <input
            value={equipmentDraft.serialNumber}
            onChange={(event) =>
              setEquipmentDraft((prev) => ({ ...prev, serialNumber: event.target.value }))
            }
            placeholder="시리얼번호"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          <DatePickerField
            value={equipmentDraft.installedDate}
            onChange={(value) => setEquipmentDraft((prev) => ({ ...prev, installedDate: value }))}
            ariaLabel="설치일 선택"
            placeholder="설치일"
          />
          <button
            type="submit"
            disabled={equipmentSubmitting || !equipmentDraft.name.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {equipmentSubmitting ? "등록 중..." : "장비 추가"}
          </button>
        </form>
        {equipment.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">등록된 장비가 없습니다.</p>
        ) : (
          <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-slate-200">
            <div className="divide-y divide-slate-100">
              {equipment.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {item.serial_number ? `S/N ${item.serial_number} · ` : ""}
                      {item.installed_date ? `설치일 ${item.installed_date}` : "설치일 미상"}
                    </p>
                  </div>
                  <AppSelect
                    value={item.status}
                    disabled={equipmentStatusUpdating === item.id}
                    onValueChange={(value) =>
                      changeEquipmentStatus(item.id, value as MerchantEquipmentStatusInput)
                    }
                    options={Object.entries(MERCHANT_EQUIPMENT_STATUS_LABEL).map(
                      ([value, label]) => ({
                        value,
                        label,
                      }),
                    )}
                    className="h-8 text-xs"
                    aria-label="장비 상태"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="flex min-h-0 flex-1 flex-col px-5 py-5 md:px-6">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900">관련 업무 이력</h3>
          <span className="text-xs text-slate-400">{filteredHistory.length}건</span>
        </div>
        <div className="mb-4 flex shrink-0 gap-1 overflow-x-auto border-b border-slate-100 pb-px">
          {HISTORY_TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`whitespace-nowrap border-b-2 px-2.5 py-2 text-xs font-semibold transition-colors ${tab === item.key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-700"}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {filteredHistory.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">관련 업무 이력이 없습니다.</p>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {filteredHistory.map((item) => (
                <article key={`${item.category}-${item.id}`} className="px-3.5 py-3.5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{item.title}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-500">
                        {item.summary}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${item.statusClass}`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-3 text-[11px] text-slate-400">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-slate-500">
                        {HISTORY_CATEGORY_LABEL[item.category]}
                      </span>
                      <time dateTime={item.date}>{formatDate(item.date)}</time>
                    </span>
                    <Link
                      href={item.href}
                      className="inline-flex shrink-0 items-center gap-1 font-medium text-blue-600 hover:text-blue-700"
                    >
                      관련 화면 열기 <ExternalLink size={12} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function MerchantsClient({
  merchants,
  selectedId,
  selectedMerchant,
  selectedApplication,
  history,
  memos,
  equipment,
  page,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredMerchants = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return merchants;
    return merchants.filter((merchant) =>
      [merchant.business_name, merchant.owner_name, merchant.phone, merchant.address]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query)),
    );
  }, [merchants, search]);

  const allChecked =
    filteredMerchants.length > 0 &&
    filteredMerchants.every((merchant) => selected.has(merchant.id));

  function selectMerchant(id: string) {
    router.replace(`/merchants?page=${page}&id=${id}`);
  }

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(filteredMerchants.map((merchant) => merchant.id)));
  }

  function toggleOne(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmDeleteOpen() {
    if (selected.size > 0) setDeleteConfirmOpen(true);
  }

  async function confirmDelete() {
    setDeleting(true);
    const { error } = await deleteMerchants([...selected]);
    setDeleting(false);
    setDeleteConfirmOpen(false);
    if (error) {
      alert("삭제 실패: " + error);
      return;
    }
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
      <section className="flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="shrink-0 border-b border-slate-100 p-4">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="상호명, 대표자, 연락처, 주소 검색"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {filteredMerchants.length > 0 && (
            <label className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-400">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={toggleAll}
                className="h-4 w-4 cursor-pointer accent-blue-600"
              />
              전체 선택
            </label>
          )}
        </div>

        {selected.size > 0 && (
          <div className="shrink-0 px-4 pt-3">
            <BulkDeleteActions
              count={selected.size}
              deleting={deleting}
              onDelete={confirmDeleteOpen}
              onCancel={() => setSelected(new Set())}
            />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {filteredMerchants.length === 0 ? (
            <EmptyState
              message={search.trim() ? "검색 결과가 없습니다" : "등록된 가맹점이 없습니다"}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {filteredMerchants.map((merchant) => {
                const active = merchant.id === selectedId;
                return (
                  <div
                    key={merchant.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={active}
                    onClick={() => selectMerchant(merchant.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") selectMerchant(merchant.id);
                    }}
                    className={`relative cursor-pointer rounded-xl border p-3.5 text-left transition-colors ${active ? "border-blue-300 bg-blue-50/70" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(merchant.id)}
                      onChange={() => toggleOne(merchant.id)}
                      onClick={(event) => event.stopPropagation()}
                      className="absolute right-3.5 top-3.5 h-4 w-4 cursor-pointer accent-blue-600"
                    />
                    <div className="pr-7">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {merchant.business_name}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">{merchant.owner_name || "-"}</p>
                    </div>
                    <div className="mt-3 flex flex-col gap-1 text-xs text-slate-600">
                      <span className="flex items-center gap-1.5 truncate">
                        <Phone size={12} /> {merchant.phone || "-"}
                      </span>
                      <span
                        className="flex items-center gap-1.5 truncate"
                        title={merchant.address ?? ""}
                      >
                        <MapPin size={12} /> {merchant.address || "주소 미입력"}
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">
                      등록 {format(new Date(merchant.created_at), "yyyy.M.d", { locale: ko })}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <MerchantDetailPanel
        key={selectedMerchant?.id ?? "empty"}
        merchant={selectedMerchant}
        application={selectedApplication}
        history={history}
        memos={memos}
        equipment={equipment}
      />

      <BulkConfirmDialog
        open={deleteConfirmOpen}
        title="선택 항목 삭제"
        busy={deleting}
        confirmText="삭제"
        confirmColor="red"
        items={merchants
          .filter((merchant) => selected.has(merchant.id))
          .map((merchant) => ({ id: merchant.id, label: merchant.business_name }))}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
