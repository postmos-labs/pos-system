"use client";

import { useEffect, useState } from "react";
import { XIcon } from "lucide-react";
import type {
  ApplicantType,
  EquipmentItem,
  FranchiseApplication,
  FranchiseStatus,
  Profile,
} from "@/types";
import { APPLICANT_TYPE_LABEL, FRANCHISE_STATUS_LABEL } from "@/types";
import { formatBusinessNumber, formatPhone } from "@/lib/format";
import ApprovalNoteTimeline from "@/components/ui/ApprovalNoteTimeline";
import type { ApprovalNote } from "@/lib/approvalNotes";
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
const HIDDEN_STATUSES: FranchiseStatus[] = [
  "internet_apply_done",
  "internet_done",
  "card_internet_apply_done",
];
const STATUS_OPTIONS = (Object.keys(FRANCHISE_STATUS_LABEL) as FranchiseStatus[]).filter(
  (status) => !HIDDEN_STATUSES.includes(status),
);
const STAGES = ["서류", "VAN", "토스", "완료"];

interface Props {
  row: FranchiseApplication;
  salesProfiles: Pick<Profile, "id" | "name" | "role">[];
  csProfiles: Pick<Profile, "id" | "name" | "role">[];
  linkedInstall?: { id: string; status: string };
  linkedInternet?: { id: string; status: string | null; category: string | null };
  busy: boolean;
  transferring: boolean;
  linkingInternet: boolean;
  onClose: () => void;
  onSave: (field: keyof FranchiseApplication, value: string) => void | Promise<void>;
  onEquipmentChange: (items: EquipmentItem[]) => void | Promise<void>;
  onVanCompanyChange: (codes: string[]) => void | Promise<void>;
  onApplicantTypeChange: (value: ApplicantType) => void | Promise<void>;
  onCsChange: (value: string) => void | Promise<void>;
  onSalesChange: (value: string) => void | Promise<void>;
  onStatusChange: (value: FranchiseStatus) => void;
  onCopyLink: () => void;
  onResendDocuments: () => void;
  transferApproval?: {
    status: "requested" | "cs_responsible_approved" | "approved" | "rejected";
    delivery_type: string | null;
    requested_by_name: string;
    approved_by_name: string | null;
    cs_approved_by_name?: string | null;
    approval_notes: ApprovalNote[];
  };
  canApproveTransfer: boolean;
  onRequestTransfer: () => void;
  onApproveTransfer: () => void;
  onOpenInstalls: () => void;
  onLinkInternet: () => void;
  onOpenInternet: () => void;
  onOpenHistory: () => void;
}

const inputClass =
  "border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/30 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2";
const selectClass =
  "border-border bg-card text-foreground focus-visible:ring-primary/30 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50";
const secondaryButton =
  "focus-visible:ring-primary/30 border-border bg-card text-foreground hover:bg-muted inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50";
const primaryButton =
  "focus-visible:ring-primary/30 border-primary bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50";

function tone(status: FranchiseStatus) {
  if (status === "doc_waiting")
    return {
      pill: "!bg-[#ff0000] !text-[#ffffff]",
      solid: "bg-[#ff0000]",
      border: "border-[#ff0000]",
      stage: 0,
    };
  if (status === "doc_incomplete")
    return {
      pill: "!bg-red-500/15 !text-red-500",
      solid: "bg-red-500",
      border: "border-red-500",
      stage: 0,
    };
  if (status === "card_apply_done")
    return {
      pill: "!bg-blue-500/15 !text-blue-500",
      solid: "bg-blue-500",
      border: "border-blue-500",
      stage: 1,
    };
  if (status === "toss_review_apply_done")
    return {
      pill: "!bg-violet-500/15 !text-violet-500",
      solid: "bg-violet-500",
      border: "border-violet-500",
      stage: 2,
    };
  if (status === "card_done")
    return {
      pill: "!bg-sky-500/15 !text-sky-500",
      solid: "bg-sky-500",
      border: "border-sky-500",
      stage: 2,
    };
  if (status === "toss_review_done")
    return {
      pill: "!bg-teal-500/15 !text-teal-500",
      solid: "bg-teal-500",
      border: "border-teal-500",
      stage: 2,
    };
  if (status === "completed" || status === "internet_done")
    return {
      pill: "!bg-green-500/15 !text-green-500",
      solid: "bg-green-500",
      border: "border-green-500",
      stage: 3,
    };
  if (status === "hold")
    return {
      pill: "!bg-gray-500/15 !text-gray-500",
      solid: "bg-gray-500",
      border: "border-gray-500",
      stage: 0,
    };
  return {
    pill: "!bg-zinc-500/15 !text-zinc-500",
    solid: "bg-zinc-500",
    border: "border-zinc-500",
    stage: 0,
  };
}

function StageProgress({ status }: { status: FranchiseStatus }) {
  const colors = tone(status);
  const fraction = (index: number) => index / (STAGES.length - 1);
  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="relative h-2.5 w-full">
        <div className="bg-border absolute top-1/2 right-0 left-0 h-0.5 -translate-y-1/2" />
        {colors.stage > 0 && (
          <div
            className={`absolute top-1/2 left-0 h-0.5 -translate-y-1/2 ${colors.solid}`}
            style={{ width: `${fraction(colors.stage) * 100}%` }}
          />
        )}
        {STAGES.map((label, index) => (
          <div
            key={label}
            className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${index < colors.stage ? `${colors.solid} ${colors.border}` : index === colors.stage ? `bg-card ${colors.border}` : "bg-card border-border-strong"}`}
            style={{ left: `${fraction(index) * 100}%` }}
          />
        ))}
      </div>
      <div className="relative h-3 w-full">
        {STAGES.map((label, index) => (
          <span
            key={label}
            className={`text-muted-foreground absolute top-0 text-[9.5px] whitespace-nowrap ${index === 0 ? "left-0" : index === STAGES.length - 1 ? "right-0" : "-translate-x-1/2"}`}
            style={
              index === 0 || index === STAGES.length - 1
                ? undefined
                : { left: `${fraction(index) * 100}%` }
            }
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

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
  useEffect(() => setDraft(value ?? ""), [value]);
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

export default function FranchiseDetailDrawer({
  row,
  csProfiles,
  linkedInstall,
  linkedInternet,
  busy,
  transferring,
  linkingInternet,
  onClose,
  onSave,
  onEquipmentChange,
  onVanCompanyChange,
  onApplicantTypeChange,
  onCsChange,
  onStatusChange,
  onCopyLink,
  onResendDocuments,
  transferApproval,
  canApproveTransfer,
  onRequestTransfer,
  onApproveTransfer,
  onOpenInstalls,
  onLinkInternet,
  onOpenInternet,
}: Props) {
  const [productSelect, setProductSelect] = useState(EQUIPMENT_CATALOG[0]);
  const [productQty, setProductQty] = useState(1);
  const products = row.equipment_items ?? [];
  const vans = row.van_company_codes ?? [];
  const colors = tone(row.status);

  function addProduct() {
    onEquipmentChange([...products, { name: productSelect, quantity: productQty }]);
  }
  function removeProduct(index: number) {
    onEquipmentChange(products.filter((_, itemIndex) => itemIndex !== index));
  }
  function toggleVan(code: string) {
    onVanCompanyChange(
      vans.includes(code) ? vans.filter((value) => value !== code) : [...vans, code],
    );
  }

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/35" onMouseDown={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="franchise-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="bg-card text-foreground absolute inset-y-0 right-0 flex h-dvh w-[560px] max-w-[calc(100vw-32px)] flex-col shadow-2xl"
      >
        <div className="border-border flex-shrink-0 border-b px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <div id="franchise-detail-title" className="text-foreground text-lg font-bold">
                {row.business_name || "-"}
              </div>
              <div className="text-muted-foreground mt-1 text-[13.5px]">
                {row.owner_name || "-"} · {APPLICANT_TYPE_LABEL[row.applicant_type]} ·{" "}
                {row.phone || "-"}
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
          <div className="mt-3.5 flex items-center gap-2.5">
            <select
              aria-label="상태"
              value={row.status}
              disabled={busy}
              onChange={(event) => onStatusChange(event.target.value as FranchiseStatus)}
              className={`h-auto rounded-md border-none px-2.5 py-1 text-xs font-semibold outline-none ${colors.pill}`}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {FRANCHISE_STATUS_LABEL[status]}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground text-sm">
              접수일 {row.reception_date || "-"}
            </span>
          </div>
          <div className="mt-4">
            <StageProgress status={row.status} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-5">
            <div>
              <div className="text-foreground mb-2.5 text-[13px] font-bold">기본 정보</div>
              <div className="grid grid-cols-2 gap-3.5">
                <Field label="상호명">
                  <EditableInput
                    value={row.business_name}
                    onSave={(value) => onSave("business_name", value)}
                  />
                </Field>
                <Field label="대표자명">
                  <EditableInput
                    value={row.owner_name}
                    onSave={(value) => onSave("owner_name", value)}
                  />
                </Field>
                <Field label="연락처">
                  <EditableInput
                    value={row.phone}
                    formatter={formatPhone}
                    onSave={(value) => onSave("phone", value)}
                  />
                </Field>
                <Field label="사업자번호">
                  <EditableInput
                    value={row.business_number}
                    placeholder="000-00-00000"
                    formatter={formatBusinessNumber}
                    onSave={(value) => onSave("business_number", value)}
                  />
                </Field>
                <Field label="접수채널">
                  <select
                    value={row.reception_channel ?? ""}
                    onChange={(event) => onSave("reception_channel", event.target.value)}
                    className={selectClass}
                  >
                    <option value="">미지정</option>
                    {RECEPTION_CHANNELS.map((channel) => (
                      <option key={channel}>{channel}</option>
                    ))}
                  </select>
                </Field>
                <Field label="사업자 유형">
                  <select
                    value={row.applicant_type}
                    onChange={(event) => onApplicantTypeChange(event.target.value as ApplicantType)}
                    className={selectClass}
                  >
                    {(Object.keys(APPLICANT_TYPE_LABEL) as ApplicantType[]).map((type) => (
                      <option key={type} value={type}>
                        {APPLICANT_TYPE_LABEL[type]}
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
              {products.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {products.map((product, index) => (
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

            <div className="grid grid-cols-2 gap-3.5">
              <Field label="주소">
                <EditableInput
                  value={row.address}
                  placeholder="주소 입력"
                  onSave={(value) => onSave("address", value)}
                />
              </Field>
              <Field label="상세주소">
                <EditableInput
                  value={row.address_detail}
                  placeholder="상세주소 입력"
                  onSave={(value) => onSave("address_detail", value)}
                />
              </Field>
              <Field label="오픈예정일">
                <input
                  type="date"
                  value={row.open_date ?? ""}
                  onChange={(event) => onSave("open_date", event.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="설치 및 발송일">
                <input
                  type="date"
                  value={row.install_date ?? ""}
                  onChange={(event) => onSave("install_date", event.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="카드가맹접수일">
                <input
                  type="date"
                  value={row.card_apply_date ?? ""}
                  onChange={(event) => onSave("card_apply_date", event.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="인터넷">
                <select
                  value={row.internet ?? ""}
                  onChange={(event) => onSave("internet", event.target.value)}
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
                  value={row.cs_id ?? ""}
                  onChange={(event) => onCsChange(event.target.value)}
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

            <div>
              <div className="text-foreground mb-2.5 text-[13px] font-bold">
                VAN사 (중복선택 가능)
              </div>
              <div className="flex flex-wrap gap-2">
                {VAN_COMPANY_OPTIONS.map((option) => {
                  const active = vans.includes(option.code);
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
            {transferApproval && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-foreground mb-3 text-[13px] font-bold">이관 승인 비고</div>
                <ApprovalNoteTimeline notes={transferApproval.approval_notes} />
              </div>
            )}
          </div>
        </div>

        <div className="border-border flex flex-shrink-0 flex-wrap gap-2 border-t px-6 py-3.5">
          <button type="button" onClick={onCopyLink} className={secondaryButton}>
            링크 복사
          </button>
          <button
            type="button"
            onClick={onResendDocuments}
            disabled={!row.phone}
            className={secondaryButton}
          >
            서류안내 재발송
          </button>
          <div className="flex-1" />
          {linkedInstall && linkedInstall.status !== "rejected" ? (
            <button type="button" onClick={onOpenInstalls} className={secondaryButton}>
              {linkedInstall.status === "completed" ? "설치완료" : "기술지원 이관됨"}
            </button>
          ) : transferApproval?.status === "requested" ? (
            <>
              <span className="self-center text-xs font-medium text-amber-600">
                {transferApproval.requested_by_name} 승인요청
              </span>
              {canApproveTransfer && (
                <button
                  type="button"
                  onClick={onApproveTransfer}
                  disabled={transferring}
                  className={primaryButton}
                >
                  {transferring ? "이관 중..." : "승인 후 자동 이관"}
                </button>
              )}
            </>
          ) : transferApproval?.status === "approved" ? (
            <span className="self-center text-xs font-medium text-emerald-600">
              승인 완료 · 자동 이관 처리 중
            </span>
          ) : transferApproval?.status === "rejected" ? (
            <>
              <span className="self-center text-xs font-medium text-red-600">반려됨</span>
              <button
                type="button"
                onClick={onRequestTransfer}
                disabled={transferring}
                className={secondaryButton}
              >
                다시 승인요청
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onRequestTransfer}
              disabled={transferring}
              className={secondaryButton}
            >
              기술지원 이관 승인요청
            </button>
          )}
          {linkedInternet ? (
            <button type="button" onClick={onOpenInternet} className={primaryButton}>
              인터넷 {linkedInternet.status || "등록됨"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onLinkInternet}
              disabled={linkingInternet}
              className={primaryButton}
            >
              {linkingInternet ? "처리 중..." : "인터넷 등록"}
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
