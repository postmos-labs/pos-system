"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  INSTALLATION_DELIVERY_TYPE_LABEL,
  isInstallationDeliveryType,
  type InstallationDeliveryType,
} from "@/lib/installationDeliveryType";
import { appendApprovalNote, parseApprovalNotes, validateApprovalNote } from "@/lib/approvalNotes";

async function getApprover(requiredRole: "cs_responsible" | "tech_responsible" | "team_lead") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, approval_role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.approval_role !== requiredRole) return { error: "승인 권한이 없습니다." };

  return { user, profile };
}

export async function requestFranchiseTransfer(franchiseApplicationId: string, note: string) {
  if (validateApprovalNote(note) === null) return { error: "비고는 2,000자 이하로 입력해주세요." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, approval_role")
    .eq("id", user.id)
    .single();
  if (!profile || !["cs_manager", "cs_responsible"].includes(profile.approval_role ?? "")) {
    return { error: "이관 승인요청 권한이 없습니다." };
  }
  const admin = createAdminClient();
  const [{ data: franchise }, { data: existingApproval }, { data: existingInstall }] =
    await Promise.all([
      admin
        .from("franchise_applications")
        .select("status")
        .eq("id", franchiseApplicationId)
        .single(),
      admin
        .from("franchise_transfer_approvals")
        .select(
          "id,status,delivery_type,requested_by,requested_by_name,requested_at,approved_by,approved_by_name,approved_at,cs_approved_by,cs_approved_by_name,cs_approved_at,rejection_reason,approval_notes",
        )
        .eq("franchise_application_id", franchiseApplicationId)
        .maybeSingle(),
      admin
        .from("installations")
        .select("status")
        .eq("franchise_application_id", franchiseApplicationId)
        .maybeSingle(),
    ]);
  if (!franchise) return { error: "가맹접수를 찾을 수 없습니다." };
  if (
    existingApproval &&
    existingApproval.status !== "rejected" &&
    existingInstall?.status !== "rejected"
  ) {
    return { error: "이미 이관 승인요청이 존재합니다." };
  }

  const requestedAt = new Date().toISOString();
  const requestedByResponsible = profile.approval_role === "cs_responsible";
  const approvalStatus: "requested" | "cs_responsible_approved" = requestedByResponsible
    ? "cs_responsible_approved"
    : "requested";
  const approvalValues = {
    franchise_application_id: franchiseApplicationId,
    status: approvalStatus,
    delivery_type: null,
    requested_by: user.id,
    requested_by_name: profile.name,
    requested_at: requestedAt,
    approved_by: null,
    approved_by_name: null,
    approved_at: null,
    cs_approved_by: requestedByResponsible ? user.id : null,
    cs_approved_by_name: requestedByResponsible ? profile.name : null,
    cs_approved_at: requestedByResponsible ? requestedAt : null,
    rejection_reason: null,
    approval_notes: appendApprovalNote(
      existingApproval?.approval_notes,
      {
        id: user.id,
        name: profile.name,
        role: profile.approval_role!,
      },
      note,
      "request",
    ),
  };
  const approvalResult = existingApproval
    ? await admin
        .from("franchise_transfer_approvals")
        .update(approvalValues)
        .eq("id", existingApproval.id)
        .select("id")
        .single()
    : await admin.from("franchise_transfer_approvals").insert(approvalValues).select("id").single();
  const { data: approval, error: approvalError } = approvalResult;
  if (approvalError || !approval)
    return { error: approvalError?.message ?? "승인요청 저장에 실패했습니다." };

  const requestLogs = [
    {
      franchise_application_id: franchiseApplicationId,
      user_id: user.id,
      from_status: franchise.status,
      to_status: "transfer_approval_requested",
    },
    ...(requestedByResponsible
      ? [
          {
            franchise_application_id: franchiseApplicationId,
            user_id: user.id,
            from_status: "transfer_approval_requested",
            to_status: "transfer_cs_responsible_approved",
          },
        ]
      : []),
  ];
  const { error: logError } = await admin.from("franchise_application_logs").insert(requestLogs);
  if (logError) {
    if (existingApproval) {
      await admin
        .from("franchise_transfer_approvals")
        .update({
          status: existingApproval.status,
          delivery_type: existingApproval.delivery_type,
          requested_by: existingApproval.requested_by,
          requested_by_name: existingApproval.requested_by_name,
          requested_at: existingApproval.requested_at,
          approved_by: existingApproval.approved_by,
          approved_by_name: existingApproval.approved_by_name,
          approved_at: existingApproval.approved_at,
          cs_approved_by: existingApproval.cs_approved_by,
          cs_approved_by_name: existingApproval.cs_approved_by_name,
          cs_approved_at: existingApproval.cs_approved_at,
          rejection_reason: existingApproval.rejection_reason,
          approval_notes: existingApproval.approval_notes,
        })
        .eq("id", approval.id);
    } else {
      await admin.from("franchise_transfer_approvals").delete().eq("id", approval.id);
    }
    return { error: "감사 로그 저장에 실패해 승인요청을 취소했습니다: " + logError.message };
  }
  const nextApprovalRole = requestedByResponsible ? "team_lead" : "cs_responsible";
  const { data: approvers } = await admin
    .from("profiles")
    .select("id")
    .eq("approval_role", nextApprovalRole)
    .neq("id", user.id);
  const { error: notificationError } = approvers?.length
    ? await admin.from("notifications").insert(
        approvers.map(({ id }) => ({
          user_id: id,
          franchise_application_id: franchiseApplicationId,
          type: requestedByResponsible ? "approval_team_lead_transfer" : "approval_cs_transfer",
          title: requestedByResponsible
            ? "[최종 승인요청] 기술지원 이관"
            : "[승인요청] 기술지원 이관",
          body: requestedByResponsible
            ? `${profile.name ?? "CS책임"}님이 팀장 최종 승인을 요청했습니다.`
            : `${profile.name ?? "CS 담당자"}님이 CS책임 승인을 요청했습니다.`,
        })),
      )
    : { error: null };

  return { error: null, approvalStatus, notificationError: notificationError?.message ?? null };
}

export async function approveCsResponsibleTransfer(franchiseApplicationId: string, note: string) {
  if (validateApprovalNote(note) === null) return { error: "비고는 2,000자 이하로 입력해주세요." };
  const approver = await getApprover("cs_responsible");
  if ("error" in approver) return approver;

  const admin = createAdminClient();
  const { data: approval } = await admin
    .from("franchise_transfer_approvals")
    .select("requested_by, approval_notes")
    .eq("franchise_application_id", franchiseApplicationId)
    .eq("status", "requested")
    .single();
  if (!approval) return { error: "처리할 승인 요청이 없습니다." };
  if (approval.requested_by === approver.user.id)
    return { error: "요청자는 직접 승인할 수 없습니다." };

  const { error } = await admin
    .from("franchise_transfer_approvals")
    .update({
      status: "cs_responsible_approved",
      cs_approved_by: approver.user.id,
      cs_approved_by_name: approver.profile.name,
      cs_approved_at: new Date().toISOString(),
      approval_notes: appendApprovalNote(
        approval.approval_notes,
        {
          id: approver.user.id,
          name: approver.profile.name,
          role: "cs_responsible",
        },
        note,
        "first_approval",
      ),
    })
    .eq("franchise_application_id", franchiseApplicationId)
    .eq("status", "requested");
  if (!error) {
    const { error: logError } = await admin.from("franchise_application_logs").insert({
      franchise_application_id: franchiseApplicationId,
      user_id: approver.user.id,
      from_status: "transfer_approval_requested",
      to_status: "transfer_cs_responsible_approved",
    });
    if (logError) {
      await admin
        .from("franchise_transfer_approvals")
        .update({
          status: "requested",
          cs_approved_by: null,
          cs_approved_by_name: null,
          cs_approved_at: null,
          approval_notes: approval.approval_notes,
        })
        .eq("franchise_application_id", franchiseApplicationId)
        .eq("status", "cs_responsible_approved");
      return { error: "감사 로그 저장에 실패해 승인을 취소했습니다: " + logError.message };
    }
  }
  if (error) return { error: error.message };

  const { data: approvers } = await admin
    .from("profiles")
    .select("id")
    .eq("approval_role", "team_lead")
    .neq("id", approver.user.id)
    .neq("id", approval.requested_by);
  const { error: notificationError } = approvers?.length
    ? await admin.from("notifications").insert(
        approvers.map(({ id }) => ({
          user_id: id,
          franchise_application_id: franchiseApplicationId,
          type: "approval_team_lead_transfer",
          title: "[최종 승인요청] 기술지원 이관",
          body: `${approver.profile.name ?? "CS책임"}님이 1차 승인했습니다. 팀장 최종 승인과 이관 구분 선택이 필요합니다.`,
        })),
      )
    : { error: null };

  return { error: null, notificationError: notificationError?.message ?? null };
}

export async function rejectFranchiseTransfer(franchiseApplicationId: string, reason: string) {
  const trimmedReason = reason.trim();
  if (trimmedReason.length > 2000) return { error: "반려 사유는 2,000자 이하로 입력해주세요." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, approval_role")
    .eq("id", user.id)
    .single();
  const expectedStatus =
    profile?.approval_role === "cs_responsible"
      ? "requested"
      : profile?.approval_role === "team_lead"
        ? "cs_responsible_approved"
        : null;
  if (!expectedStatus) return { error: "반려 권한이 없습니다." };

  const admin = createAdminClient();
  const { data: approval } = await admin
    .from("franchise_transfer_approvals")
    .select("requested_by, rejection_reason, approval_notes")
    .eq("franchise_application_id", franchiseApplicationId)
    .eq("status", expectedStatus)
    .single();
  if (!approval) return { error: "처리할 승인 요청이 없습니다." };
  if (approval.requested_by === user.id) return { error: "요청자는 직접 반려할 수 없습니다." };

  const { error } = await admin
    .from("franchise_transfer_approvals")
    .update({
      status: "rejected",
      rejection_reason: trimmedReason || null,
      approval_notes: trimmedReason
        ? appendApprovalNote(
            approval.approval_notes,
            {
              id: user.id,
              name: profile?.name ?? null,
              role: expectedStatus === "requested" ? "cs_responsible" : "team_lead",
            },
            reason,
            "rejection",
          )
        : parseApprovalNotes(approval.approval_notes),
    })
    .eq("franchise_application_id", franchiseApplicationId)
    .eq("status", expectedStatus);
  if (error) return { error: error.message };

  const { error: logError } = await admin.from("franchise_application_logs").insert({
    franchise_application_id: franchiseApplicationId,
    user_id: user.id,
    from_status:
      expectedStatus === "requested"
        ? "transfer_approval_requested"
        : "transfer_cs_responsible_approved",
    to_status:
      expectedStatus === "requested"
        ? "transfer_cs_responsible_rejected"
        : "transfer_team_lead_rejected",
    details: { rejection_reason: trimmedReason || null },
  });
  if (logError) {
    await admin
      .from("franchise_transfer_approvals")
      .update({
        status: expectedStatus,
        rejection_reason: approval.rejection_reason,
        approval_notes: approval.approval_notes,
      })
      .eq("franchise_application_id", franchiseApplicationId)
      .eq("status", "rejected");
    return { error: "감사 로그 저장에 실패해 반려를 취소했습니다: " + logError.message };
  }

  const { error: notificationError } = await admin.from("notifications").insert({
    user_id: approval.requested_by,
    franchise_application_id: franchiseApplicationId,
    type: "approval_transfer_rejected",
    title: "[반려] 기술지원 이관 승인요청",
    body: trimmedReason
      ? `${profile?.name ?? "승인자"}님이 이관 승인요청을 반려했습니다. 사유: ${trimmedReason}`
      : `${profile?.name ?? "승인자"}님이 이관 승인요청을 반려했습니다.`,
  });

  return { error: null, notificationError: notificationError?.message ?? null };
}

export async function approveFranchiseTransfer(
  franchiseApplicationId: string,
  deliveryType: InstallationDeliveryType,
  note: string,
) {
  if (validateApprovalNote(note) === null) return { error: "비고는 2,000자 이하로 입력해주세요." };
  const approver = await getApprover("team_lead");
  if ("error" in approver) return approver;
  if (!isInstallationDeliveryType(deliveryType)) {
    return { error: "최종 승인할 이관 구분을 선택해주세요." };
  }

  const admin = createAdminClient();
  const [{ data: approval }, { data: franchise }] = await Promise.all([
    admin
      .from("franchise_transfer_approvals")
      .select("requested_by,approval_notes")
      .eq("franchise_application_id", franchiseApplicationId)
      .eq("status", "cs_responsible_approved")
      .single(),
    admin
      .from("franchise_applications")
      .select(
        "id, business_name, owner_name, phone, equipment_items, memo, address, install_date, status",
      )
      .eq("id", franchiseApplicationId)
      .single(),
  ]);
  if (!approval || !franchise) return { error: "처리할 승인 요청이 없습니다." };
  if (approval.requested_by === approver.user.id)
    return { error: "요청자는 직접 승인할 수 없습니다." };

  const { data: existingInstall } = await admin
    .from("installations")
    .select("id, status")
    .eq("franchise_application_id", franchiseApplicationId)
    .maybeSingle();
  if (existingInstall && existingInstall.status !== "rejected")
    return { error: "이미 기술지원으로 이관된 접수입니다." };

  const approvedAt = new Date().toISOString();
  const { error: approvalError } = await admin
    .from("franchise_transfer_approvals")
    .update({
      status: "approved",
      delivery_type: deliveryType,
      approved_by: approver.user.id,
      approved_by_name: approver.profile.name,
      approved_at: approvedAt,
      approval_notes: appendApprovalNote(
        approval.approval_notes,
        {
          id: approver.user.id,
          name: approver.profile.name,
          role: "team_lead",
        },
        note,
        "final_approval",
      ),
    })
    .eq("franchise_application_id", franchiseApplicationId)
    .eq("status", "cs_responsible_approved");
  if (approvalError) return { error: approvalError.message };

  const installValues = {
    customer_name: franchise.business_name || franchise.owner_name || "미입력",
    customer_phone: franchise.phone || null,
    items: franchise.equipment_items ?? [],
    status: "received",
    delivery_type: deliveryType,
    notes: franchise.memo || null,
    franchise_application_id: franchise.id,
    address: franchise.address || null,
    scheduled_date: franchise.install_date || null,
    created_by: approver.user.id,
    sort_order: Date.now(),
    updated_at: approvedAt,
  };
  const installResult = existingInstall
    ? await admin
        .from("installations")
        .update(installValues)
        .eq("id", existingInstall.id)
        .select("id")
        .single()
    : await admin.from("installations").insert(installValues).select("id").single();
  const { data: savedInstall, error: installError } = installResult;
  if (installError) {
    await admin
      .from("franchise_transfer_approvals")
      .update({
        status: "cs_responsible_approved",
        delivery_type: null,
        approved_by: null,
        approved_by_name: null,
        approved_at: null,
        approval_notes: approval.approval_notes,
      })
      .eq("franchise_application_id", franchiseApplicationId);
    return { error: installError.message };
  }

  const { data: installActivity, error: installActivityError } = await admin
    .from("installation_activity_logs")
    .insert({
      installation_id: savedInstall.id,
      user_id: approver.user.id,
      action: existingInstall ? "status_changed" : "created",
      from_status: existingInstall ? "rejected" : null,
      to_status: "received",
      approval_id: null,
      details: {
        source: "franchise_transfer",
        franchise_application_id: franchise.id,
        delivery_type: deliveryType,
      },
    })
    .select("id")
    .single();
  if (installActivityError || !installActivity) {
    if (existingInstall)
      await admin.from("installations").update({ status: "rejected" }).eq("id", existingInstall.id);
    else await admin.from("installations").delete().eq("id", savedInstall.id);
    await admin
      .from("franchise_transfer_approvals")
      .update({
        status: "cs_responsible_approved",
        delivery_type: null,
        approved_by: null,
        approved_by_name: null,
        approved_at: null,
        approval_notes: approval.approval_notes,
      })
      .eq("franchise_application_id", franchiseApplicationId)
      .eq("status", "approved");
    return {
      error:
        "설치건 감사 로그 저장에 실패해 이관을 취소했습니다: " +
        (installActivityError?.message ?? "알 수 없는 오류"),
    };
  }

  const { error: logError } = await admin.from("franchise_application_logs").insert([
    {
      franchise_application_id: franchise.id,
      user_id: approver.user.id,
      from_status: "transfer_cs_responsible_approved",
      to_status: "transfer_team_lead_approved",
      details: { delivery_type: deliveryType },
    },
    {
      franchise_application_id: franchise.id,
      user_id: approver.user.id,
      from_status: franchise.status,
      to_status: existingInstall ? "install_retransfer" : "install_transfer",
      details: { delivery_type: deliveryType },
    },
  ]);
  if (logError) {
    await admin.from("installation_activity_logs").delete().eq("id", installActivity.id);
    if (existingInstall) {
      await admin.from("installations").update({ status: "rejected" }).eq("id", existingInstall.id);
    } else if (savedInstall) {
      await admin.from("installations").delete().eq("id", savedInstall.id);
    }
    await admin
      .from("franchise_transfer_approvals")
      .update({
        status: "cs_responsible_approved",
        delivery_type: null,
        approved_by: null,
        approved_by_name: null,
        approved_at: null,
        approval_notes: approval.approval_notes,
      })
      .eq("franchise_application_id", franchiseApplicationId)
      .eq("status", "approved");
    return { error: "감사 로그 저장에 실패해 이관을 취소했습니다: " + logError.message };
  }

  const { data: techProfiles } = await admin.from("profiles").select("id").eq("role", "tech");
  const { error: notificationError } = techProfiles?.length
    ? await admin.from("notifications").insert(
        techProfiles.map((tech) => ({
          user_id: tech.id,
          franchise_application_id: franchise.id,
          type: "install_transfer",
          title: `[${franchise.business_name || franchise.owner_name || "미입력"}] 기술지원 ${existingInstall ? "재이관" : "이관"}`,
          body: `팀장 최종 승인으로 ${INSTALLATION_DELIVERY_TYPE_LABEL[deliveryType]} 구분의 설치건이 ${existingInstall ? "재이관" : "이관"}되었습니다.`,
        })),
      )
    : { error: null };

  return { error: null, notificationError: notificationError?.message ?? null };
}
