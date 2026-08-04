import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendInstallStatusUpdate } from "@/lib/solapi";

type InstallationNotification = {
  id: string;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_type: string | null;
  status_token: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  tracking_number: string | null;
};

function notificationStatus(deliveryType: string | null, status: string) {
  if (deliveryType === "delivery" && (status === "preparing" || status === "completed"))
    return null;
  if (deliveryType === "as" && status !== "in_transit") return null;

  const value = deliveryType === "delivery" && status === "in_transit" ? "delivery_sent" : status;
  return ["preparing", "scheduled", "in_transit", "completed", "delivery_sent"].includes(value)
    ? value
    : null;
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "***";
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

export async function sendApprovedInstallNotification({
  installationId,
  status,
  userId,
  eta,
  requireStatusMatch = true,
}: {
  installationId: string;
  status: string;
  userId: string;
  eta?: string;
  requireStatusMatch?: boolean;
}) {
  const admin = createAdminClient();
  const { data, error: lookupError } = await admin
    .from("installations")
    .select(
      "id, status, customer_name, customer_phone, delivery_type, status_token, scheduled_date, scheduled_time, tracking_number",
    )
    .eq("id", installationId)
    .single();

  if (lookupError || !data) return { error: lookupError?.message ?? "설치건을 찾을 수 없습니다." };

  const installation = data as InstallationNotification;
  if (requireStatusMatch && installation.status !== status)
    return { error: "현재 설치 상태와 알림톡 발송 상태가 다릅니다." };
  const templateKey = notificationStatus(installation.delivery_type, status);
  if (!templateKey) return { error: null };
  if (!installation.customer_phone || !installation.customer_name) {
    const message = "고객명 또는 연락처가 없어 알림톡을 발송하지 못했습니다.";
    const { error: logError } = await admin.from("notification_logs").insert({
      entity_type: "install",
      entity_id: installationId,
      template_key: templateKey,
      status: "failed",
      error: message,
      recipient_masked: installation.customer_phone ? maskPhone(installation.customer_phone) : null,
      user_id: userId,
    });
    return { error: logError ? `${message} (실패 로그 저장 오류: ${logError.message})` : message };
  }

  try {
    const providerMessageId = await sendInstallStatusUpdate({
      phone: installation.customer_phone.replace(/\D/g, ""),
      customerName: installation.customer_name,
      status: templateKey,
      eta,
      statusToken: installation.status_token ?? undefined,
      scheduledDate: installation.scheduled_date ?? undefined,
      scheduledTime: installation.scheduled_time ?? undefined,
      trackingNumber: installation.tracking_number ?? undefined,
    });

    if (!providerMessageId) {
      // 아직 템플릿이 없는 승인 단계는 상태만 반영하고 발송 이력은 비워둡니다.
      return { error: null };
    }

    const sentAt = new Date().toISOString();
    const { error: logError } = await admin.from("notification_logs").insert({
      entity_type: "install",
      entity_id: installationId,
      template_key: templateKey,
      status: "sent",
      recipient_masked: maskPhone(installation.customer_phone),
      provider_message_id: providerMessageId,
      user_id: userId,
    });
    if (logError)
      return { error: `알림톡은 발송됐지만 감사 로그 저장에 실패했습니다: ${logError.message}` };

    const { error: notifyStateError } = await admin
      .from("installations")
      .update({ last_notify_status: templateKey, last_notify_at: sentAt })
      .eq("id", installationId);
    if (notifyStateError)
      return {
        error: `발송 로그는 저장됐지만 최종 발송 상태 갱신에 실패했습니다: ${notifyStateError.message}`,
      };
    return { error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "알림톡 발송에 실패했습니다.";
    const { error: failureLogError } = await admin.from("notification_logs").insert({
      entity_type: "install",
      entity_id: installationId,
      template_key: templateKey,
      status: "failed",
      error: message,
      recipient_masked: maskPhone(installation.customer_phone),
      user_id: userId,
    });
    return {
      error: failureLogError
        ? `${message} (실패 로그 저장 오류: ${failureLogError.message})`
        : message,
    };
  }
}
