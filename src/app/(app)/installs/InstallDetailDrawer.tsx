"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { XIcon, Save, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { formatPhone, thumbUrl } from "@/lib/format";
import type { Profile, EquipmentItem } from "@/types";
import { AppSelect } from "@/components/ui/AppSelect";
import { DatePickerField } from "@/components/ui/DatePickerField";
import HistoryButton from "@/components/ui/HistoryButton";
import { NotificationHistory } from "@/components/ui/NotificationHistory";
import InstallationActivityHistory from "@/components/ui/InstallationActivityHistory";
import ApprovalNoteTimeline from "@/components/ui/ApprovalNoteTimeline";
import type { ApprovalNote } from "@/lib/approvalNotes";
import { InstallItemsEditor } from "./InstallItemsEditor";
import InstallCompositionSection from "../merchants/InstallCompositionSection";
import {
  computeEquipmentCategorySummaries,
  type MerchantEquipmentItem,
} from "../merchants/merchant360";
import { STATUS_COLORS, STATUS_LABELS, statusLabel, statusOrderFor } from "./installStatus";
import type { Installation, CompletionApproval } from "./InstallsClient";

// franchise_applications를 "*"로 select한 뒤 sales/cs 조인의 name만 붙인 결과 중,
// 이 드로어가 실제로 쓰는 필드만 추린 타입. select 컬럼 근거: InstallsClient.tsx의
// openFranchiseDetail() 참고.
export interface InstallFranchiseDetail {
  business_name?: string | null;
  owner_name?: string | null;
  phone?: string | null;
  business_number?: string | null;
  address?: string | null;
  address_detail?: string | null;
  open_date?: string | null;
  install_date?: string | null;
  van_company?: string | null;
  internet?: string | null;
  equipment_items?: EquipmentItem[] | null;
  memo?: string | null;
  sales?: { name: string } | null;
  cs?: { name: string } | null;
}

export interface InstallDetailDraft {
  customer_name: string;
  contact_name: string;
  customer_phone: string;
  address: string;
  scheduled_date: string;
  scheduled_time: string;
  items: { name: string; quantity: number }[];
  notes: string;
}

interface Props {
  installation: Installation;
  canEdit: boolean;
  canDelete: boolean;
  profile: Profile;
  draft: InstallDetailDraft | null;
  onDraftChange: (patch: Partial<InstallDetailDraft>) => void;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;

  // 담당기사 배정 / 상태 변경 / 이동중 전달 — 표·모바일카드가 쓰는 handleAssign,
  // handleStatusChange, setTransitModal을 그대로 호출하는 콜백. 여기서 새로 구현하지 않는다
  // (handleStatusChange에는 알림톡 발송·승인 흐름·활동로그가 엮여 있다).
  techUsers: { id: string; name: string }[];
  onAssign: (assignedTo: string) => void;
  onStatusChange: (status: string) => void;
  onTransit: () => void;

  // 가맹접수 원본 섹션 — 드로어가 열릴 때 InstallsClient.tsx의 openFranchiseDetail()이
  // 이미 조회를 시작한 상태로 넘어온다(쿼리 자체는 그대로, 호출 시점만 옮김).
  franchiseLoading: boolean;
  franchiseDetail: InstallFranchiseDetail | null;

  // 실제 설치 구성 섹션
  merchantId: string | null;
  equipment: MerchantEquipmentItem[];

  // 완료 승인 워크플로
  approval: CompletionApproval | undefined;
  approvalNotes: ApprovalNote[] | undefined;
  completing: boolean;
  onApproveCompletion: () => void;
  onRejectCompletion: () => void;

  onCopyLink: () => void;
  onReschedule: () => void;
  onTechReject: () => void;
  onDelete: () => void;
  onOpenPostHistory: () => void;
  onOpenHistory: () => void;
  onOpenWoo: () => void;
}

const inputClass =
  "border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/30 w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2";
const secondaryButton =
  "focus-visible:ring-primary/30 border-border bg-card text-foreground hover:bg-muted inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50";
const primaryButton =
  "focus-visible:ring-primary/30 border-primary bg-primary text-primary-foreground hover:bg-primary-hover inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50";

// 스테퍼 점 색상: STATUS_COLORS는 옅은 배지용 톤(bg-x-50)이라 진행선에 쓰기엔 흐리다.
// FranchiseDetailDrawer의 tone()도 배지용 pill과 별개로 solid 색을 따로 갖고 있어, 같은
// 방식으로 상태별 solid 톤만 별도로 둔다(배지 자체는 STATUS_COLORS를 그대로 재사용).
const STAGE_TONE: Record<string, { solid: string; border: string }> = {
  received: { solid: "bg-gray-400", border: "border-gray-400" },
  preparing: { solid: "bg-blue-500", border: "border-blue-500" },
  scheduled: { solid: "bg-purple-500", border: "border-purple-500" },
  in_transit: { solid: "bg-amber-500", border: "border-amber-500" },
  delivery_sent: { solid: "bg-amber-500", border: "border-amber-500" },
  completed: { solid: "bg-green-500", border: "border-green-500" },
};
const DEFAULT_STAGE_TONE = { solid: "bg-zinc-500", border: "border-zinc-500" };

// 배송유형마다 실제 상태 흐름이 다르다 — 설치는 5단계(접수→제품준비→일정확정→이동중→설치완료),
// 택배발송은 4단계(접수→제품준비→택배발송→완료), AS는 4단계(접수→일정확정→이동중→AS완료).
// 고정된 설치 5단계 축에 다른 유형을 비례 배분하면 뱃지와 스테퍼가 서로 다른 단계를 가리킨다
// (예: AS 일정확정 건이 "제품준비"에 찍힘). 그래서 statusOrderFor(deliveryType)가 준 순서를
// 그대로 축으로 그리고, 라벨도 statusLabel(deliveryType)로 해당 유형의 문구를 쓴다.
// status가 순서에 없는 값(예: rejected)이면 진행 표시를 하지 않는다(null).
function InstallStageProgress({ status, deliveryType }: { status: string; deliveryType?: string }) {
  const order = statusOrderFor(deliveryType);
  const position = order.indexOf(status);
  const stage = position < 0 ? null : position;
  const tone = STAGE_TONE[status] ?? DEFAULT_STAGE_TONE;
  const lastIndex = Math.max(1, order.length - 1);
  const fraction = (index: number) => index / lastIndex;
  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="relative h-2.5 w-full">
        <div className="bg-border absolute top-1/2 right-0 left-0 h-0.5 -translate-y-1/2" />
        {stage !== null && stage > 0 && (
          <div
            className={`absolute top-1/2 left-0 h-0.5 -translate-y-1/2 ${tone.solid}`}
            style={{ width: `${fraction(stage) * 100}%` }}
          />
        )}
        {order.map((stageStatus, index) => (
          <div
            key={stageStatus}
            className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
              stage !== null && index < stage
                ? `${tone.solid} ${tone.border}`
                : stage !== null && index === stage
                  ? `bg-card ${tone.border}`
                  : "bg-card border-border-strong"
            }`}
            style={{ left: `${fraction(index) * 100}%` }}
          />
        ))}
      </div>
      <div className="relative h-3 w-full">
        {order.map((stageStatus, index) => (
          <span
            key={stageStatus}
            className={`text-muted-foreground absolute top-0 text-[9.5px] whitespace-nowrap ${index === 0 ? "left-0" : index === order.length - 1 ? "right-0" : "-translate-x-1/2"}`}
            style={
              index === 0 || index === order.length - 1
                ? undefined
                : { left: `${fraction(index) * 100}%` }
            }
          >
            {statusLabel(stageStatus, deliveryType)}
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

function ReadValue({ children }: { children: React.ReactNode }) {
  return <p className="text-foreground text-sm break-words">{children}</p>;
}

// 가맹접수 원본 섹션 전용 — 값이 없으면 필드 자체를 숨긴다. 원래 모달의
// "값 없으면 그 필드는 안 보인다" 동작을 그대로 유지한 것(추가/삭제 없이 재배치만).
function FranchiseField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <p className="text-foreground text-sm break-words">{value}</p>
    </div>
  );
}

export default function InstallDetailDrawer({
  installation,
  canEdit,
  canDelete,
  profile,
  draft,
  onDraftChange,
  saving,
  onSave,
  onClose,
  techUsers,
  onAssign,
  onStatusChange,
  onTransit,
  franchiseLoading,
  franchiseDetail,
  merchantId,
  equipment,
  approval,
  approvalNotes,
  completing,
  onApproveCompletion,
  onRejectCompletion,
  onCopyLink,
  onReschedule,
  onTechReject,
  onDelete,
  onOpenPostHistory,
  onOpenHistory,
  onOpenWoo,
}: Props) {
  const [franchiseOpen, setFranchiseOpen] = useState(false);

  // 완료 승인/반려 버튼 노출 조건 — InstallsClient.tsx 표의 "관리" 열에 있던 조건을
  // 그대로 옮긴 것(상태 전이 규칙은 바꾸지 않았다).
  const canDecideApproval =
    !!approval &&
    approval.requested_by !== profile.id &&
    ((approval.status === "requested" &&
      (profile.approval_role === "tech_responsible" || profile.approval_role === "team_lead")) ||
      (profile.approval_role === "team_lead" && approval.status === "responsible_approved"));
  const showReschedule =
    canEdit && installation.status !== "completed" && installation.status !== "rejected";
  // 표(데스크톱)에는 이 버튼과 동등한 단독 조작이 없다 — "이동중" 상태로 select를 바꾸면
  // 같은 setTransitModal이 열리는 것으로 갈음한다. 모바일카드(mineOnly 전용, "도착시간 알림
  // 발송" 버튼)에만 있던 조건을 그대로 옮겼다.
  const showTransit = canEdit && installation.status !== "completed";
  const showTechReject =
    profile.role === "tech" &&
    !!installation.franchise_application_id &&
    installation.status !== "rejected" &&
    installation.status !== "completed";
  const showDelete = canDelete && !installation.franchise_application_id;
  const showPostHistory =
    installation.status === "completed" || installation.status === "delivery_sent";

  const franchiseLoaded =
    !franchiseLoading && !!franchiseDetail && Object.keys(franchiseDetail).length > 0;

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/35" onMouseDown={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="bg-card text-foreground absolute inset-y-0 right-0 flex h-dvh w-[820px] max-w-[calc(100vw-32px)] flex-col shadow-2xl"
      >
        <div className="border-border flex-shrink-0 border-b px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div id="install-detail-title" className="text-foreground truncate text-lg font-bold">
                {installation.customer_name}
              </div>
              {(installation.contact_name || installation.customer_phone) && (
                <div className="text-muted-foreground mt-1 text-[13.5px]">
                  {[
                    installation.contact_name,
                    installation.customer_phone ? formatPhone(installation.customer_phone) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label="닫기"
              onClick={onClose}
              className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-9 shrink-0 items-center justify-center rounded-lg"
            >
              <XIcon className="size-4" />
            </button>
          </div>
          <div className="mt-3.5">
            <span
              className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[installation.status]}`}
            >
              {statusLabel(installation.status, installation.delivery_type)}
            </span>
          </div>
          <div className="mt-4">
            <InstallStageProgress
              status={installation.status}
              deliveryType={installation.delivery_type}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-5">
            <div>
              <div className="text-foreground mb-2.5 text-[13px] font-bold">설치 정보</div>
              <div className="flex flex-col gap-3.5">
                <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
                  <Field label="상호명">
                    {canEdit ? (
                      <input
                        value={draft?.customer_name ?? installation.customer_name}
                        onChange={(e) => onDraftChange({ customer_name: e.target.value })}
                        className={inputClass}
                      />
                    ) : (
                      <ReadValue>{installation.customer_name}</ReadValue>
                    )}
                  </Field>
                  <Field label="고객명">
                    {canEdit ? (
                      <input
                        value={draft?.contact_name ?? installation.contact_name ?? ""}
                        onChange={(e) => onDraftChange({ contact_name: e.target.value })}
                        className={inputClass}
                      />
                    ) : (
                      <ReadValue>{installation.contact_name || "-"}</ReadValue>
                    )}
                  </Field>
                  <Field label="전화번호">
                    {canEdit ? (
                      <input
                        value={draft?.customer_phone ?? installation.customer_phone ?? ""}
                        onChange={(e) => onDraftChange({ customer_phone: e.target.value })}
                        className={inputClass}
                      />
                    ) : (
                      <ReadValue>
                        {installation.customer_phone
                          ? formatPhone(installation.customer_phone)
                          : "-"}
                      </ReadValue>
                    )}
                  </Field>
                  <Field label="상태">
                    <ReadValue>
                      {statusLabel(installation.status, installation.delivery_type)}
                    </ReadValue>
                  </Field>
                </div>
                <Field label="주소">
                  {canEdit ? (
                    <input
                      value={draft?.address ?? installation.address ?? ""}
                      onChange={(e) => onDraftChange({ address: e.target.value })}
                      className={inputClass}
                    />
                  ) : (
                    <ReadValue>{installation.address || "-"}</ReadValue>
                  )}
                </Field>
                <Field label="제품">
                  {canEdit ? (
                    <InstallItemsEditor
                      items={draft?.items ?? installation.items ?? []}
                      onChange={(items) => onDraftChange({ items })}
                    />
                  ) : (
                    <ReadValue>
                      {installation.items?.length > 0
                        ? installation.items.map((i) => `${i.name} x${i.quantity}`).join(", ")
                        : "-"}
                    </ReadValue>
                  )}
                </Field>
                <Field label="비고">
                  {canEdit ? (
                    <textarea
                      value={draft?.notes ?? installation.notes ?? ""}
                      onChange={(e) => onDraftChange({ notes: e.target.value })}
                      rows={4}
                      className={`${inputClass} resize-y`}
                    />
                  ) : (
                    <p className="text-foreground text-sm whitespace-pre-wrap">
                      {installation.notes || "-"}
                    </p>
                  )}
                </Field>
              </div>
            </div>

            <div>
              <div className="text-foreground mb-2.5 text-[13px] font-bold">일정·담당</div>
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
                <Field label="설치 예정일">
                  {canEdit ? (
                    <DatePickerField
                      value={draft?.scheduled_date ?? installation.scheduled_date ?? ""}
                      onChange={(value) => onDraftChange({ scheduled_date: value })}
                      ariaLabel="설치 예정일"
                      className="w-full"
                    />
                  ) : (
                    <ReadValue>{installation.scheduled_date || "-"}</ReadValue>
                  )}
                </Field>
                <Field label="희망 시간대">
                  {canEdit ? (
                    <input
                      type="time"
                      value={draft?.scheduled_time ?? installation.scheduled_time ?? ""}
                      onChange={(e) => onDraftChange({ scheduled_time: e.target.value })}
                      className={inputClass}
                    />
                  ) : (
                    <ReadValue>{installation.scheduled_time || "-"}</ReadValue>
                  )}
                </Field>
                <Field label="담당기사">
                  {canEdit ? (
                    <AppSelect
                      value={installation.assigned_to || ""}
                      onValueChange={onAssign}
                      aria-label="담당기사"
                      className="w-full"
                      options={[
                        { value: "", label: "미배정" },
                        ...techUsers.map((t) => ({ value: t.id, label: t.name })),
                      ]}
                    />
                  ) : (
                    <ReadValue>{installation.assignee?.name ?? "미배정"}</ReadValue>
                  )}
                </Field>
                <Field label="상태 변경">
                  {canEdit ? (
                    <AppSelect
                      value={installation.status}
                      onValueChange={onStatusChange}
                      aria-label="상태 변경"
                      className="w-full"
                      options={statusOrderFor(installation.delivery_type).map((s) => ({
                        value: s,
                        label: statusLabel(s, installation.delivery_type),
                      }))}
                    />
                  ) : (
                    <ReadValue>
                      {statusLabel(installation.status, installation.delivery_type)}
                    </ReadValue>
                  )}
                </Field>
                <Field label="등록자">
                  <ReadValue>{installation.creator?.name ?? "-"}</ReadValue>
                </Field>
                <Field label="등록일">
                  <ReadValue>
                    {format(new Date(installation.created_at), "yyyy-M-d HH:mm", { locale: ko })}
                  </ReadValue>
                </Field>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <InstallationActivityHistory
                installationId={installation.id}
                statusLabels={STATUS_LABELS}
              />
              <NotificationHistory
                entityType="install"
                entityId={installation.id}
                labelMap={STATUS_LABELS}
              />
            </div>

            {installation.completion_photo_urls &&
              installation.completion_photo_urls.length > 0 && (
                <div>
                  <div className="text-foreground mb-2.5 text-[13px] font-bold">설치 사진</div>
                  <div className="flex flex-wrap gap-2">
                    {installation.completion_photo_urls.map((url, idx) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={`${installation.customer_name} ${idx + 1}.jpg`}
                      >
                        <img
                          src={thumbUrl(url, 80)}
                          alt="설치완료사진"
                          loading="lazy"
                          decoding="async"
                          className="border-border h-20 w-20 rounded border object-cover"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}

            <div className="border-border space-y-3 border-t pt-4">
              <p className="text-muted-foreground text-xs font-semibold">
                실제 설치 구성 (현장 확정 기준 — 접수 장비와 다를 수 있음)
              </p>
              <InstallCompositionSection
                merchantId={merchantId}
                installationId={installation.id}
                equipment={equipment}
                categorySummaries={computeEquipmentCategorySummaries(equipment)}
                totalEquipmentSets={equipment
                  .filter((item) => item.status !== "removed")
                  .reduce((sum, item) => sum + (item.quantity ?? 1), 0)}
              />
            </div>

            {installation.franchise_application_id && (
              <div className="border-border border-t pt-4">
                <button
                  type="button"
                  onClick={() => setFranchiseOpen((value) => !value)}
                  className="flex w-full items-center justify-between text-left"
                  aria-expanded={franchiseOpen}
                >
                  <span className="text-foreground text-[13px] font-bold">가맹접수 원본</span>
                  {franchiseOpen ? (
                    <ChevronUp className="text-muted-foreground size-4" />
                  ) : (
                    <ChevronDown className="text-muted-foreground size-4" />
                  )}
                </button>
                {franchiseOpen && (
                  <div className="mt-3">
                    {franchiseLoading ? (
                      <p className="text-muted-foreground py-6 text-center text-sm">
                        불러오는 중...
                      </p>
                    ) : franchiseLoaded && franchiseDetail ? (
                      <div className="flex flex-col gap-4">
                        {[
                          franchiseDetail.business_name,
                          franchiseDetail.owner_name,
                          franchiseDetail.phone,
                          franchiseDetail.business_number,
                          franchiseDetail.address,
                          franchiseDetail.address_detail,
                        ].some(Boolean) && (
                          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
                            <FranchiseField label="상호명" value={franchiseDetail.business_name} />
                            <FranchiseField label="대표자" value={franchiseDetail.owner_name} />
                            <FranchiseField label="연락처" value={franchiseDetail.phone} />
                            <FranchiseField
                              label="사업자번호"
                              value={franchiseDetail.business_number}
                            />
                            <FranchiseField label="주소" value={franchiseDetail.address} />
                            <FranchiseField
                              label="상세주소"
                              value={franchiseDetail.address_detail}
                            />
                          </div>
                        )}
                        {[franchiseDetail.open_date, franchiseDetail.install_date].some(
                          Boolean,
                        ) && (
                          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                            <FranchiseField label="오픈예정일" value={franchiseDetail.open_date} />
                            <FranchiseField
                              label="설치발송일"
                              value={franchiseDetail.install_date}
                            />
                          </div>
                        )}
                        {[franchiseDetail.van_company, franchiseDetail.internet].some(Boolean) && (
                          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                            <FranchiseField label="VAN사" value={franchiseDetail.van_company} />
                            <FranchiseField label="인터넷" value={franchiseDetail.internet} />
                          </div>
                        )}
                        {[franchiseDetail.sales?.name, franchiseDetail.cs?.name].some(Boolean) && (
                          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                            <FranchiseField label="담당영업" value={franchiseDetail.sales?.name} />
                            <FranchiseField label="담당CS" value={franchiseDetail.cs?.name} />
                          </div>
                        )}
                        {franchiseDetail.equipment_items &&
                          franchiseDetail.equipment_items.length > 0 && (
                            <div>
                              <p className="text-muted-foreground text-xs font-semibold">
                                접수 장비 (주문 내역)
                              </p>
                              <p className="text-foreground mt-1 text-sm">
                                {franchiseDetail.equipment_items
                                  .map((item) => `${item.name} x${item.quantity}`)
                                  .join(", ")}
                              </p>
                            </div>
                          )}
                        {franchiseDetail.memo && (
                          <div>
                            <p className="text-muted-foreground text-xs font-semibold">비고</p>
                            <p className="text-foreground mt-1 text-sm whitespace-pre-wrap">
                              {franchiseDetail.memo}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-muted-foreground py-6 text-center text-sm">
                        정보를 불러올 수 없습니다.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="border-border flex flex-shrink-0 flex-wrap items-center gap-2 border-t px-6 py-3.5">
          <button type="button" onClick={onCopyLink} className={secondaryButton}>
            고객 조회 링크 복사
          </button>
          {installation.woo_customer_id && (
            <button
              type="button"
              onClick={onOpenWoo}
              className="rounded-lg border border-teal-200 px-2.5 py-1.5 text-xs font-semibold text-teal-600 hover:bg-teal-50"
            >
              우국상 원본 보기
            </button>
          )}
          {showReschedule && (
            <button
              type="button"
              onClick={onReschedule}
              disabled={!!approval}
              className="rounded-lg border border-indigo-200 px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
            >
              일정변경
            </button>
          )}
          {showTransit && (
            <button
              type="button"
              onClick={onTransit}
              className="rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50"
            >
              도착시간 알림 발송
            </button>
          )}
          {approval && (
            <>
              <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700">
                {statusLabel(approval.target_status, installation.delivery_type)}{" "}
                {approval.status === "requested" ? "1차 승인대기" : "최종 승인대기"}
              </span>
              {canDecideApproval && (
                <>
                  <button
                    type="button"
                    onClick={onRejectCompletion}
                    disabled={completing}
                    className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    반려
                  </button>
                  <button
                    type="button"
                    onClick={onApproveCompletion}
                    disabled={completing}
                    className="rounded-lg border border-green-600 bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {statusLabel(approval.target_status, installation.delivery_type)}{" "}
                    {approval.status === "requested" ? "1차 승인" : "최종 승인"}
                  </button>
                </>
              )}
            </>
          )}
          {!!approvalNotes?.length && (
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  className="rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                >
                  비고 {approvalNotes.length}
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  align="start"
                  side="top"
                  sideOffset={6}
                  className="z-[80] w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
                >
                  <ApprovalNoteTimeline notes={approvalNotes} />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          )}
          {showTechReject && (
            <button
              type="button"
              onClick={onTechReject}
              className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50"
            >
              반려
            </button>
          )}
          {showPostHistory && (
            <button
              type="button"
              onClick={onOpenPostHistory}
              className="rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
            >
              완료 이후 메모
            </button>
          )}
          <HistoryButton onClick={onOpenHistory} size="small" />
          <div className="flex-1" />
          {showDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-50"
            >
              삭제
            </button>
          )}
          <button type="button" onClick={onSave} disabled={saving} className={primaryButton}>
            <Save size={14} /> {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </aside>
    </div>
  );
}
