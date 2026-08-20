"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Search } from "lucide-react";
import { deleteMerchants } from "./actions";
import type { Merchant360Application, Merchant360Merchant, WorkHistoryItem } from "./merchant360";
import EmptyState from "@/components/ui/EmptyState";
import BulkDeleteActions from "@/components/ui/BulkDeleteActions";
import BulkConfirmDialog from "@/components/ui/BulkConfirmDialog";

interface Props {
  merchants: Merchant360Merchant[];
  selectedId: string | null;
  selectedMerchant: Merchant360Merchant | null;
  selectedApplication: Merchant360Application | null;
  history: WorkHistoryItem[];
  page: number;
  totalPages: number;
}

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

const NON_TERMINAL_STATUS_KEYWORDS = ["완료", "반려", "취소"];

function MerchantDetailPanel({
  merchant,
  application,
  history,
}: {
  merchant: Merchant360Merchant | null;
  application: Merchant360Application | null;
  history: WorkHistoryItem[];
}) {
  if (!merchant) {
    return (
      <div className="flex min-h-[420px] flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-sm text-slate-400">
        가맹점을 선택하면 상세 정보가 표시됩니다.
      </div>
    );
  }

  const progressCount = history.filter(
    (item) => !NON_TERMINAL_STATUS_KEYWORDS.some((keyword) => item.status.includes(keyword)),
  ).length;
  const latestHistory = history[0];

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="shrink-0 border-b border-slate-100 px-5 py-4 md:px-6">
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
          <Link
            href={`/merchants/${merchant.id}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            통합정보 열기 <ArrowUpRight size={13} />
          </Link>
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
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-6">
        <p className="text-sm text-slate-500">가맹점 기본 정보</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <DetailField label="인입경로" value={application?.channel_label} />
          <DetailField label="대표자" value={merchant.owner_name} />
          <DetailField label="연락처" value={merchant.phone} />
          <DetailField label="사업자번호" value={merchant.business_number} />
          <DetailField label="주소" value={merchant.address} />
          <DetailField label="상세주소" value={merchant.address_detail} />
          <DetailField label="CS 담당" value={application?.cs_name} />
          <DetailField label="기술 담당" value={application?.tech_name} />
          <DetailField
            label="인터넷·VAN사"
            value={[application?.internet, application?.van_company].filter(Boolean).join(" · ")}
          />
        </div>
        <p className="mt-5 text-xs text-slate-400">
          메모 히스토리, 설치 구성, 관련 업무 이력 등 상세 정보는 통합정보 화면에서 확인·수정할 수
          있습니다.
        </p>
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
