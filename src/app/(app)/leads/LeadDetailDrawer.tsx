"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { XIcon } from "lucide-react";
import type { ApplicantType, EquipmentItem, FranchiseChannel, Profile } from "@/types";
import { APPLICANT_TYPE_LABEL, FRANCHISE_CHANNEL_LABEL, PROGRAMS, VAN_COMPANIES } from "@/types";
import { formatBusinessNumber, formatPhone } from "@/lib/format";
import { AppSelect } from "@/components/ui/AppSelect";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { fetchLeadLogs } from "./actions";
import {
  CONTACT_STATUSES,
  CONTACT_STATUS_STYLE,
  DECISIONS,
  DECISION_GUIDE,
  DECISION_STYLE,
  DOC_STATUSES,
  DOC_STATUS_STYLE,
  formatLeadNo,
  INTERNET_STATUSES,
  INTERNET_STATUS_STYLE,
  LEAD_EQUIPMENT_CATALOG,
  LEAD_FIELD_LABELS,
  LEAD_INTERNET_PROVIDERS,
  LEAD_LOG_ACTION_LABELS,
  LEAD_SOURCES,
  LEAD_STAGE_LABELS,
  LEAD_STAGE_STYLE,
  LEAD_TYPES,
  LEAD_TYPE_STYLE,
  leadStage,
  VAN_STATUSES,
  VAN_STATUS_STYLE,
  type LeadEditableField,
  type LinkedFranchiseInfo,
  type OwnLead,
  type OwnLeadLog,
} from "./lead";

interface Props {
  row: OwnLead;
  csProfiles: Pick<Profile, "id" | "name" | "role">[];
  /** 이관된 건의 가맹접수 진행 상태. 이관 안 됐으면 undefined */
  linked?: LinkedFranchiseInfo;
  today: string;
  onClose: () => void;
  /** 저장 성공 시 true */
  onSave: (field: LeadEditableField, value: string) => Promise<boolean>;
  /** 상품 목록 저장. equipment_items는 배열이라 onSave와 따로 간다 */
  onEquipmentChange: (items: EquipmentItem[]) => Promise<boolean>;
  onConvert: () => void;
  onComplete: () => void;
  onReopen: () => void;
}

const inputClass =
  "border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/30 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2";
const secondaryButton =
  "focus-visible:ring-primary/30 border-border bg-card text-foreground hover:bg-muted inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50";
const primaryButton =
  "focus-visible:ring-primary/30 border-primary bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      {children}
    </div>
  );
}

function EditableInput({
  value,
  placeholder,
  formatter,
  onSave,
}: {
  value?: string | null;
  placeholder?: string;
  formatter?: (value: string) => string;
  onSave: (value: string) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(value ?? "");
  // 바깥 값이 바뀌면(다른 칸 저장 후 새 row) 초안을 맞춘다. effect 대신 렌더 중 동기화.
  const [syncedValue, setSyncedValue] = useState(value ?? "");
  if ((value ?? "") !== syncedValue) {
    setSyncedValue(value ?? "");
    setDraft(value ?? "");
  }
  function commit() {
    const next = formatter ? formatter(draft) : draft;
    setDraft(next);
    if (next !== (value ?? "")) onSave(next);
  }
  return (
    <input
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(formatter ? formatter(event.target.value) : event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className={inputClass}
    />
  );
}

function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

function toKstDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toKstDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return `${toKstDate(iso)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function toShortDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function LeadDetailDrawer({
  row,
  csProfiles,
  linked,
  onClose,
  onSave,
  onEquipmentChange,
  onConvert,
  onComplete,
  onReopen,
}: Props) {
  const stage = leadStage(row);
  const leadType = row.lead_type ?? "기타";
  const vanStatus = row.van_status ?? "미접수";
  const internetStatus = row.internet_status ?? "해당없음";
  // 153 전 환경 대비 기본값
  const applicantType: ApplicantType = row.applicant_type ?? "individual";
  const isRental = row.is_rental ?? false;
  const isInstallment = row.is_installment ?? false;
  const equipmentItems = row.equipment_items ?? [];
  const vans = row.van_company
    ? row.van_company
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  const [noteDraft, setNoteDraft] = useState(row.note ?? "");
  // 목록에서 비고를 고친 뒤 드로어를 보면 새 값이 보여야 한다. effect 대신 렌더 중 동기화.
  const [syncedNote, setSyncedNote] = useState(row.note ?? "");
  if ((row.note ?? "") !== syncedNote) {
    setSyncedNote(row.note ?? "");
    setNoteDraft(row.note ?? "");
  }

  const [productSelect, setProductSelect] = useState<string>(LEAD_EQUIPMENT_CATALOG[0]);
  const [productQty, setProductQty] = useState(1);

  const [logs, setLogs] = useState<OwnLeadLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLogsLoading(true);
      setLogsError(null);
      const result = await fetchLeadLogs(row.id);
      if (cancelled) return;
      setLogs(result.logs);
      setLogsError(result.error);
      setLogsLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [row.id, row.updated_at]);

  function handleSave(field: LeadEditableField) {
    return (value: string) => {
      void onSave(field, value);
    };
  }

  function addProduct() {
    void onEquipmentChange([...equipmentItems, { name: productSelect, quantity: productQty }]);
  }
  function removeProduct(index: number) {
    void onEquipmentChange(equipmentItems.filter((_, itemIndex) => itemIndex !== index));
  }
  function toggleVan(company: string) {
    handleSave("van_company")(
      (vans.includes(company)
        ? vans.filter((value) => value !== company)
        : [...vans, company]
      ).join(", "),
    );
  }

  const sourceOptions = (LEAD_SOURCES as readonly string[]).includes(row.source)
    ? LEAD_SOURCES.map((source) => ({ value: source, label: source }))
    : [
        ...LEAD_SOURCES.map((source) => ({ value: source, label: source })),
        { value: row.source, label: row.source },
      ];

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/35" onMouseDown={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="bg-card text-foreground absolute inset-y-0 right-0 flex h-dvh w-[820px] max-w-[calc(100vw-32px)] flex-col shadow-2xl"
      >
        <div className="border-border flex-shrink-0 border-b px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <div id="lead-detail-title" className="text-foreground text-lg font-bold">
                {row.business_name || "-"}
              </div>
              <div className="text-muted-foreground mt-1 text-[13.5px]">
                {row.owner_name || "-"} · {APPLICANT_TYPE_LABEL[applicantType]} · {row.phone || "-"}{" "}
                · {row.region || "-"}
              </div>
            </div>
            <button
              type="button"
              aria-label="닫기"
              onClick={onClose}
              className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-9 items-center justify-center rounded-lg"
            >
              <XIcon className="size-4" />
            </button>
          </div>
          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
            <Pill
              label={formatLeadNo(row.lead_no)}
              className="bg-slate-100 text-slate-600 border-slate-200"
            />
            <Pill label={LEAD_STAGE_LABELS[stage]} className={LEAD_STAGE_STYLE[stage]} />
            <Pill label={leadType} className={LEAD_TYPE_STYLE[leadType]} />
            <span className="text-muted-foreground text-sm">
              접수일 {toKstDate(row.created_at)} · 접수자 {row.created_by_name || "-"}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-5">
            <div>
              <div className="text-foreground mb-2.5 text-[13px] font-bold">기본 정보</div>
              <div className="flex flex-col gap-3.5">
                <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
                  <Field label="상호명">
                    <EditableInput value={row.business_name} onSave={handleSave("business_name")} />
                  </Field>
                  <Field label="대표자">
                    <EditableInput value={row.owner_name} onSave={handleSave("owner_name")} />
                  </Field>
                  <Field label="연락처">
                    <EditableInput
                      value={row.phone}
                      formatter={formatPhone}
                      onSave={handleSave("phone")}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <Field label="사업자 유형">
                    <AppSelect
                      aria-label="사업자 유형"
                      value={applicantType}
                      onValueChange={handleSave("applicant_type")}
                      options={(Object.keys(APPLICANT_TYPE_LABEL) as ApplicantType[]).map(
                        (type) => ({
                          value: type,
                          label: APPLICANT_TYPE_LABEL[type],
                        }),
                      )}
                    />
                  </Field>
                  <Field label="사업자번호">
                    <EditableInput
                      value={row.business_number}
                      placeholder="000-00-00000"
                      formatter={formatBusinessNumber}
                      onSave={handleSave("business_number")}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <Field label="지역">
                    <EditableInput value={row.region} onSave={handleSave("region")} />
                  </Field>
                </div>
              </div>
            </div>

            <div>
              <div className="text-foreground mb-2.5 text-[13px] font-bold">리드 정보</div>
              <div className="flex flex-col gap-3.5">
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                  <Field label="리드 구분">
                    <AppSelect
                      aria-label="리드 구분"
                      value={leadType}
                      onValueChange={handleSave("lead_type")}
                      options={LEAD_TYPES.map((type) => ({ value: type, label: type }))}
                    />
                  </Field>
                  <Field label="유입경로">
                    <AppSelect
                      aria-label="유입경로"
                      value={row.source}
                      onValueChange={handleSave("source")}
                      options={sourceOptions}
                    />
                  </Field>
                  <Field label="담당자">
                    <AppSelect
                      aria-label="담당자"
                      value={row.assignee_id ?? ""}
                      onValueChange={handleSave("assignee_id")}
                      options={[
                        { value: "", label: "-" },
                        ...csProfiles.map((profile) => ({
                          value: profile.id,
                          label: profile.name,
                        })),
                      ]}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                  <Field label="채널">
                    <AppSelect
                      aria-label="채널"
                      value={row.channel ?? ""}
                      onValueChange={handleSave("channel")}
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
                  <Field label="옵션">
                    <div className="flex h-9 items-center gap-3">
                      <label className="text-foreground flex cursor-pointer items-center gap-1.5 text-sm select-none">
                        <input
                          type="checkbox"
                          checked={isRental}
                          onChange={(event) =>
                            void onSave("is_rental", event.target.checked ? "true" : "false")
                          }
                          className="accent-primary size-[15px] cursor-pointer"
                        />
                        렌탈
                      </label>
                      <label className="text-foreground flex cursor-pointer items-center gap-1.5 text-sm select-none">
                        <input
                          type="checkbox"
                          checked={isInstallment}
                          onChange={(event) =>
                            void onSave("is_installment", event.target.checked ? "true" : "false")
                          }
                          className="accent-primary size-[15px] cursor-pointer"
                        />
                        할부
                      </label>
                    </div>
                  </Field>
                  <Field label="사용 프로그램">
                    <AppSelect
                      aria-label="사용 프로그램"
                      value={row.program ?? ""}
                      onValueChange={handleSave("program")}
                      options={[
                        { value: "", label: "선택 안함" },
                        ...PROGRAMS.map((p) => ({ value: p, label: p })),
                      ]}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-4">
                  <Field label="접수날짜">
                    <DatePickerField
                      value={row.reception_date ?? ""}
                      onChange={handleSave("reception_date")}
                      ariaLabel="접수날짜"
                      className="w-full"
                    />
                  </Field>
                  <Field label="카드가맹접수일">
                    <DatePickerField
                      value={row.card_apply_date ?? ""}
                      onChange={handleSave("card_apply_date")}
                      ariaLabel="카드가맹접수일"
                      className="w-full"
                    />
                  </Field>
                  <Field label="인터넷 업체">
                    <AppSelect
                      aria-label="인터넷 업체"
                      value={row.internet ?? ""}
                      onValueChange={handleSave("internet")}
                      options={[
                        { value: "", label: "미설정" },
                        ...LEAD_INTERNET_PROVIDERS.map((provider) => ({
                          value: provider,
                          label: provider,
                        })),
                      ]}
                    />
                  </Field>
                  <Field label="설치 및 발송일">
                    <DatePickerField
                      value={row.install_date ?? ""}
                      onChange={handleSave("install_date")}
                      ariaLabel="설치 및 발송일"
                      className="w-full"
                    />
                  </Field>
                </div>
              </div>
            </div>

            <div>
              <div className="text-foreground mb-2.5 text-[13px] font-bold">진행 상태</div>
              <div className="flex flex-col gap-3.5">
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                  <Field label="연락상태">
                    <AppSelect
                      aria-label="연락상태"
                      value={row.contact_status}
                      onValueChange={handleSave("contact_status")}
                      className={`h-auto rounded-md border px-2.5 py-1 text-xs font-semibold ${CONTACT_STATUS_STYLE[row.contact_status]}`}
                      options={CONTACT_STATUSES.map((status) => ({ value: status, label: status }))}
                    />
                  </Field>
                  <Field label="서류상태">
                    <AppSelect
                      aria-label="서류상태"
                      value={row.doc_status}
                      onValueChange={handleSave("doc_status")}
                      className={`h-auto rounded-md border px-2.5 py-1 text-xs font-semibold ${DOC_STATUS_STYLE[row.doc_status]}`}
                      options={DOC_STATUSES.map((status) => ({ value: status, label: status }))}
                    />
                  </Field>
                  <Field label="VAN 접수">
                    <AppSelect
                      aria-label="VAN 접수"
                      value={vanStatus}
                      onValueChange={handleSave("van_status")}
                      className={`h-auto rounded-md border px-2.5 py-1 text-xs font-semibold ${VAN_STATUS_STYLE[vanStatus]}`}
                      options={VAN_STATUSES.map((status) => ({ value: status, label: status }))}
                    />
                  </Field>
                  <Field label="인터넷 진행">
                    <AppSelect
                      aria-label="인터넷 진행"
                      value={internetStatus}
                      onValueChange={handleSave("internet_status")}
                      className={`h-auto rounded-md border px-2.5 py-1 text-xs font-semibold ${INTERNET_STATUS_STYLE[internetStatus]}`}
                      options={INTERNET_STATUSES.map((status) => ({
                        value: status,
                        label: status,
                      }))}
                    />
                  </Field>
                  <Field label="접수판단">
                    <>
                      <AppSelect
                        aria-label="접수판단"
                        value={row.decision}
                        onValueChange={handleSave("decision")}
                        className={`h-auto rounded-md border px-2.5 py-1 text-xs font-semibold ${DECISION_STYLE[row.decision]}`}
                        options={DECISIONS.map((decision) => ({
                          value: decision,
                          label: decision,
                        }))}
                      />
                      <span className="text-muted-foreground text-xs">
                        {DECISION_GUIDE[row.decision]}
                      </span>
                    </>
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <Field label="다음 조치일">
                    <DatePickerField
                      value={row.next_action_date ?? ""}
                      onChange={handleSave("next_action_date")}
                      ariaLabel="다음 조치일"
                      className="w-full"
                    />
                  </Field>
                  <Field label="오픈 예정일">
                    <DatePickerField
                      value={row.open_date ?? ""}
                      onChange={handleSave("open_date")}
                      ariaLabel="오픈 예정일"
                      className="w-full"
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
              {equipmentItems.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {equipmentItems.map((product, index) => (
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
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <Field label="주소">
                    <EditableInput
                      value={row.address}
                      placeholder="주소 입력"
                      onSave={handleSave("address")}
                    />
                  </Field>
                </div>
                <Field label="상세주소">
                  <EditableInput
                    value={row.address_detail}
                    placeholder="상세주소 입력"
                    onSave={handleSave("address_detail")}
                  />
                </Field>
              </div>
            </div>

            <div>
              <div className="text-foreground mb-2.5 text-[13px] font-bold">
                VAN사 (중복선택 가능)
              </div>
              <div className="flex flex-wrap gap-2">
                {VAN_COMPANIES.map((company) => {
                  const active = vans.includes(company);
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

            <div>
              <div className="text-foreground mb-2.5 text-[13px] font-bold">비고</div>
              <textarea
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                onBlur={() => {
                  if (noteDraft !== (row.note ?? "")) void onSave("note", noteDraft);
                }}
                rows={5}
                className={`${inputClass} h-auto`}
              />
            </div>

            <div>
              <div className="text-foreground mb-2.5 text-[13px] font-bold">이관 정보</div>
              {row.converted_franchise_id ? (
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                  <Field label="이관일">
                    <span className="text-foreground text-sm">{toKstDate(row.converted_at)}</span>
                  </Field>
                  <Field label="가맹접수 진행상태">
                    <span className="text-foreground text-sm">
                      {linked?.status_label ?? "확인 불가"}
                    </span>
                  </Field>
                  <Field label="바로가기">
                    <Link
                      href={`/franchise?highlight=${row.converted_franchise_id}`}
                      className="text-primary text-sm font-medium hover:underline"
                    >
                      가맹접수에서 보기 →
                    </Link>
                  </Field>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  아직 가맹접수로 이관되지 않았습니다. 접수판단이 접수대상이면 아래에서 전환할 수
                  있습니다.
                </p>
              )}
            </div>

            {row.closed_at && (
              <div>
                <div className="text-foreground mb-2.5 text-[13px] font-bold">완료 정보</div>
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                  <Field label="완료일">
                    <span className="text-foreground text-sm">{toKstDateTime(row.closed_at)}</span>
                  </Field>
                  <Field label="처리자">
                    <span className="text-foreground text-sm">{row.completed_by_name || "-"}</span>
                  </Field>
                  <Field label="사유">
                    <span className="text-foreground text-sm">{row.close_reason || "-"}</span>
                  </Field>
                </div>
              </div>
            )}

            <div>
              <div className="text-foreground mb-2.5 text-[13px] font-bold">처리 히스토리</div>
              {logsLoading ? (
                <p className="text-muted-foreground text-sm">불러오는 중…</p>
              ) : logsError ? (
                <p className="text-error text-sm">{logsError}</p>
              ) : logs.length === 0 ? (
                <p className="text-muted-foreground text-sm">아직 기록이 없습니다.</p>
              ) : (
                <div className="flex flex-col">
                  {logs.map((log) => (
                    <div key={log.id} className="border-border border-b py-2 text-sm">
                      <span className="text-muted-foreground">
                        {toShortDateTime(log.created_at)}
                      </span>
                      {" · "}
                      <span className="text-muted-foreground">{log.user_name || "-"}</span>
                      {" · "}
                      <span className="text-foreground font-medium">
                        {LEAD_LOG_ACTION_LABELS[log.action]}
                      </span>
                      {log.action === "update" && log.field && (
                        <>
                          {" "}
                          <span className="text-foreground">
                            {LEAD_FIELD_LABELS[log.field as keyof typeof LEAD_FIELD_LABELS] ??
                              log.field}
                            : {log.from_value || "-"} → {log.to_value || "-"}
                          </span>
                        </>
                      )}
                      {log.action === "close" && (
                        <>
                          {" "}
                          <span className="text-foreground">사유 {log.to_value || "-"}</span>
                        </>
                      )}
                      {log.action === "convert" && (
                        <>
                          {" "}
                          <span className="text-foreground">가맹접수로 이관</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-border flex flex-shrink-0 flex-wrap gap-2 border-t px-6 py-4">
          {stage === "open" && row.decision === "접수대상" && (
            <button type="button" onClick={onConvert} className={primaryButton}>
              가맹접수 전환
            </button>
          )}
          {stage === "converted" && (
            <Link
              href={`/franchise?highlight=${row.converted_franchise_id}`}
              className={secondaryButton}
            >
              가맹접수 보기
            </Link>
          )}
          {stage !== "closed" && (
            <button type="button" onClick={onComplete} className={secondaryButton}>
              완료 처리
            </button>
          )}
          {stage === "closed" && (
            <button type="button" onClick={onReopen} className={secondaryButton}>
              다시 열기
            </button>
          )}
          <button type="button" onClick={onClose} className={`${secondaryButton} ml-auto`}>
            닫기
          </button>
        </div>
      </aside>
    </div>
  );
}
