"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import {
  INSTALL_METHODS,
  INSTALL_METHOD_BADGE,
  INSTALL_METHOD_LABEL,
  installMethodOf,
  isShippingFlow,
  type InstallMethod,
} from "@/lib/installMethod";
import { setInstallMethod } from "./actions";
import type { Installation } from "./InstallsClient";
import ShipmentModal from "./ShipmentModal";

interface Props {
  installation: Installation;
  canEdit: boolean;
  onPatched: (patch: Partial<Installation>) => void;
}

// 설치건 상세 — 설치 방식(방문설치 / 자가설치 / 외부기사) 선택과 택배 흐름 건의 [택배발송].
export default function InstallMethodSection({ installation, canEdit, onPatched }: Props) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [shipmentOpen, setShipmentOpen] = useState(false);
  const current = installMethodOf(installation);
  if (!current) return null;

  const status = installation.status;
  const type = installation.delivery_type ?? "install";
  let disabledReason = "";
  if (!canEdit) disabledReason = "수정 권한이 없습니다.";
  else if (status !== "received" && status !== "preparing")
    disabledReason = "접수·제품준비 단계에서만 바꿀 수 있습니다.";
  else if (!["install", "delivery", "transfer"].includes(type))
    disabledReason = "설치·택배발송·전환 건에서만 바꿀 수 있습니다.";

  async function handleSelect(method: InstallMethod) {
    if (method === current || saving || disabledReason) return;
    setSaving(true);
    const result = await setInstallMethod({ installationId: installation.id, method });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    onPatched({ install_method: method, delivery_type: result.deliveryType });
  }

  const shipping = isShippingFlow(installation);
  const canShip = shipping && canEdit && !["completed", "canceled", "rejected"].includes(status);

  return (
    <div className="border-border space-y-2 border-t pt-4">
      <p className="text-sm font-semibold text-slate-700">설치 방식</p>
      <div className="flex gap-1.5">
        {INSTALL_METHODS.map((method) => {
          const active = method === current;
          return (
            <button
              key={method}
              type="button"
              disabled={!!disabledReason || saving}
              title={disabledReason || undefined}
              onClick={() => handleSelect(method)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
                active
                  ? `${INSTALL_METHOD_BADGE[method]} ring-1 ring-current`
                  : "border-slate-200 bg-white text-slate-500"
              } ${disabledReason && !active ? "opacity-50" : ""}`}
            >
              {INSTALL_METHOD_LABEL[method]}
            </button>
          );
        })}
      </div>
      {canShip && (
        <button
          type="button"
          onClick={() => setShipmentOpen(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          택배발송
        </button>
      )}
      {shipping && status === "completed" && (
        <p className="text-sm text-slate-700">
          ✅ 발송완료
          {installation.tracking_number ? ` · 송장번호 ${installation.tracking_number}` : ""}
        </p>
      )}
      {shipmentOpen && (
        <ShipmentModal
          installation={installation}
          onClose={() => setShipmentOpen(false)}
          onDone={(patch) => {
            setShipmentOpen(false);
            onPatched({
              status: patch.status,
              tracking_number: patch.tracking_number ?? undefined,
            });
          }}
        />
      )}
    </div>
  );
}
