"use client";

import { useState } from "react";
import FormModal from "@/components/ui/FormModal";
import { useToast } from "@/components/ui/Toast";
import { INSTALL_METHOD_BADGE, INSTALL_METHOD_LABEL, installMethodOf } from "@/lib/installMethod";
import { completeShipment } from "./actions";
import type { Installation } from "./InstallsClient";

interface Props {
  installation: Installation;
  onClose: () => void;
  onDone: (patch: { tracking_number: string | null; shipment_completed_at: string | null }) => void;
}

// 자가설치·외부기사 건의 [택배발송] — 상태는 그대로 두고 발송완료 표시만 남긴다. 송장번호는 비워도 된다.
export default function ShipmentModal({ installation, onClose, onDone }: Props) {
  const toast = useToast();
  const [trackingNumber, setTrackingNumber] = useState(installation.tracking_number ?? "");
  const [submitting, setSubmitting] = useState(false);
  const method = installMethodOf(installation);

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await completeShipment({
        installationId: installation.id,
        trackingNumber: trackingNumber.trim() || null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("발송 완료 처리했습니다.");
      if (result.inventoryWarning) toast.warning(result.inventoryWarning);
      if (result.notificationError) toast.warning(`알림톡 발송 실패: ${result.notificationError}`);
      onDone({
        tracking_number: result.trackingNumber ?? (trackingNumber.trim() || null),
        shipment_completed_at: result.shipmentCompletedAt ?? new Date().toISOString(),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal title="택배발송" onClose={onClose} zIndexClassName="z-[60]">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900">{installation.customer_name}</span>
          {method && (
            <span
              className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${INSTALL_METHOD_BADGE[method]}`}
            >
              {INSTALL_METHOD_LABEL[method]}
            </span>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold text-slate-700">발송 장비</p>
          {installation.items?.length > 0 ? (
            <ul className="space-y-1">
              {installation.items.map((item, index) => (
                <li
                  key={`${item.name}-${index}`}
                  className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"
                >
                  {item.name} × {item.quantity}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">등록된 장비가 없습니다.</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">송장번호</label>
          <input
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="송장번호 (없으면 비워두세요)"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          {method === "self" && (
            <p className="mt-1.5 text-xs text-slate-500">
              송장번호를 넣으면 고객에게 송장 안내 알림톡이 나갑니다.
            </p>
          )}
          {method === "external" && (
            <p className="mt-1.5 text-xs text-slate-500">외부기사 건은 알림톡을 보내지 않습니다.</p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "처리 중..." : "발송 완료"}
          </button>
        </div>
      </div>
    </FormModal>
  );
}
