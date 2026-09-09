"use client";

import { useState } from "react";
import FormModal from "@/components/ui/FormModal";
import { DatePickerField } from "@/components/ui/DatePickerField";
import type { SupplyRequest, SupplyRequestInput } from "./supplyRequest";

interface Props {
  initial?: SupplyRequest;
  onSubmit: (input: SupplyRequestInput) => Promise<void>;
  submitting: boolean;
  onClose: () => void;
}

export default function SupplyRequestForm({ initial, onSubmit, submitting, onClose }: Props) {
  const [itemName, setItemName] = useState(initial?.item_name ?? "");
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [neededBy, setNeededBy] = useState(initial?.needed_by ?? "");
  const [isUrgent, setIsUrgent] = useState(initial?.is_urgent ?? false);
  const [description, setDescription] = useState(initial?.description ?? "");

  const invalid = !itemName.trim() || quantity < 1;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) return;
    await onSubmit({
      item_name: itemName.trim(),
      quantity,
      unit: unit.trim(),
      description: description.trim(),
      needed_by: neededBy,
      is_urgent: isUrgent,
    });
  }

  return (
    <FormModal
      title={initial ? "물품요청 수정" : "물품요청 등록"}
      onClose={onClose}
      maxWidthClassName="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">물품명</label>
          <input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
        <div className="flex gap-3">
          <div className="flex flex-col gap-1 w-24">
            <label className="text-xs font-medium text-slate-500">수량</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value) || 1)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs font-medium text-slate-500">단위</label>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="개·박스·롤"
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">필요 시기</label>
          <DatePickerField
            value={neededBy}
            onChange={setNeededBy}
            ariaLabel="필요 시기"
            placeholder="날짜 선택"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isUrgent}
            onChange={(e) => setIsUrgent(e.target.checked)}
            className="w-4 h-4 accent-blue-600 cursor-pointer"
          />
          긴급 (목록 상단에 고정)
        </label>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">설명·용도</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="왜 필요한지, 규격이나 참고 링크"
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || invalid}
          className="self-end text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
        >
          {submitting ? "저장 중..." : initial ? "저장" : "등록"}
        </button>
      </form>
    </FormModal>
  );
}
