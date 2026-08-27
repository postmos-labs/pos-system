"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Search } from "lucide-react";
import { deleteMerchants } from "./actions";
import type {
  Merchant360Application,
  Merchant360Merchant,
  MerchantDerivedSummary,
  MerchantEquipmentCategorySummary,
  MerchantEquipmentItem,
  MerchantMemoEntry,
  MerchantOperationStatus,
  WorkHistoryItem,
} from "./merchant360";
import { MERCHANT_OPERATION_STATUS_CLASS, MERCHANT_OPERATION_STATUS_LABEL } from "./merchant360";
import MerchantInfoCard from "./MerchantInfoCard";
import InstallInfoCard from "./InstallInfoCard";
import ContractCard from "./ContractCard";
import QuickActions from "./QuickActions";
import InstallCompositionSection from "./InstallCompositionSection";
import MerchantMemoSection from "./MerchantMemoSection";
import MerchantHistorySection from "./MerchantHistorySection";
import EmptyState from "@/components/ui/EmptyState";
import BulkDeleteActions from "@/components/ui/BulkDeleteActions";
import BulkConfirmDialog from "@/components/ui/BulkConfirmDialog";

interface Props {
  merchants: Merchant360Merchant[];
  selectedId: string | null;
  selectedMerchant: Merchant360Merchant | null;
  selectedApplication: Merchant360Application | null;
  history: WorkHistoryItem[];
  memos: MerchantMemoEntry[];
  equipment: MerchantEquipmentItem[];
  equipmentCategorySummaries: MerchantEquipmentCategorySummary[];
  derivedSummary: MerchantDerivedSummary | null;
  page: number;
  totalPages: number;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return format(date, "yyyy-MM-dd", { locale: ko });
}

function MerchantDetailPanel({
  merchant,
  application,
  history,
  memos,
  equipment,
  equipmentCategorySummaries,
  derivedSummary,
}: {
  merchant: Merchant360Merchant | null;
  application: Merchant360Application | null;
  history: WorkHistoryItem[];
  memos: MerchantMemoEntry[];
  equipment: MerchantEquipmentItem[];
  equipmentCategorySummaries: MerchantEquipmentCategorySummary[];
  derivedSummary: MerchantDerivedSummary | null;
}) {
  if (!merchant) {
    return (
      <div className="flex min-h-[420px] flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-sm text-slate-400">
        가맹점을 선택하면 상세 정보가 표시됩니다.
      </div>
    );
  }

  const operationStatus: MerchantOperationStatus = merchant.operation_status ?? "active";
  const contractMonths = derivedSummary?.contractMonths ?? null;

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="shrink-0 border-b border-slate-100 px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-lg font-bold text-slate-900">{merchant.business_name}</h2>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${MERCHANT_OPERATION_STATUS_CLASS[operationStatus]}`}
          >
            {MERCHANT_OPERATION_STATUS_LABEL[operationStatus]}
          </span>
          {application?.program && (
            <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-600">
              {application.program}
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-xs text-slate-400">
          사업자번호 {merchant.business_number || "-"} · 대표자 {merchant.owner_name || "-"}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 md:px-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            label="최초 설치일"
            value={formatDateOnly(derivedSummary?.firstInstalledAt) ?? "-"}
          />
          <SummaryCard
            label="계약기간"
            value={contractMonths !== null ? `${contractMonths}개월` : "-"}
          />
          <SummaryCard label="설치 구성" value={`${derivedSummary?.totalEquipmentSets ?? 0}세트`} />
          <SummaryCard label="최근 A/S" value={formatDateOnly(derivedSummary?.lastAsAt) ?? "-"} />
        </div>

        <InstallCompositionSection
          merchantId={merchant.id}
          equipment={equipment}
          categorySummaries={equipmentCategorySummaries}
          totalEquipmentSets={derivedSummary?.totalEquipmentSets ?? 0}
        />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <MerchantInfoCard
            merchant={merchant}
            programLabel={application?.program ?? null}
            applicationVanCompany={application?.van_company ?? null}
          />
          <InstallInfoCard
            merchant={merchant}
            derivedSummary={derivedSummary}
            caseType={application?.case_type ?? null}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ContractCard
            merchant={merchant}
            contractMonths={contractMonths}
            internet={application?.internet ?? null}
          />
          <QuickActions
            merchantId={merchant.id}
            franchiseApplicationId={merchant.franchise_application_id}
          />
        </div>

        <MerchantMemoSection merchantId={merchant.id} memos={memos} />
        <MerchantHistorySection history={history} />
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
  equipmentCategorySummaries,
  derivedSummary,
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
            <div className="flex flex-col divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
              {filteredMerchants.map((merchant) => {
                const active = merchant.id === selectedId;
                const checked = selected.has(merchant.id);
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
                    className={`group relative flex cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors ${active ? "bg-blue-50" : "hover:bg-slate-50"}`}
                  >
                    {active && <span className="absolute inset-y-0 left-0 w-1 bg-blue-500" />}
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(merchant.id)}
                      onClick={(event) => event.stopPropagation()}
                      className={`h-4 w-4 shrink-0 cursor-pointer accent-blue-600 transition-opacity ${checked ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                    />
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}
                    >
                      {merchant.business_name.slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {merchant.business_name}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {merchant.owner_name || "-"}
                      </p>
                    </div>
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
        equipmentCategorySummaries={equipmentCategorySummaries}
        derivedSummary={derivedSummary}
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
