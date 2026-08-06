"use client";

import { createClient } from "@/lib/supabase/client";
import { APPLICANT_TYPE_LABEL, FRANCHISE_STATUS_LABEL } from "@/types";
import type { FranchiseApplication, FranchiseStatus } from "@/types";
import type { DocCase } from "@/lib/solapi";

export interface StatusEffectsToast {
  success: (msg: string) => void;
  warning: (msg: string) => void;
  error: (msg: string) => void;
}

export function docCaseOf(ownerName?: string | null, businessName?: string | null): DocCase {
  if (ownerName && businessName) return "both";
  if (businessName) return "business_only";
  if (ownerName) return "owner_only";
  return "phone_only";
}

export function buildFranchiseStatusPatch(
  row: FranchiseApplication,
  status: FranchiseStatus,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { status };
  if (status === "doc_waiting") patch.doc_template = APPLICANT_TYPE_LABEL[row.applicant_type];
  return patch;
}

export async function notifyAndLogFranchiseStatus(
  franchiseId: string,
  logKey: string,
  payload: Record<string, unknown>,
  currentUserId: string,
  toast: StatusEffectsToast,
): Promise<void> {
  try {
    const res = await fetch("/api/franchise/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      console.error("가맹 알림톡 발송 실패:", json.error);
      toast.error(`알림톡 발송 실패: ${json.error ?? res.status} (상태는 변경됨)`);
      return;
    }
    const supabase = createClient();
    await supabase.from("franchise_application_logs").insert({
      franchise_application_id: franchiseId,
      user_id: currentUserId,
      to_status: `alimtalk:${logKey}`,
    });
    toast.success("알림톡이 발송되었습니다.");
  } catch (err) {
    console.error("가맹 알림톡 발송 실패:", err);
    toast.error("알림톡 발송에 실패했습니다. 고객에게 직접 안내해주세요.");
  }
}

interface ApplyStatusSideEffectsParams {
  row: FranchiseApplication;
  status: FranchiseStatus;
  sendNotify: boolean;
  docCase?: DocCase;
  currentUserId: string;
  toast: StatusEffectsToast;
}

export async function applyFranchiseStatusSideEffects(
  params: ApplyStatusSideEffectsParams,
): Promise<{ linkedInstall?: { id: string; status: string } }> {
  const { row, status, sendNotify, docCase, currentUserId, toast } = params;

  if (sendNotify) {
    if (status === "doc_waiting") {
      await notifyAndLogFranchiseStatus(
        row.id,
        "doc_waiting",
        {
          type: "status_update",
          phone: row.phone,
          ownerName: row.owner_name,
          businessName: row.business_name,
          status: "doc_waiting",
        },
        currentUserId,
        toast,
      );
      await notifyAndLogFranchiseStatus(
        row.id,
        "doc_request",
        {
          type: "doc_request",
          phone: row.phone,
          ownerName: row.owner_name,
          businessName: row.business_name,
          applicantType: row.applicant_type,
          docCase,
        },
        currentUserId,
        toast,
      );
    } else if (status === "card_internet_apply_done") {
      await notifyAndLogFranchiseStatus(
        row.id,
        "card_apply_done",
        {
          type: "status_update",
          phone: row.phone,
          ownerName: row.owner_name,
          businessName: row.business_name,
          status: "card_apply_done",
        },
        currentUserId,
        toast,
      );
    } else {
      await notifyAndLogFranchiseStatus(
        row.id,
        status,
        {
          type: "status_update",
          phone: row.phone,
          ownerName: row.owner_name,
          businessName: row.business_name,
          status,
          equipmentSelectToken: row.equipment_select_token,
        },
        currentUserId,
        toast,
      );
    }
  }

  // merchants 생성/갱신은 기술지원 이관 시 installations에 발생하는
  // 101번 마이그레이션의 DB 트리거가 전담한다. 접수 상태 변경만으로는 생성하지 않는다.

  return {};
}

export function franchiseStatusChangeConfirm(
  row: FranchiseApplication,
  newStatus: FranchiseStatus,
): { msg: string; canNotify: boolean } {
  const silentStatus =
    newStatus === "completed" ||
    newStatus === "hold" ||
    newStatus === "persistent_absence" ||
    newStatus === "canceled";
  const canNotify = !silentStatus && !!row.phone;
  const confirmMsg =
    newStatus === "completed"
      ? `'완료'로 상태만 변경됩니다. (고객 안내 메시지는 발송되지 않습니다)`
      : newStatus === "hold"
        ? `'보류'로 상태만 변경됩니다. (고객 안내 메시지는 발송되지 않습니다)`
        : newStatus === "persistent_absence"
          ? `'지속적 부재'로 상태만 변경됩니다. (고객 안내 메시지는 발송되지 않습니다)`
          : newStatus === "canceled"
            ? `'취소'로 상태만 변경됩니다. (고객 안내 메시지는 발송되지 않습니다)`
            : newStatus === "doc_waiting"
              ? `'${APPLICANT_TYPE_LABEL[row.applicant_type]}' 서류 안내 메시지가 고객에게 발송됩니다. 진행하시겠습니까?`
              : `'${FRANCHISE_STATUS_LABEL[newStatus]}'(으)로 변경하면 고객에게 메시지가 발송됩니다.`;
  return {
    msg: silentStatus
      ? confirmMsg
      : canNotify
        ? confirmMsg
        : "연락처가 없어 메시지 발송 없이 상태만 변경됩니다.",
    canNotify,
  };
}
