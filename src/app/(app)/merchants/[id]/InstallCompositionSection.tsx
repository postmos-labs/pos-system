"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppSelect } from "@/components/ui/AppSelect";
import { DatePickerField } from "@/components/ui/DatePickerField";
import {
  addMerchantEquipment,
  deleteMerchantEquipment,
  updateMerchantEquipment,
  updateMerchantEquipmentStatus,
  type MerchantEquipmentInput,
  type MerchantEquipmentStatus as MerchantEquipmentStatusInput,
} from "../actions";
import {
  MERCHANT_EQUIPMENT_CATEGORY_LABEL,
  MERCHANT_EQUIPMENT_STATUS_LABEL,
  type MerchantEquipmentCategory,
  type MerchantEquipmentCategorySummary,
  type MerchantEquipmentItem,
} from "../merchant360";

const CATEGORY_OPTIONS = (
  Object.keys(MERCHANT_EQUIPMENT_CATEGORY_LABEL) as MerchantEquipmentCategory[]
).map((value) => ({ value, label: MERCHANT_EQUIPMENT_CATEGORY_LABEL[value] }));

const STATUS_OPTIONS = Object.entries(MERCHANT_EQUIPMENT_STATUS_LABEL).map(([value, label]) => ({
  value,
  label,
}));

const EMPTY_FORM = {
  category: "main_pos" as MerchantEquipmentCategory,
  components: "",
  quantity: "1",
  manufacturer: "",
  supplier: "",
  location: "",
  notes: "",
  name: "",
  serialNumber: "",
  installedDate: "",
};

type EquipmentFormState = typeof EMPTY_FORM;

function toInput(form: EquipmentFormState): MerchantEquipmentInput {
  return {
    name:
      form.name.trim() ||
      form.components.trim() ||
      MERCHANT_EQUIPMENT_CATEGORY_LABEL[form.category],
    serialNumber: form.serialNumber,
    installedDate: form.installedDate,
    notes: form.notes,
    category: form.category,
    quantity: Math.max(1, Number.parseInt(form.quantity, 10) || 1),
    components: form.components,
    manufacturer: form.manufacturer,
    supplier: form.supplier,
    location: form.location,
  };
}

function EquipmentFormFields({
  form,
  onChange,
}: {
  form: EquipmentFormState;
  onChange: (next: EquipmentFormState) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <AppSelect
        value={form.category}
        onValueChange={(value) =>
          onChange({ ...form, category: value as MerchantEquipmentCategory })
        }
        options={CATEGORY_OPTIONS}
        aria-label="설치구분"
        className="h-9 text-sm"
      />
      <input
        value={form.components}
        onChange={(e) => onChange({ ...form, components: e.target.value })}
        placeholder="구성 (예: POS + 프론트 + 프린터)"
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:col-span-2"
      />
      <input
        type="number"
        min={1}
        value={form.quantity}
        onChange={(e) => onChange({ ...form, quantity: e.target.value })}
        placeholder="수량"
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
      <input
        value={form.manufacturer}
        onChange={(e) => onChange({ ...form, manufacturer: e.target.value })}
        placeholder="제조사"
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
      <input
        value={form.supplier}
        onChange={(e) => onChange({ ...form, supplier: e.target.value })}
        placeholder="공급사"
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
      <input
        value={form.location}
        onChange={(e) => onChange({ ...form, location: e.target.value })}
        placeholder="설치위치"
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
      <input
        value={form.notes}
        onChange={(e) => onChange({ ...form, notes: e.target.value })}
        placeholder="비고"
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:col-span-2"
      />
      <input
        value={form.serialNumber}
        onChange={(e) => onChange({ ...form, serialNumber: e.target.value })}
        placeholder="시리얼번호 (선택)"
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
      <DatePickerField
        value={form.installedDate}
        onChange={(value) => onChange({ ...form, installedDate: value })}
        ariaLabel="설치일 선택"
        placeholder="설치일"
      />
    </div>
  );
}

function EquipmentRow({ item, merchantId }: { item: MerchantEquipmentItem; merchantId: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<EquipmentFormState>({
    category: item.category ?? "etc",
    components: item.components ?? "",
    quantity: String(item.quantity ?? 1),
    manufacturer: item.manufacturer ?? "",
    supplier: item.supplier ?? "",
    location: item.location ?? "",
    notes: item.notes ?? "",
    name: item.name ?? "",
    serialNumber: item.serial_number ?? "",
    installedDate: item.installed_date ?? "",
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const result = await updateMerchantEquipment(item.id, merchantId, toInput(form));
    setSubmitting(false);
    if (result.error) {
      alert("설치 구성 수정 실패: " + result.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function changeStatus(value: string) {
    setStatusUpdating(true);
    const result = await updateMerchantEquipmentStatus(
      item.id,
      value as MerchantEquipmentStatusInput,
    );
    setStatusUpdating(false);
    if (result.error) {
      alert("상태 변경 실패: " + result.error);
      return;
    }
    router.refresh();
  }

  async function remove() {
    if (!confirm(`"${item.components || item.name}" 항목을 삭제할까요?`)) return;
    setDeleting(true);
    const result = await deleteMerchantEquipment(item.id);
    setDeleting(false);
    if (result.error) {
      alert("삭제 실패: " + result.error);
      return;
    }
    router.refresh();
  }

  if (editing) {
    return (
      <tr>
        <td colSpan={7} className="bg-blue-50/40 px-3 py-3">
          <form onSubmit={submit} className="space-y-2">
            <EquipmentFormFields form={form} onChange={setForm} />
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
        </td>
      </tr>
    );
  }

  const category = item.category ?? "etc";
  return (
    <tr className="border-t border-slate-100">
      <td className="whitespace-nowrap px-3 py-2.5 text-sm font-semibold text-slate-700">
        {MERCHANT_EQUIPMENT_CATEGORY_LABEL[category]}
      </td>
      <td className="px-3 py-2.5 text-sm text-slate-700">{item.components || item.name}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-sm text-slate-600">
        {item.quantity ?? 1}세트
      </td>
      <td className="px-3 py-2.5 text-sm text-slate-600">
        {[item.manufacturer, item.supplier].filter(Boolean).join(" / ") || "-"}
      </td>
      <td className="px-3 py-2.5 text-sm text-slate-600">{item.location || "-"}</td>
      <td className="px-3 py-2.5 text-sm text-slate-500">{item.notes || "-"}</td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          <AppSelect
            value={item.status}
            disabled={statusUpdating}
            onValueChange={changeStatus}
            options={STATUS_OPTIONS}
            className="h-8 text-xs"
            aria-label="상태"
          />
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            수정
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={deleting}
            className="rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 disabled:opacity-50"
          >
            삭제
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function InstallCompositionSection({
  merchantId,
  equipment,
  categorySummaries,
  totalEquipmentSets,
}: {
  merchantId: string;
  equipment: MerchantEquipmentItem[];
  categorySummaries: MerchantEquipmentCategorySummary[];
  totalEquipmentSets: number;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<EquipmentFormState>(EMPTY_FORM);

  async function submitAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const result = await addMerchantEquipment(merchantId, toInput(form));
    setSubmitting(false);
    if (result.error) {
      alert("설치 구성 등록 실패: " + result.error);
      return;
    }
    if (result.skipped) {
      alert("설치 구성 테이블이 아직 적용되지 않아 저장하지 않았습니다.");
      return;
    }
    setForm(EMPTY_FORM);
    setAdding(false);
    router.refresh();
  }

  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 md:px-6">
        <h3 className="mb-3 text-sm font-bold text-slate-900">설치 구성 요약</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {categorySummaries.map((summary) => (
            <div
              key={summary.category}
              className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3"
            >
              <p className="text-xs text-slate-400">
                {MERCHANT_EQUIPMENT_CATEGORY_LABEL[summary.category]}
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">{summary.totalQuantity}세트</p>
              <p className="mt-1 truncate text-xs text-slate-400" title={summary.componentsSummary}>
                {summary.componentsSummary || "-"}
              </p>
            </div>
          ))}
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3">
            <p className="text-xs text-blue-500">총 설치 구성</p>
            <p className="mt-1 text-xl font-bold text-blue-700">{totalEquipmentSets}세트</p>
            <p className="mt-1 text-xs text-blue-400">현재 가맹점 설치 기준</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900">설치 구성 상세</h3>
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              구성 추가
            </button>
          )}
        </div>

        {adding && (
          <form
            onSubmit={submitAdd}
            className="mt-3 space-y-2 rounded-xl border border-blue-100 bg-blue-50/40 p-3"
          >
            <EquipmentFormFields form={form} onChange={setForm} />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setAdding(false);
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {submitting ? "등록 중..." : "등록"}
              </button>
            </div>
          </form>
        )}

        {equipment.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">등록된 설치 구성이 없습니다.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold text-slate-400">
                  <th className="px-3 py-2">설치구분</th>
                  <th className="px-3 py-2">구성</th>
                  <th className="px-3 py-2">수량</th>
                  <th className="px-3 py-2">제조사/공급사</th>
                  <th className="px-3 py-2">설치위치</th>
                  <th className="px-3 py-2">비고</th>
                  <th className="px-3 py-2 text-right">관리</th>
                </tr>
              </thead>
              <tbody>
                {equipment.map((item) => (
                  <EquipmentRow key={item.id} item={item} merchantId={merchantId} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
