"use client";

import { useEffect, useState } from "react";
import { XIcon } from "lucide-react";
import type { ApplicantType, FranchiseChannel, Profile } from "@/types";
import { APPLICANT_TYPE_LABEL, FRANCHISE_CHANNEL_LABEL, PROGRAMS, VAN_COMPANIES } from "@/types";
import { formatBusinessNumber, formatPhone } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { AppSelect } from "@/components/ui/AppSelect";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { LEAD_SOURCES, LEAD_TYPES, LEAD_INTERNET_PROVIDERS, LEAD_EQUIPMENT_CATALOG } from "./lead";
import type { OwnLeadInput } from "./lead";

const CUSTOM_SOURCE = "__custom__";

interface Props {
  csProfiles: Pick<Profile, "id" | "name" | "role">[];
  defaultAssigneeId: string;
  onSubmit: (input: OwnLeadInput) => Promise<void>;
  submitting: boolean;
  onClose: () => void;
}

function initialForm(defaultAssigneeId: string): OwnLeadInput {
  const now = new Date();
  const receptionDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  return {
    business_name: "",
    owner_name: "",
    phone: "",
    region: "",
    source: LEAD_SOURCES[0],
    lead_type: "",
    assignee_id: defaultAssigneeId,
    open_date: "",
    note: "",
    applicant_type: "individual",
    business_number: "",
    channel: "",
    is_rental: false,
    is_installment: false,
    reception_date: receptionDate,
    card_apply_date: "",
    internet: "",
    program: "",
    equipment_items: [],
    address: "",
    address_detail: "",
    install_date: "",
    van_company: "",
  };
}

const inputClass =
  "border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/30 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2";
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

export default function LeadForm({
  csProfiles,
  defaultAssigneeId,
  onSubmit,
  submitting,
  onClose,
}: Props) {
  const [form, setForm] = useState<OwnLeadInput>(() => initialForm(defaultAssigneeId));
  const [sourceMode, setSourceMode] = useState<string>(LEAD_SOURCES[0]);
  const [customSource, setCustomSource] = useState("");
  const [productSelect, setProductSelect] = useState<string>(LEAD_EQUIPMENT_CATALOG[0]);
  const [productQty, setProductQty] = useState(1);
  const [duplicateWarning, setDuplicateWarning] = useState("");
  const vanSelected = form.van_company
    ? form.van_company
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  useEffect(() => {
    const digits = form.business_number.replace(/\D/g, "");
    let cancelled = false;
    const timer = setTimeout(() => {
      if (digits.length !== 10) {
        setDuplicateWarning("");
        return;
      }
      const hyphenated = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
      const supabase = createClient();
      void Promise.all([
        supabase
          .from("franchise_applications")
          .select("id, business_name, owner_name, status, created_at")
          .or(`business_number.eq.${digits},business_number.eq.${hyphenated}`)
          .limit(3),
        supabase
          .from("merchants")
          .select("id, business_name, owner_name")
          .or(`business_number.eq.${digits},business_number.eq.${hyphenated}`)
          .limit(3),
      ]).then(([{ data: applications }, { data: merchants }]) => {
        if (cancelled) return;
        const parts: string[] = [];
        if (applications && applications.length > 0) {
          parts.push(
            `가맹접수: ${applications.map((a) => `${a.business_name}(${a.owner_name})`).join(", ")}`,
          );
        }
        if (merchants && merchants.length > 0) {
          parts.push(
            `가맹점: ${merchants.map((m) => `${m.business_name}(${m.owner_name})`).join(", ")}`,
          );
        }
        setDuplicateWarning(parts.join(" · "));
      });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.business_number]);

  function addProduct() {
    setForm((current) => ({
      ...current,
      equipment_items: [...current.equipment_items, { name: productSelect, quantity: productQty }],
    }));
  }

  function removeProduct(index: number) {
    setForm((current) => ({
      ...current,
      equipment_items: current.equipment_items.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function toggleVan(company: string) {
    const next = vanSelected.includes(company)
      ? vanSelected.filter((value) => value !== company)
      : [...vanSelected, company];
    setForm((current) => ({ ...current, van_company: next.join(", ") }));
  }

  const invalid = !form.business_name.trim() || !form.lead_type;

  async function handleSubmit() {
    if (submitting || invalid) return;
    await onSubmit({
      ...form,
      business_name: form.business_name.trim(),
      owner_name: form.owner_name.trim(),
      phone: form.phone.trim(),
      region: form.region.trim(),
      source: sourceMode === CUSTOM_SOURCE ? customSource.trim() || "기타" : sourceMode,
      business_number: form.business_number.trim(),
      address: form.address.trim(),
      address_detail: form.address_detail.trim(),
      note: form.note.trim(),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-6"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-create-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="bg-card text-foreground flex max-h-[90vh] w-[820px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-2xl shadow-2xl"
      >
        <div className="border-border flex flex-shrink-0 items-center justify-between border-b px-7 py-5">
          <div id="lead-create-title" className="text-foreground text-[19px] font-bold">
            자체리드 등록
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
              <div className="flex flex-col gap-3.5">
                <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
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
                </div>
                <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                  <Field label="사업자 유형">
                    <AppSelect
                      value={form.applicant_type}
                      onValueChange={(value) =>
                        setForm({ ...form, applicant_type: value as ApplicantType })
                      }
                      aria-label="사업자 유형"
                      options={(Object.keys(APPLICANT_TYPE_LABEL) as ApplicantType[]).map(
                        (type) => ({
                          value: type,
                          label: APPLICANT_TYPE_LABEL[type],
                        }),
                      )}
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
                    {duplicateWarning && (
                      <p className="mt-1 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
                        <span className="font-bold shrink-0">확인</span>
                        <span>
                          같은 사업자번호로 이미 등록된 건이 있습니다 — {duplicateWarning}
                        </span>
                      </p>
                    )}
                  </Field>
                </div>
              </div>
            </div>

            <div>
              <div className="text-foreground mb-2.5 text-[13px] font-bold">접수 정보</div>
              <div className="flex flex-col gap-3.5">
                <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
                  <Field label="채널">
                    <AppSelect
                      value={form.channel}
                      onValueChange={(value) =>
                        setForm({ ...form, channel: value as FranchiseChannel | "" })
                      }
                      aria-label="채널"
                      options={[
                        { value: "", label: "선택 안함" },
                        ...(Object.keys(FRANCHISE_CHANNEL_LABEL) as FranchiseChannel[]).map(
                          (c) => ({
                            value: c,
                            label: FRANCHISE_CHANNEL_LABEL[c],
                          }),
                        ),
                      ]}
                    />
                  </Field>
                  <Field label="리드 구분">
                    <AppSelect
                      value={form.lead_type}
                      onValueChange={(value) => setForm({ ...form, lead_type: value })}
                      aria-label="리드 구분"
                      options={[
                        { value: "", label: "선택" },
                        ...LEAD_TYPES.map((t) => ({ value: t, label: t })),
                      ]}
                    />
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
                    <DatePickerField
                      value={form.reception_date}
                      onChange={(value) => setForm({ ...form, reception_date: value })}
                      ariaLabel="접수날짜"
                      className="w-full"
                    />
                  </Field>
                  <Field label="카드가맹접수일">
                    <DatePickerField
                      value={form.card_apply_date}
                      onChange={(value) => setForm({ ...form, card_apply_date: value })}
                      ariaLabel="카드가맹접수일"
                      className="w-full"
                    />
                  </Field>
                  <Field label="인터넷">
                    <AppSelect
                      value={form.internet}
                      onValueChange={(value) => setForm({ ...form, internet: value })}
                      aria-label="인터넷"
                      options={[
                        { value: "", label: "미설정" },
                        ...LEAD_INTERNET_PROVIDERS.map((provider) => ({
                          value: provider,
                          label: provider,
                        })),
                      ]}
                    />
                  </Field>
                  <Field label="담당자">
                    <AppSelect
                      value={form.assignee_id}
                      onValueChange={(value) => setForm({ ...form, assignee_id: value })}
                      aria-label="담당자"
                      options={[
                        { value: "", label: "미배정" },
                        ...csProfiles.map((profile) => ({
                          value: profile.id,
                          label: profile.name,
                        })),
                      ]}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-3.5 md:grid-cols-4">
                  <Field label="사용 프로그램">
                    <AppSelect
                      value={form.program}
                      onValueChange={(value) => setForm({ ...form, program: value })}
                      aria-label="사용 프로그램"
                      options={[
                        { value: "", label: "선택 안함" },
                        ...PROGRAMS.map((p) => ({ value: p, label: p })),
                      ]}
                    />
                  </Field>
                  <Field label="유입경로">
                    {sourceMode === CUSTOM_SOURCE ? (
                      <div className="flex flex-col gap-1">
                        <input
                          value={customSource}
                          onChange={(event) => setCustomSource(event.target.value)}
                          placeholder="직접 입력"
                          className={inputClass}
                        />
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground text-xs underline self-start"
                          onClick={() => {
                            setSourceMode(LEAD_SOURCES[0]);
                            setCustomSource("");
                          }}
                        >
                          목록에서 선택
                        </button>
                      </div>
                    ) : (
                      <AppSelect
                        value={sourceMode}
                        onValueChange={setSourceMode}
                        aria-label="유입경로"
                        options={[
                          ...LEAD_SOURCES.map((s) => ({ value: s, label: s })),
                          { value: CUSTOM_SOURCE, label: "직접 입력" },
                        ]}
                      />
                    )}
                  </Field>
                  <Field label="지역">
                    <input
                      placeholder="지역 입력"
                      value={form.region}
                      onChange={(event) => setForm({ ...form, region: event.target.value })}
                      className={inputClass}
                    />
                  </Field>
                </div>
              </div>
            </div>

            <div>
              <div className="text-foreground mb-2.5 text-[13px] font-bold">상품</div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <AppSelect
                    value={productSelect}
                    onValueChange={setProductSelect}
                    aria-label="상품 선택"
                    options={LEAD_EQUIPMENT_CATALOG.map((product) => ({
                      value: product,
                      label: product,
                    }))}
                  />
                </div>
                <div className="w-12 shrink-0">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={productQty}
                    onChange={(event) =>
                      setProductQty(
                        Math.min(99, Math.max(1, Math.trunc(Number(event.target.value)) || 1)),
                      )
                    }
                    className={`${inputClass} text-center`}
                  />
                </div>
                <button type="button" onClick={addProduct} className={secondaryButton}>
                  추가
                </button>
              </div>
              {form.equipment_items.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {form.equipment_items.map((product, index) => (
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
                    onChange={(event) => setForm({ ...form, address_detail: event.target.value })}
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              <Field label="오픈예정일">
                <DatePickerField
                  value={form.open_date}
                  onChange={(value) => setForm({ ...form, open_date: value })}
                  ariaLabel="오픈예정일"
                  className="w-full"
                />
              </Field>
              <Field label="설치 및 발송일">
                <DatePickerField
                  value={form.install_date}
                  onChange={(value) => setForm({ ...form, install_date: value })}
                  ariaLabel="설치 및 발송일"
                  className="w-full"
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
                placeholder="대표님이 전달한 내용을 그대로 적어 두세요"
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                rows={3}
                className={`${inputClass} h-auto resize-y py-2`}
              />
            </Field>
          </div>
        </div>

        <div className="border-border flex flex-shrink-0 items-center justify-between border-t px-7 py-4">
          <span className="text-muted-foreground text-xs">리드 구분과 상호명은 필수입니다.</span>
          <button
            type="button"
            disabled={submitting || invalid}
            onClick={() => void handleSubmit()}
            className={primaryButton}
          >
            {submitting ? "등록 중..." : "등록"}
          </button>
        </div>
      </div>
    </div>
  );
}
