"use client";

import { useState } from "react";
import { XIcon, SearchIcon } from "lucide-react";
import type {
  ApplicantType,
  EquipmentItem,
  Profile,
  FranchiseChannel,
  FranchiseCaseType,
  FranchisePreviousSnapshot,
} from "@/types";
import { APPLICANT_TYPE_LABEL, FRANCHISE_CHANNEL_LABEL, FRANCHISE_CASE_TYPE_LABEL } from "@/types";
import { formatBusinessNumber, formatPhone } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

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
const VAN_COMPANIES = ["코세스2", "코세스1", "코벤", "기가맹"];
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
  channel: FranchiseChannel | "";
  case_type: FranchiseCaseType;
  is_rental: boolean;
  is_installment: boolean;
  merchant_id: string | null;
  previous_snapshot: FranchisePreviousSnapshot | null;
  reception_date: string;
  card_apply_date: string;
  open_date: string;
  install_date: string;
  van_company: string;
  internet: string;
  memo: string;
  sendDocNotify: boolean;
}

interface Props {
  onSubmit: (form: FranchiseCreateInput) => Promise<boolean>;
  submitting: boolean;
  onClose: () => void;
  csProfiles?: Pick<Profile, "id" | "name" | "role">[];
  /** "new"면 바로 빈 폼, "existing"이면 매장 검색부터 거친 뒤 폼으로 진입 (전환/승계/명변) */
  mode?: "new" | "existing";
}

interface MerchantSearchResult {
  id: string;
  business_name: string;
  owner_name: string;
  phone: string;
}

const EXISTING_CASE_TYPES: FranchiseCaseType[] = ["conversion", "succession", "name_change"];

function initialForm(mode: "new" | "existing"): FranchiseCreateInput {
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
    reception_channel: "",
    channel: "",
    case_type: mode === "existing" ? "conversion" : "new",
    is_rental: false,
    is_installment: false,
    merchant_id: null,
    previous_snapshot: null,
    reception_date: receptionDate,
    card_apply_date: "",
    open_date: "",
    install_date: "",
    van_company: "",
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
  mode = "new",
}: Props) {
  const [form, setForm] = useState(() => initialForm(mode));
  const [step, setStep] = useState<"search" | "form">(mode === "existing" ? "search" : "form");
  const [productSelect, setProductSelect] = useState(EQUIPMENT_CATALOG[0]);
  const [productQty, setProductQty] = useState(1);
  const [merchantQuery, setMerchantQuery] = useState("");
  const [merchantResults, setMerchantResults] = useState<MerchantSearchResult[]>([]);
  const [merchantSearching, setMerchantSearching] = useState(false);
  const [loadedMerchantLabel, setLoadedMerchantLabel] = useState("");
  const [merchantNotFound, setMerchantNotFound] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const vanSelected = form.van_company
    ? form.van_company
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  async function searchMerchants() {
    const term = merchantQuery.trim();
    if (!term) return;
    setMerchantSearching(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("merchants")
      .select("id, business_name, owner_name, phone")
      .or(`business_name.ilike.%${term}%,owner_name.ilike.%${term}%,phone.ilike.%${term}%`)
      .limit(10);
    setMerchantResults(data ?? []);
    setMerchantSearching(false);
  }

  async function loadMerchant(merchant: MerchantSearchResult) {
    const supabase = createClient();
    const [{ data: merchantRow }, { data: latestApplication }] = await Promise.all([
      supabase
        .from("merchants")
        .select(
          "id, business_name, owner_name, business_number, phone, address, address_detail, memo",
        )
        .eq("id", merchant.id)
        .single(),
      supabase
        .from("franchise_applications")
        .select("applicant_type, title, sales_id, cs_id, van_company, internet, equipment_items")
        .eq("merchant_id", merchant.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!merchantRow) return;

    const previousSnapshot: FranchisePreviousSnapshot = {
      business_name: merchantRow.business_name,
      owner_name: merchantRow.owner_name,
      business_number: merchantRow.business_number ?? undefined,
      phone: merchantRow.phone,
      address: merchantRow.address ?? undefined,
      address_detail: merchantRow.address_detail ?? undefined,
      applicant_type: latestApplication?.applicant_type ?? undefined,
      title: latestApplication?.title ?? undefined,
      van_company: latestApplication?.van_company ?? undefined,
      internet: latestApplication?.internet ?? undefined,
      equipment_items: latestApplication?.equipment_items ?? undefined,
      sales_id: latestApplication?.sales_id ?? undefined,
      cs_id: latestApplication?.cs_id ?? undefined,
    };

    setForm((current) => ({
      ...current,
      merchant_id: merchantRow.id,
      previous_snapshot: previousSnapshot,
      business_name: merchantRow.business_name ?? current.business_name,
      owner_name: merchantRow.owner_name ?? current.owner_name,
      business_number: merchantRow.business_number ?? current.business_number,
      phone: merchantRow.phone ?? current.phone,
      address: merchantRow.address ?? current.address,
      address_detail: merchantRow.address_detail ?? current.address_detail,
      applicant_type: latestApplication?.applicant_type ?? current.applicant_type,
      title: latestApplication?.title ?? current.title,
      van_company: latestApplication?.van_company ?? current.van_company,
      internet: latestApplication?.internet ?? current.internet,
      equipmentItems: latestApplication?.equipment_items ?? current.equipmentItems,
    }));
    setLoadedMerchantLabel(`${merchantRow.business_name} · ${merchantRow.owner_name}`);
    setMerchantResults([]);
    setMerchantQuery("");
    setMerchantNotFound(false);
    setSubmitError("");
    setStep("form");
  }

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

  function toggleVan(company: string) {
    const next = vanSelected.includes(company)
      ? vanSelected.filter((value) => value !== company)
      : [...vanSelected, company];
    setForm((current) => ({ ...current, van_company: next.join(", ") }));
  }

  async function handleSubmit() {
    if (submitting) return;
    if (form.case_type !== "new" && !form.merchant_id && !merchantNotFound) {
      setSubmitError(
        `"${FRANCHISE_CASE_TYPE_LABEL[form.case_type]}"은(는) 기존 매장을 불러오거나, 찾을 수 없으면 "매장을 찾을 수 없음"을 선택해주세요.`,
      );
      return;
    }
    setSubmitError("");
    const success = await onSubmit(form);
    if (success) {
      setForm(initialForm(mode));
      setStep(mode === "existing" ? "search" : "form");
      setLoadedMerchantLabel("");
      setMerchantNotFound(false);
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
            {step === "search" ? "전환·승계·명변 접수 — 매장 검색" : "프랜차이즈 정보 입력"}
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

        {step === "search" ? (
          <div className="flex-1 overflow-y-auto px-7 py-5">
            <div className="flex flex-col gap-4">
              <div>
                <div className="text-foreground mb-2.5 text-[13px] font-bold">구분</div>
                <div className="flex gap-2">
                  {EXISTING_CASE_TYPES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, case_type: c })}
                      className={`h-9 rounded-lg border px-4 text-sm font-semibold ${
                        form.case_type === c
                          ? "border-primary bg-primary-muted text-primary"
                          : "border-border bg-card text-foreground hover:border-primary/50"
                      }`}
                    >
                      {FRANCHISE_CASE_TYPE_LABEL[c]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-foreground mb-2.5 text-[13px] font-bold">매장 검색</div>
                <div className="flex gap-1.5">
                  <input
                    value={merchantQuery}
                    onChange={(event) => setMerchantQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void searchMerchants();
                      }
                    }}
                    placeholder="상호명, 대표자, 전화번호 검색"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => void searchMerchants()}
                    disabled={merchantSearching}
                    className={secondaryButton}
                  >
                    <SearchIcon className="size-4" />
                  </button>
                </div>
                {merchantResults.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {merchantResults.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => void loadMerchant(m)}
                          className="hover:bg-muted flex w-full items-center justify-between rounded-lg border border-transparent px-2.5 py-1.5 text-left text-sm"
                        >
                          <span>
                            {m.business_name} · {m.owner_name}
                          </span>
                          <span className="text-muted-foreground text-xs">{m.phone}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMerchantNotFound(true);
                    setSubmitError("");
                    setStep("form");
                  }}
                  className="text-muted-foreground hover:text-foreground mt-2 text-xs underline"
                >
                  매장을 찾을 수 없음 (직접 입력)
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-7 py-5">
              <div className="flex flex-col gap-5">
                {mode === "existing" && (
                  <div className="border-border bg-surface-subtle flex items-center justify-between rounded-lg border px-3 py-2.5">
                    <span className="text-sm">
                      {merchantNotFound
                        ? `매장을 찾을 수 없어 직접 입력 중 (${FRANCHISE_CASE_TYPE_LABEL[form.case_type]})`
                        : `선택한 매장: ${loadedMerchantLabel} (${FRANCHISE_CASE_TYPE_LABEL[form.case_type]})`}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setStep("search");
                        setMerchantResults([]);
                        setMerchantQuery("");
                      }}
                      className="text-primary text-xs font-medium"
                    >
                      다시 검색
                    </button>
                  </div>
                )}
                <div>
                  <div className="text-foreground mb-2.5 text-[13px] font-bold">기본 정보</div>
                  <div className="flex flex-col gap-3.5">
                    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
                      <Field label="상호명">
                        <input
                          placeholder="상호명 입력"
                          value={form.business_name}
                          onChange={(event) =>
                            setForm({ ...form, business_name: event.target.value })
                          }
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
                    </div>
                    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                      <Field label="사업자 유형">
                        <select
                          value={form.applicant_type}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              applicant_type: event.target.value as ApplicantType,
                            })
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
                </div>

                <div>
                  <div className="text-foreground mb-2.5 text-[13px] font-bold">접수 정보</div>
                  <div className="flex flex-col gap-3.5">
                    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
                      <Field label="채널">
                        <select
                          value={form.channel}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              channel: event.target.value as FranchiseChannel | "",
                            })
                          }
                          className={selectClass}
                        >
                          <option value="">선택 안함</option>
                          {(Object.keys(FRANCHISE_CHANNEL_LABEL) as FranchiseChannel[]).map((c) => (
                            <option key={c} value={c}>
                              {FRANCHISE_CHANNEL_LABEL[c]}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="구분">
                        <select value={form.case_type} disabled className={selectClass}>
                          <option value={form.case_type}>
                            {FRANCHISE_CASE_TYPE_LABEL[form.case_type]}
                          </option>
                        </select>
                      </Field>
                      <Field label="옵션">
                        <div className="flex h-9 items-center gap-3">
                          <label className="text-foreground flex cursor-pointer items-center gap-1.5 text-sm select-none">
                            <input
                              type="checkbox"
                              checked={form.is_rental}
                              onChange={(event) =>
                                setForm({ ...form, is_rental: event.target.checked })
                              }
                              className="accent-primary size-[15px] cursor-pointer"
                            />
                            렌탈
                          </label>
                          <label className="text-foreground flex cursor-pointer items-center gap-1.5 text-sm select-none">
                            <input
                              type="checkbox"
                              checked={form.is_installment}
                              onChange={(event) =>
                                setForm({ ...form, is_installment: event.target.checked })
                              }
                              className="accent-primary size-[15px] cursor-pointer"
                            />
                            할부
                          </label>
                        </div>
                      </Field>
                    </div>
                    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-4">
                      <Field label="접수날짜">
                        <input
                          type="date"
                          value={form.reception_date}
                          onChange={(event) =>
                            setForm({ ...form, reception_date: event.target.value })
                          }
                          className={inputClass}
                        />
                      </Field>
                      <Field label="카드가맹접수일">
                        <input
                          type="date"
                          value={form.card_apply_date}
                          onChange={(event) =>
                            setForm({ ...form, card_apply_date: event.target.value })
                          }
                          className={inputClass}
                        />
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
                        className={`${inputClass} md:col-span-2`}
                      />
                    </Field>
                    <Field label="상세주소">
                      <input
                        placeholder="상세주소 입력"
                        value={form.address_detail}
                        onChange={(event) =>
                          setForm({ ...form, address_detail: event.target.value })
                        }
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                  <Field label="오픈예정일">
                    <input
                      type="date"
                      value={form.open_date}
                      onChange={(event) => setForm({ ...form, open_date: event.target.value })}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="설치 및 발송일">
                    <input
                      type="date"
                      value={form.install_date}
                      onChange={(event) => setForm({ ...form, install_date: event.target.value })}
                      className={inputClass}
                    />
                  </Field>
                </div>

                <div>
                  <div className="text-foreground mb-2.5 text-[13px] font-bold">
                    VAN사 (중복선택 가능)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {VAN_COMPANIES.map((company) => {
                      const active = vanSelected.includes(company);
                      return (
                        <button
                          key={company}
                          type="button"
                          onClick={() => toggleVan(company)}
                          className={`h-8 rounded-full border px-3.5 text-xs font-semibold ${active ? "border-primary bg-primary-muted text-primary" : "border-border bg-card text-foreground hover:border-primary/50"}`}
                        >
                          {company}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Field label="비고">
                  <textarea
                    placeholder="비고 입력"
                    value={form.memo}
                    onChange={(event) => setForm({ ...form, memo: event.target.value })}
                    rows={3}
                    className={`${inputClass} h-auto resize-y py-2`}
                  />
                </Field>
              </div>
            </div>

            <div className="border-border flex flex-shrink-0 flex-col gap-2 border-t px-7 py-4">
              {submitError && <span className="text-error text-xs">{submitError}</span>}
              <div className="flex items-center justify-between">
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
          </>
        )}
      </div>
    </div>
  );
}
