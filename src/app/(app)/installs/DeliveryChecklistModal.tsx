"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import FormModal from "@/components/ui/FormModal";
import { useToast } from "@/components/ui/Toast";
import { saveDeliveryChecklist } from "./actions";
import type { DeliveryChecklist, DeliveryChecklistItem } from "./deliveryChecklist";
import type { Installation } from "./InstallsClient";
import {
  INVENTORY_ITEM_GROUPS,
  INVENTORY_ITEM_NAMES,
  POS_ITEM_NAMES,
} from "@/lib/inventoryCatalog";

interface Props {
  installation: Installation;
  onClose: () => void;
  onSaved: (checklist: DeliveryChecklist) => void | Promise<void>;
}

// 품목명은 재고 실사 등록 폼과 같은 카탈로그에서 고른다. 완료 시 차감이 이름 일치로 되기 때문이다.
// 포스기는 자주 나가므로 버튼으로, 나머지는 목록에서 고른다. 직접 입력도 되지만 그때는 차감이 안 될 수 있다.

function initialRows(installation: Installation): DeliveryChecklistItem[] {
  if (installation.delivery_checklist?.items?.length) {
    return installation.delivery_checklist.items;
  }
  if (installation.items?.length) {
    return installation.items.map((i) => ({ name: i.name, quantity: i.quantity, checked: false }));
  }
  return [{ name: "", quantity: 1, checked: false }];
}

export default function DeliveryChecklistModal({ installation, onClose, onSaved }: Props) {
  const toast = useToast();
  const [rows, setRows] = useState<DeliveryChecklistItem[]>(() => initialRows(installation));
  const [note, setNote] = useState(installation.delivery_checklist?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shortages, setShortages] = useState<{ name: string; stock: number; requested: number }[]>(
    [],
  );

  const relevantRows = rows.filter((r) => r.quantity > 0);
  const canSave = relevantRows.length > 0 && relevantRows.every((r) => r.checked);

  function updateRow(index: number, patch: Partial<DeliveryChecklistItem>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function addRow() {
    setRows((prev) => [...prev, { name: "", quantity: 1, checked: false }]);
  }

  function addQuickItem(name: string) {
    setRows((prev) => {
      const index = prev.findIndex((r) => r.name.trim() === name);
      if (index >= 0) {
        return prev.map((r, i) => (i === index ? { ...r, quantity: r.quantity + 1 } : r));
      }
      const blankIndex = prev.findIndex((r) => !r.name.trim());
      const row = { name, quantity: 1, checked: false };
      if (blankIndex >= 0) return prev.map((r, i) => (i === blankIndex ? row : r));
      return [...prev, row];
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setShortages([]);
    const result = await saveDeliveryChecklist({
      installationId: installation.id,
      items: rows,
      note,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      setShortages(result.shortages ?? []);
      return;
    }
    if (result.unmatched.length) {
      toast.warning(
        `재고 품목명과 다른 항목은 완료 시 차감되지 않습니다: ${result.unmatched.join(", ")}`,
      );
    }
    if (result.checklist) {
      await onSaved(result.checklist);
    }
    onClose();
  }

  return (
    <FormModal title="택배 발송 체크리스트" onClose={onClose} maxWidthClassName="max-w-lg">
      <p className="mb-4 text-xs text-slate-500">
        실제로 보내는 장비와 수량을 확인하세요. 수량이 있는 항목은 전부 체크해야 저장됩니다.
      </p>
      {installation.delivery_checklist?.saved_at && (
        <p className="mb-3 text-xs text-slate-500">
          마지막 저장 {installation.delivery_checklist.saved_by_name ?? "-"} ·{" "}
          {format(new Date(installation.delivery_checklist.saved_at), "yyyy-M-d HH:mm", {
            locale: ko,
          })}
        </p>
      )}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-500">포스 기종</span>
        {POS_ITEM_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => addQuickItem(name)}
            className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            + {name}
          </button>
        ))}
      </div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-slate-500">재고 품목에서 추가</span>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) addQuickItem(e.target.value);
          }}
          aria-label="재고 품목에서 추가"
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
        >
          <option value="">선택…</option>
          {INVENTORY_ITEM_GROUPS.map((group) => (
            <optgroup key={group.group} label={group.group}>
              {group.names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <datalist id="delivery-checklist-item-names">
        {INVENTORY_ITEM_NAMES.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <div className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={row.checked}
              onChange={(e) => updateRow(index, { checked: e.target.checked })}
              className="size-4"
            />
            <input
              value={row.name}
              onChange={(e) => updateRow(index, { name: e.target.value })}
              placeholder="장비명"
              list="delivery-checklist-item-names"
              className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />
            <input
              type="number"
              min={0}
              value={row.quantity}
              onChange={(e) => updateRow(index, { quantity: Number(e.target.value) })}
              className="w-20 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />
            <button
              type="button"
              onClick={() => removeRow(index)}
              className="text-slate-400 hover:text-red-500"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        className="mt-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
      >
        품목 추가
      </button>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="대체 장비·추가 케이블·중고 장비 등 예외사항"
        rows={3}
        className="mt-4 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
      />
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600">
          <p>{error}</p>
          {shortages.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5">
              {shortages.map((s) => (
                <li key={s.name}>
                  {s.name}: 재고 {s.stock} / 발송 {s.requested}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || saving}
          className="rounded-lg border border-blue-600 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          저장
        </button>
      </div>
    </FormModal>
  );
}
