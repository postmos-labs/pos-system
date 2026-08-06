"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ExternalLink, MapPin, Phone, Search } from "lucide-react";
import { addMerchantMemo, deleteMerchants } from "./actions";
import type { Merchant360Merchant, WorkHistoryCategory, WorkHistoryItem } from "./merchant360";
import EmptyState from "@/components/ui/EmptyState";
import BulkDeleteActions from "@/components/ui/BulkDeleteActions";
import BulkConfirmDialog from "@/components/ui/BulkConfirmDialog";

interface Props {
  merchants: Merchant360Merchant[];
  selectedId: string | null;
  selectedMerchant: Merchant360Merchant | null;
  history: WorkHistoryItem[];
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
  { key: "memo_before", label: "이관 전 메모" },
  { key: "memo_after_transfer", label: "이관 후 메모" },
  { key: "memo_after_completion", label: "설치완료 후 메모" },
];

const HISTORY_CATEGORY_LABEL: Record<WorkHistoryCategory, string> = {
  reception: "접수",
  install: "설치",
  as: "AS",
  change: "변경",
  post: "설치·배송 이후",
  memo_before: "이관 전 메모",
  memo_after_transfer: "이관 후 메모",
  memo_after_completion: "설치완료 후 메모",
};

function formatDate(value: string) {
  return format(new Date(value), "yyyy.M.d HH:mm", { locale: ko });
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-3">
      <p className="mb-1 text-[11px] font-semibold text-slate-400">{label}</p>
      <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{value || "-"}</p>
    </div>
  );
}

function MerchantDetailPanel({
  merchant,
  history,
}: {
  merchant: Merchant360Merchant | null;
  history: WorkHistoryItem[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"all" | WorkHistoryCategory>("all");
  const [memoContent, setMemoContent] = useState("");
  const [memoSubmitting, setMemoSubmitting] = useState(false);

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

  const merchantRecord = merchant;

  async function submitMemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!memoContent.trim()) {
      alert("메모 내용을 입력해주세요.");
      return;
    }

    setMemoSubmitting(true);
    const result = await addMerchantMemo(merchantRecord.id, memoContent);
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
    router.refresh();
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="shrink-0 border-b border-slate-100 px-5 py-5 md:px-6">
        <h2 className="text-lg font-bold text-slate-900">{merchant.business_name}</h2>
        <p className="mt-1 text-sm text-slate-500">가맹점 기본 정보</p>
        <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <DetailField label="대표자" value={merchant.owner_name} />
          <DetailField label="연락처" value={merchant.phone} />
          <DetailField label="주소" value={merchant.address} />
          <DetailField label="상세주소" value={merchant.address_detail} />
        </div>
        <form
          onSubmit={submitMemo}
          className="mt-4 rounded-xl border border-blue-100 bg-blue-50/40 p-3"
        >
          <label
            htmlFor="merchant-memo"
            className="mb-2 block text-xs font-semibold text-slate-600"
          >
            메모 추가
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <textarea
              id="merchant-memo"
              value={memoContent}
              onChange={(event) => setMemoContent(event.target.value)}
              placeholder="가맹점 관련 메모를 입력하세요"
              rows={2}
              maxLength={2000}
              className="min-h-16 flex-1 resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <button
              type="submit"
              disabled={memoSubmitting || !memoContent.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {memoSubmitting ? "등록 중..." : "등록"}
            </button>
          </div>
        </form>
      </div>

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
