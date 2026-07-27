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

export async function autoRegisterMerchant(
  row: FranchiseApplication,
  toast: StatusEffectsToast,
): Promise<void> {
  if (!row.business_name || !row.owner_name || !row.phone) {
    toast.warning(
      "상호명·대표자명·연락처가 모두 입력되지 않아 가맹점을 자동으로 등록하지 못했습니다. 직접 등록해주세요.",
    );
    return;
  }
  const supabase = createClient();
  const { data: existing } = await supabase
    .from("merchants")
    .select("id")
    .eq("franchise_application_id", row.id)
    .maybeSingle();
  if (existing) return;

  const { error } = await supabase.from("merchants").insert({
    business_name: row.business_name,
    owner_name: row.owner_name,
    business_number: row.business_number || null,
    phone: row.phone,
    address: row.address || null,
    address_detail: row.address_detail || null,
    pos_model: row.equipment_items?.length
      ? row.equipment_items.map((i) => `${i.name} x${i.quantity}`).join(", ")
      : null,
    sales_id: row.sales_id || null,
    memo: row.memo || null,
    franchise_application_id: row.id,
  });

  if (error) toast.error("가맹점 자동 등록 실패: " + error.message);
}

export async function autoTransferToTech(
  row: FranchiseApplication,
  currentUserId: string,
  existing: { id: string; status: string } | undefined,
): Promise<{ id: string; status: string } | null> {
  if (existing && existing.status !== "rejected") return null;
  const supabase = createClient();
  let installId: string;
  if (existing?.status === "rejected") {
    const { error } = await supabase
      .from("installations")
      .update({ status: "received", updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return null;
    installId = existing.id;
  } else {
    const { data, error } = await supabase
      .from("installations")
      .insert({
        customer_name: row.business_name || row.owner_name || "미입력",
        customer_phone: row.phone || null,
        items: row.equipment_items ?? [],
        status: "received",
        notes: row.memo || null,
        franchise_application_id: row.id,
        address: row.address || null,
        scheduled_date: row.install_date || null,
        created_by: currentUserId,
        sort_order: Date.now(),
      })
      .select("id")
      .single();
    if (error) return null;
    installId = data.id;
  }
  const { data: techUsers } = await supabase.from("profiles").select("id").eq("role", "tech");
  if (techUsers?.length) {
    const { error: notifyError } = await supabase.from("notifications").insert(
      techUsers.map((t) => ({
        user_id: t.id,
        franchise_application_id: row.id,
        type: "install_transfer",
        title: `[${row.business_name || row.owner_name || "미입력"}] 설치 자동 이관`,
        body: "카드가맹완료로 설치건이 자동 생성되었습니다.",
      })),
    );
    if (notifyError) console.error("기술팀 알림 발송 실패:", notifyError.message);
  }
  return { id: installId, status: "received" };
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

  if (status === "card_done" || status === "toss_review_done") {
    await autoRegisterMerchant(row, toast);
  }

  return {};
}

export function franchiseStatusChangeConfirm(
  row: FranchiseApplication,
  newStatus: FranchiseStatus,
): { msg: string; canNotify: boolean } {
  const silentStatus = newStatus === "completed" || newStatus === "hold";
  const canNotify = !silentStatus && !!row.phone;
  const confirmMsg =
    newStatus === "completed"
      ? `'완료'로 상태만 변경됩니다. (고객 안내 메시지는 발송되지 않습니다)`
      : newStatus === "hold"
        ? `'보류'로 상태만 변경됩니다. (고객 안내 메시지는 발송되지 않습니다)`
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
