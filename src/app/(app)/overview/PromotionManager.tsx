"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { createPromotion, deletePromotion, updatePromotion, type PromotionInput } from "./actions";
import { formatNumber } from "./formatters";

type Promotion = {
  id: string;
  name: string;
  unit_rate: number;
  achieved_count: number;
  start_date: string;
  end_date: string;
  memo: string | null;
  amount: number;
};

type FormState = {
  name: string;
  startDate: string;
  endDate: string;
  unitRate: string;
  achievedCount: string;
  memo: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  startDate: "",
  endDate: "",
  unitRate: "",
  achievedCount: "0",
  memo: "",
};

function formFromPromotion(promotion: Promotion): FormState {
  return {
    name: promotion.name,
    startDate: promotion.start_date,
    endDate: promotion.end_date,
    unitRate: String(promotion.unit_rate),
    achievedCount: String(promotion.achieved_count),
    memo: promotion.memo ?? "",
  };
}

export default function PromotionManager({
  promotions,
  canManage,
}: {
  promotions: Promotion[];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setEditingId(null);
    setIsFormOpen(false);
    setForm(EMPTY_FORM);
  }

  function editPromotion(promotion: Promotion) {
    setEditingId(promotion.id);
    setIsFormOpen(true);
    setForm(formFromPromotion(promotion));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: PromotionInput = {
      name: form.name,
      startDate: form.startDate,
      endDate: form.endDate,
      unitRate: Number(form.unitRate),
      achievedCount: Number(form.achievedCount),
      memo: form.memo,
    };

    startTransition(async () => {
      const result = editingId
        ? await updatePromotion(editingId, input)
        : await createPromotion(input);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(editingId ? "프로모션을 수정했습니다." : "프로모션을 등록했습니다.");
      resetForm();
      router.refresh();
    });
  }

  function removePromotion(id: string) {
    if (!window.confirm("이 프로모션을 삭제하시겠습니까?")) return;

    startTransition(async () => {
      const result = await deletePromotion(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (editingId === id) resetForm();
      toast.success("프로모션을 삭제했습니다.");
      router.refresh();
    });
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900">프로모션 보상금액 상세</h2>
            <p className="mt-1 text-xs text-slate-500">조회 기간과 겹치는 프로모션만 표시합니다.</p>
          </div>
          {canManage && !editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setIsFormOpen(true);
                setForm(EMPTY_FORM);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="size-4" /> 프로모션 등록
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-6 py-3">프로모션</th>
              <th className="px-6 py-3">기간</th>
              <th className="px-6 py-3 text-right">단가</th>
              <th className="px-6 py-3 text-right">달성 건수</th>
              <th className="px-6 py-3 text-right">보상금액</th>
              {canManage && <th className="px-6 py-3 text-right">관리</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {promotions.length === 0 && (
              <tr>
                <td colSpan={canManage ? 6 : 5} className="px-6 py-10 text-center text-slate-400">
                  해당 기간에 등록된 프로모션이 없습니다.
                </td>
              </tr>
            )}
            {promotions.map((promotion) => (
              <tr key={promotion.id} className="hover:bg-slate-50">
                <td className="max-w-[260px] px-6 py-3">
                  <p className="truncate font-medium text-slate-900" title={promotion.name}>
                    {promotion.name}
                  </p>
                  {promotion.memo && (
                    <p className="mt-0.5 truncate text-xs text-slate-400" title={promotion.memo}>
                      {promotion.memo}
                    </p>
                  )}
                </td>
                <td className="whitespace-nowrap px-6 py-3 text-slate-500">
                  {promotion.start_date} ~ {promotion.end_date}
                </td>
                <td className="px-6 py-3 text-right text-slate-600">
                  {formatNumber(promotion.unit_rate)}원
                </td>
                <td className="px-6 py-3 text-right text-slate-600">
                  {formatNumber(promotion.achieved_count)}건
                </td>
                <td className="px-6 py-3 text-right font-semibold text-amber-700">
                  {formatNumber(promotion.amount)}원
                </td>
                {canManage && (
                  <td className="whitespace-nowrap px-6 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => editPromotion(promotion)}
                      disabled={isPending}
                      className="mr-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                    >
                      <Pencil className="size-3.5" /> 수정
                    </button>
                    <button
                      type="button"
                      onClick={() => removePromotion(promotion.id)}
                      disabled={isPending}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" /> 삭제
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManage && isFormOpen && (
        <form onSubmit={submit} className="border-t border-slate-100 bg-slate-50/70 px-6 py-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-800">
              {editingId ? "프로모션 수정" : "프로모션 등록"}
            </h3>
            <button
              type="button"
              onClick={resetForm}
              disabled={isPending}
              className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-50"
              aria-label="프로모션 입력 취소"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <label className="lg:col-span-3">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                프로모션 이름
              </span>
              <input
                required
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="예: 프론트 설치할 때마다 13만 2천원"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">시작일</span>
              <input
                required
                type="date"
                value={form.startDate}
                onChange={(event) => updateField("startDate", event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">종료일</span>
              <input
                required
                type="date"
                min={form.startDate || undefined}
                value={form.endDate}
                onChange={(event) => updateField("endDate", event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">건당 단가</span>
              <input
                required
                min="0"
                step="1"
                type="number"
                value={form.unitRate}
                onChange={(event) => updateField("unitRate", event.target.value)}
                placeholder="원"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">달성 건수</span>
              <input
                required
                min="0"
                step="1"
                type="number"
                value={form.achievedCount}
                onChange={(event) => updateField("achievedCount", event.target.value)}
                placeholder="건"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">메모</span>
              <input
                value={form.memo}
                onChange={(event) => updateField("memo", event.target.value)}
                placeholder="선택 사항"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {editingId ? <Save className="size-4" /> : <Plus className="size-4" />}
              {isPending ? "저장 중..." : editingId ? "수정 저장" : "등록"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
