"use client";

import { XIcon } from "lucide-react";
import type { EquipmentItem } from "@/types";
import InstallCompositionSection from "../merchants/InstallCompositionSection";
import {
  computeEquipmentCategorySummaries,
  type MerchantEquipmentItem,
} from "../merchants/merchant360";
import {
  STATUS_COLORS,
  STATUS_ORDER_INSTALL,
  STATUS_LABELS,
  statusLabel,
  statusOrderFor,
} from "./installStatus";

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

export interface InstallStatusInfo {
  status: string;
  delivery_type?: string;
}

interface Props {
  loading: boolean;
  detail: InstallFranchiseDetail | null;
  installation: InstallStatusInfo | null;
  merchantId: string | null;
  installationId?: string;
  equipment: MerchantEquipmentItem[];
  onClose: () => void;
}

// StageProgress(FranchiseDetailDrawer)와 같은 5단계 축. STATUS_ORDER_INSTALL의 라벨을
// 그대로 쓴다(접수/물품준비/일정확정/이동중/완료).
const STAGES = STATUS_ORDER_INSTALL.map((status) => STATUS_LABELS[status]);

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

// delivery_type='delivery'(택배발송) 흐름은 접수→물품준비→택배발송→완료 4단계뿐이라
// (일정확정·이동중이 없음) STAGES 5단계 축에 상태값이 그대로 대응되지 않는다. 그래서
// statusOrderFor(deliveryType)로 해당 배송유형의 실제 상태 순서를 구한 뒤, 그 안에서
// 현재 상태의 위치를 5단계 축에 비례 배분한다 — 택배발송(delivery_sent, 구버전 데이터의
// in_transit 포함)은 축 뒤쪽("이동중" 위치)에 놓이고 "일정확정" 노드는 지나간 것으로만
// 표시된다. 정확한 상태 문구는 별도 뱃지가 statusLabel()로 그대로 보여주므로, 스테퍼는
// 대략적인 진행 위치를 보여주는 보조 요소로만 근사치를 허용했다. status가 순서에 없는
// 값(예: rejected)이면 진행 표시를 하지 않는다(null).
function stageIndex(status: string, deliveryType?: string) {
  const order = statusOrderFor(deliveryType);
  const position = order.indexOf(status);
  if (position < 0) return null;
  if (order.length <= 1) return 0;
  return Math.round((position / (order.length - 1)) * (STAGES.length - 1));
}

function InstallStageProgress({ status, deliveryType }: { status: string; deliveryType?: string }) {
  const stage = stageIndex(status, deliveryType);
  const tone = STAGE_TONE[status] ?? DEFAULT_STAGE_TONE;
  const fraction = (index: number) => index / (STAGES.length - 1);
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
        {STAGES.map((label, index) => (
          <div
            key={label}
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

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <p className="text-foreground text-sm break-words">{value}</p>
    </div>
  );
}

export default function InstallDetailDrawer({
  loading,
  detail,
  installation,
  merchantId,
  installationId,
  equipment,
  onClose,
}: Props) {
  const loaded = !loading && !!detail && Object.keys(detail).length > 0;
  const headerTitle = loading
    ? "불러오는 중..."
    : loaded
      ? detail?.business_name || "-"
      : "정보를 불러올 수 없습니다";
  const headerSubtitle = loaded
    ? [detail?.owner_name, detail?.phone].filter(Boolean).join(" · ")
    : "";

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
                {headerTitle}
              </div>
              {headerSubtitle && (
                <div className="text-muted-foreground mt-1 text-[13.5px]">{headerSubtitle}</div>
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
          {loaded && installation && (
            <>
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
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <p className="text-muted-foreground py-8 text-center text-sm">불러오는 중...</p>
          ) : loaded && detail ? (
            <div className="flex flex-col gap-5">
              {[
                detail.business_name,
                detail.owner_name,
                detail.phone,
                detail.business_number,
                detail.address,
                detail.address_detail,
              ].some(Boolean) && (
                <div>
                  <div className="text-foreground mb-2.5 text-[13px] font-bold">기본정보</div>
                  <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
                    <Field label="상호명" value={detail.business_name} />
                    <Field label="대표자" value={detail.owner_name} />
                    <Field label="연락처" value={detail.phone} />
                    <Field label="사업자번호" value={detail.business_number} />
                    <Field label="주소" value={detail.address} />
                    <Field label="상세주소" value={detail.address_detail} />
                  </div>
                </div>
              )}

              {[detail.open_date, detail.install_date].some(Boolean) && (
                <div>
                  <div className="text-foreground mb-2.5 text-[13px] font-bold">일정</div>
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <Field label="오픈예정일" value={detail.open_date} />
                    <Field label="설치발송일" value={detail.install_date} />
                  </div>
                </div>
              )}

              {[detail.van_company, detail.internet].some(Boolean) && (
                <div>
                  <div className="text-foreground mb-2.5 text-[13px] font-bold">연동</div>
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <Field label="VAN사" value={detail.van_company} />
                    <Field label="인터넷" value={detail.internet} />
                  </div>
                </div>
              )}

              {[detail.sales?.name, detail.cs?.name].some(Boolean) && (
                <div>
                  <div className="text-foreground mb-2.5 text-[13px] font-bold">담당</div>
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <Field label="담당영업" value={detail.sales?.name} />
                    <Field label="담당CS" value={detail.cs?.name} />
                  </div>
                </div>
              )}

              {detail.equipment_items && detail.equipment_items.length > 0 && (
                <div>
                  <p className="text-muted-foreground text-xs font-semibold">
                    접수 장비 (주문 내역)
                  </p>
                  <p className="text-foreground mt-1 text-sm">
                    {detail.equipment_items
                      .map((item) => `${item.name} x${item.quantity}`)
                      .join(", ")}
                  </p>
                </div>
              )}

              {detail.memo && (
                <div>
                  <p className="text-muted-foreground text-xs font-semibold">비고</p>
                  <p className="text-foreground mt-1 text-sm whitespace-pre-wrap">{detail.memo}</p>
                </div>
              )}

              <div className="border-border space-y-3 border-t pt-4">
                <p className="text-muted-foreground text-xs font-semibold">
                  실제 설치 구성 (현장 확정 기준 — 접수 장비와 다를 수 있음)
                </p>
                <InstallCompositionSection
                  merchantId={merchantId}
                  installationId={installationId}
                  equipment={equipment}
                  categorySummaries={computeEquipmentCategorySummaries(equipment)}
                  totalEquipmentSets={equipment
                    .filter((item) => item.status !== "removed")
                    .reduce((sum, item) => sum + (item.quantity ?? 1), 0)}
                />
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center text-sm">
              정보를 불러올 수 없습니다.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
