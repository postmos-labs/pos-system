"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";
import type { ApplicantType, EquipmentItem, Profile } from "@/types";
import { APPLICANT_TYPE_LABEL } from "@/types";
import { formatBusinessNumber, formatPhone } from "@/lib/format";
import { VAN_COMPANY_OPTIONS } from "@/lib/franchiseCodes";

const RECEPTION_CHANNELS = [
  "토스 홈페이지",
  "직접 영업",
  "전환",
  "토스리드건",
  "토스프리미엄",
  "승계",
  "명변",
  "랜탈",
  "할부",
];
const EQUIPMENT_CATALOG = [
  "토스프론트",
  "토스단말기",
  "카드단말기",
  "포스기",
  "인터넷",
  "키오스크",
  "영수증프린터",
  "주방프린터기",
  "키오스크리더기",
  "무선단말기",
  "금전함",
  "태블릿",
  "테이블오더",
  "보조배터리",
  "원격",
];
const INTERNET_PROVIDERS = ["3S", "백메가"];

export interface FranchiseCreateInput {
  business_name: string;
  owner_name: string;
  phone: string;
  business_number: string;
  equipmentItems: EquipmentItem[];
  address: string;
  address_detail: string;
  title: string;
  sales_id: string;
  cs_id: string;
  applicant_type: ApplicantType;
  reception_channel: string;
  reception_date: string;
  open_date: string;
  install_date: string;
  van_company_codes: string[];
  internet: string;
  memo: string;
  sendDocNotify: boolean;
}

interface Props {
  onSubmit: (form: FranchiseCreateInput) => Promise<boolean>;
  submitting: boolean;
  onClose: () => void;
  csProfiles?: Pick<Profile, "id" | "name" | "role">[];
}

function initialForm(): FranchiseCreateInput {
  const now = new Date();
  const receptionDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  return {
    business_name: "",
    owner_name: "",
    phone: "",
    business_number: "",
    equipmentItems: [],
    address: "",
    address_detail: "",
    title: "",
    sales_id: "",
    cs_id: "",
    applicant_type: "individual",
    reception_channel: RECEPTION_CHANNELS[0],
    reception_date: receptionDate,
    open_date: "",
    install_date: "",
    van_company_codes: [],
    internet: "",
    memo: "",
    sendDocNotify: false,
  };
}

const inputClass =
  "border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/30 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2";
const selectClass =
  "border-border bg-card text-foreground focus-visible:ring-primary/30 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2";
const secondaryButton =
  "focus-visible:ring-primary/30 border-border bg-card text-foreground hover:bg-muted inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50";
const primaryButton =
  "focus-visible:ring-primary/30 border-primary bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50";

function Field({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-muted-foreground text-xs">{label}</span>}
      {children}
    </div>
  );
}

export default function FranchiseCreateDialog({
  onSubmit,
  submitting,
  onClose,
  csProfiles = [],
}: Props) {
  const [form, setForm] = useState(initialForm);
  const [productSelect, setProductSelect] = useState(EQUIPMENT_CATALOG[0]);
  const [productQty, setProductQty] = useState(1);
  const vanSelected = form.van_company_codes;

  function addProduct() {
    setForm((current) => ({
      ...current,
      equipmentItems: [...current.equipmentItems, { name: productSelect, quantity: productQty }],
    }));
  }

  function removeProduct(index: number) {
    setForm((current) => ({
      ...current,
      equipmentItems: current.equipmentItems.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function toggleVan(code: string) {
    const next = vanSelected.includes(code)
      ? vanSelected.filter((value) => value !== code)
      : [...vanSelected, code];
    setForm((current) => ({ ...current, van_company_codes: next }));
  }

  async function handleSubmit() {
    if (submitting) return;
    const success = await onSubmit(form);
    if (success) {
      setForm(initialForm());
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-6"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="franchise-create-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="bg-card text-foreground flex max-h-[90vh] w-[820px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-2xl shadow-2xl"
      >
        <div className="border-border flex flex-shrink-0 items-center justify-between border-b px-7 py-5">
          <div id="franchise-create-title" className="text-foreground text-[19px] font-bold">
            프랜차이즈 정보 입력
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-9 items-center justify-center rounded-lg"
          >
            <XIcon className="size-4.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-5">
          <div className="flex flex-col gap-5">
            <div>
              <div className="text-foreground mb-2.5 text-[13px] font-bold">기본 정보</div>
              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-4">
                <Field label="상호명">
                  <input
                    placeholder="상호명 입력"
                    value={form.business_name}
                    onChange={(event) => setForm({ ...form, business_name: event.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="대표자명">
                  <input
                    placeholder="대표자명 입력"
                    value={form.owner_name}
                    onChange={(event) => setForm({ ...form, owner_name: event.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="연락처">
                  <input
                    placeholder="010-0000-0000"
                    value={form.phone}
                    onChange={(event) =>
                      setForm({ ...form, phone: formatPhone(event.target.value) })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="사업자번호">
                  <input
                    placeholder="000-00-00000"
                    value={form.business_number}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        business_number: formatBusinessNumber(event.target.value),
                      })
                    }
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>

            <div>
              <div className="text-foreground mb-2.5 text-[13px] font-bold">접수 정보</div>
              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-4">
                <Field label="접수날짜">
                  <input
                    type="date"
                    value={form.reception_date}
                    onChange={(event) => setForm({ ...form, reception_date: event.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="접수채널">
                  <select
                    value={form.reception_channel}
                    onChange={(event) =>
                      setForm({ ...form, reception_channel: event.target.value })
                    }
                    className={selectClass}
                  >
                    {RECEPTION_CHANNELS.map((channel) => (
                      <option key={channel}>{channel}</option>
                    ))}
                  </select>
                </Field>
                <Field label="사업자 유형">
                  <select
                    value={form.applicant_type}
                    onChange={(event) =>
                      setForm({ ...form, applicant_type: event.target.value as ApplicantType })
                    }
                    className={selectClass}
                  >
                    {(Object.keys(APPLICANT_TYPE_LABEL) as ApplicantType[]).map((type) => (
                      <option key={type} value={type}>
                        {APPLICANT_TYPE_LABEL[type]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="인터넷">
                  <select
                    value={form.internet}
                    onChange={(event) => setForm({ ...form, internet: event.target.value })}
                    className={selectClass}
                  >
                    <option value="">미설정</option>
                    {INTERNET_PROVIDERS.map((provider) => (
                      <option key={provider}>{provider}</option>
                    ))}
                  </select>
                </Field>
                <Field label="담당자">
                  <select
                    value={form.cs_id}
                    onChange={(event) => setForm({ ...form, cs_id: event.target.value })}
                    className={selectClass}
                  >
                    <option value="">미배정</option>
                    {csProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            <div>
              <div className="text-foreground mb-2.5 text-[13px] font-bold">상품</div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <select
                    value={productSelect}
                    onChange={(event) => setProductSelect(event.target.value)}
                    className={selectClass}
                  >
                    {EQUIPMENT_CATALOG.map((product) => (
                      <option key={product}>{product}</option>
                    ))}
                  </select>
                </div>
                <div className="w-12 shrink-0">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={productQty}
                    onChange={(event) =>
                      setProductQty(Math.min(99, Number(event.target.value) || 1))
                    }
                    className={`${inputClass} text-center`}
                  />
                </div>
                <button type="button" onClick={addProduct} className={secondaryButton}>
                  추가
                </button>
              </div>
              {form.equipmentItems.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {form.equipmentItems.map((product, index) => (
                    <div
                      key={`${product.name}-${index}`}
                      className="bg-surface-subtle flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                    >
                      <span>
                        {product.name} × {product.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeProduct(index)}
                        className="text-error text-xs"
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="text-foreground mb-2.5 text-[13px] font-bold">주소</div>
              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
                <Field label="주소">
                  <input
                    placeholder="주소 입력"
                    value={form.address}
                    onChange={(event) => setForm({ ...form, address: event.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="상세주소">
                  <input
                    placeholder="상세주소 입력"
                    value={form.address_detail}
                    onChange={(event) => setForm({ ...form, address_detail: event.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="오픈예정일">
                  <input
                    type="date"
                    value={form.open_date}
                    onChange={(event) => setForm({ ...form, open_date: event.target.value })}
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              <Field label="설치 및 발송일">
                <input
                  type="date"
                  value={form.install_date}
                  onChange={(event) => setForm({ ...form, install_date: event.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="비고">
                <input
                  placeholder="비고 입력"
                  value={form.memo}
                  onChange={(event) => setForm({ ...form, memo: event.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>

            <div>
              <div className="text-foreground mb-2.5 text-[13px] font-bold">
                VAN사 (중복선택 가능)
              </div>
              <div className="flex flex-wrap gap-2">
                {VAN_COMPANY_OPTIONS.map((option) => {
                  const active = vanSelected.includes(option.code);
                  return (
                    <button
                      key={option.code}
                      type="button"
                      onClick={() => toggleVan(option.code)}
                      className={`h-8 rounded-full border px-3.5 text-xs font-semibold ${active ? "border-primary bg-primary-muted text-primary" : "border-border bg-card text-foreground hover:border-primary/50"}`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="border-border flex flex-shrink-0 items-center justify-between border-t px-7 py-4">
          <label className="text-foreground flex cursor-pointer items-center gap-2 text-sm select-none">
            <input
              type="checkbox"
              checked={form.sendDocNotify}
              onChange={(event) => setForm({ ...form, sendDocNotify: event.target.checked })}
              className="accent-primary size-[15px] cursor-pointer"
            />
            등록 즉시 서류안내 알림톡 발송
          </label>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className={primaryButton}
          >
            {submitting ? "등록 중..." : "등록"}
          </button>
        </div>
      </div>
    </div>
  );
}
