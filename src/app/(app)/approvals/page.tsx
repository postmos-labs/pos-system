import { createClient } from "@/lib/supabase/server";
import { getSessionUser, getSessionProfile } from "@/lib/auth/session";
import { canApproveFirstBy, canApproveFinalBy } from "@/lib/auth/installApproval";
import { redirect } from "next/navigation";
import { AlertTriangle, ClipboardCheck } from "lucide-react";
import TransferApprovalList from "./TransferApprovalList";
import CompletionApprovalList from "./CompletionApprovalList";
import RejectedTransferItem from "./RejectedTransferItem";
import ApprovalLogSection from "./ApprovalLogSection";
import type { ApprovalNote } from "@/lib/approvalNotes";

type CompletionApproval = {
  installation_id: string;
  target_status: string;
  status: string;
  requested_by: string | null;
  requested_by_name: string;
  requested_at: string;
  approval_notes: ApprovalNote[];
  installation: {
    id: string;
    customer_name: string | null;
    address: string | null;
    franchise_application_id: string | null;
  } | null;
};

type TransferApproval = {
  franchise_application_id: string;
  requested_by: string | null;
  requested_by_name: string;
  requested_at: string;
  cs_approved_by_name: string | null;
  approval_notes: ApprovalNote[];
  franchise: {
    id: string;
    business_name: string | null;
    owner_name: string | null;
    address: string | null;
    phone: string | null;
    channel: string | null;
    reception_channel: string | null;
    reception_date: string | null;
    van_company: string | null;
  } | null;
};

type RejectedTransfer = {
  franchise_application_id: string;
  updated_at: string;
  rejection_reason: string | null;
  approval_notes: ApprovalNote[];
  franchise: {
    id: string;
    business_name: string | null;
    owner_name: string | null;
    address: string | null;
    phone: string | null;
  } | null;
};

const INSTALL_STEP_LABEL: Record<string, string> = {
  preparing: "제품준비",
  scheduled: "일정확정",
  in_transit: "출발",
  delivery_sent: "택배발송",
  completed: "완료",
};

// 승인 대기 목록에 몇 건까지 보일지. 5건이면 밀린 승인이 화면 밖으로 빠져
// 있는 줄도 모르고 지나치게 된다.
const APPROVAL_LIST_LIMIT = 50;

export default async function ApprovalsPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const profile = await getSessionProfile();
  if (!profile) redirect("/login");

  const p = profile;
  const userId = user.id;

  // 설치 단계 승인은 직급으로 갈린다(팀장 1차 → 실장 최종). 가맹접수 이관 승인은
  // 기존대로 승인 직책을 쓰므로 두 기준을 함께 본다.
  const canFirst = canApproveFirstBy(p);
  const canFinal = canApproveFinalBy(p);
  const isApprover =
    ["cs_responsible", "tech_responsible", "team_lead"].includes(p.approval_role ?? "") ||
    canFirst ||
    canFinal;

  // 단계별로 담당 직급만 처리한다 — 팀장은 1차, 실장은 최종.
  // 실장이 1차까지 하면 두 단계가 사실상 한 사람에게 몰려 검토가 형식이 된다.
  // 다만 관리자(admin/master)는 두 판정이 모두 참이라 1차·최종을 함께 본다 —
  // 담당 직급이 비어 결재가 통째로 멈췄을 때 풀 사람이 하나는 있어야 한다.
  const completionStatuses = [
    ...(canFirst ? ["requested"] : []),
    ...(canFinal ? ["responsible_approved"] : []),
  ];

  const completionApprovalQuery =
    completionStatuses.length > 0
      ? supabase
          .from("installation_completion_approvals")
          .select(
            "installation_id, target_status, status, requested_by, requested_by_name, requested_at, approval_notes, installation:installations(id, customer_name, address, franchise_application_id)",
          )
          .in("status", completionStatuses)
          // 요청자 계정이 삭제되면 requested_by가 NULL이 된다. neq만 쓰면 NULL 행이
          // 통째로 걸러져(NULL <> x → NULL) 승인함에서 사라지므로 NULL도 함께 남긴다.
          .or(`requested_by.is.null,requested_by.neq.${userId}`)
          .order("requested_at", { ascending: true })
          .limit(APPROVAL_LIST_LIMIT)
      : null;

  const transferApprovalQuery =
    p.approval_role === "cs_responsible" || p.approval_role === "team_lead"
      ? (() => {
          const query = supabase
            .from("franchise_transfer_approvals")
            .select(
              "franchise_application_id, requested_by, requested_by_name, requested_at, cs_approved_by_name, approval_notes, franchise:franchise_applications(id, business_name, owner_name, address, phone, channel, reception_channel, reception_date, van_company)",
            )
            .eq(
              "status",
              p.approval_role === "cs_responsible" ? "requested" : "cs_responsible_approved",
            );
          // CS책임 1차 승인은 요청자 본인이 승인할 수 없어 본인 건을 뺀다. 요청자가 삭제돼 NULL인 건도 남긴다.
          // 팀장은 본인이 올린 건도 직접 최종 승인할 수 있어 거르지 않는다.
          return (
            p.approval_role === "cs_responsible"
              ? query.or(`requested_by.is.null,requested_by.neq.${userId}`)
              : query
          )
            .order("requested_at", { ascending: true })
            .limit(APPROVAL_LIST_LIMIT);
        })()
      : null;

  const rejectedTransferQuery = supabase
    .from("franchise_transfer_approvals")
    .select(
      "franchise_application_id, updated_at, rejection_reason, approval_notes, franchise:franchise_applications(id, business_name, owner_name, address, phone)",
    )
    .eq("status", "rejected")
    .eq("requested_by", userId)
    .order("updated_at", { ascending: false })
    .limit(APPROVAL_LIST_LIMIT);

  const [completionApprovalsResult, transferApprovalsResult, rejectedTransfersResult] =
    await Promise.all([
      completionApprovalQuery ?? Promise.resolve({ data: [] as CompletionApproval[] }),
      transferApprovalQuery ?? Promise.resolve({ data: [] as TransferApproval[] }),
      rejectedTransferQuery,
    ]);

  const completionApprovals = (completionApprovalsResult.data ?? []) as CompletionApproval[];
  const transferApprovals = (transferApprovalsResult.data ?? []) as TransferApproval[];
  const rejectedTransfers = (rejectedTransfersResult.data ?? []) as unknown as RejectedTransfer[];

  // 설치 단계 승인 목록의 인입경로. 연결된 가맹접수의 channel을 먼저 쓰고, 없으면 설치건에 직접 지정한 channel을 쓴다.
  // 설치건 channel 칸(156번 마이그레이션)이 아직 없어도 승인함이 죽지 않도록 따로 조회하고 실패는 무시한다.
  const completionInstallIds = completionApprovals.map((a) => a.installation_id);
  const completionFranchiseIds = completionApprovals
    .map((a) => a.installation?.franchise_application_id)
    .filter((id): id is string => !!id);
  const [franchiseChannelResult, installChannelResult] = await Promise.all([
    completionFranchiseIds.length > 0
      ? supabase
          .from("franchise_applications")
          .select("id, channel, reception_channel")
          .in("id", completionFranchiseIds)
      : Promise.resolve({ data: [] }),
    completionInstallIds.length > 0
      ? supabase.from("installations").select("id, channel").in("id", completionInstallIds)
      : Promise.resolve({ data: [] }),
  ]);
  const franchiseChannelById = new Map(
    (
      (franchiseChannelResult.data ?? []) as {
        id: string;
        channel: string | null;
        reception_channel: string | null;
      }[]
    ).map((row) => [row.id, row]),
  );
  const installChannelById = new Map(
    ((installChannelResult.data ?? []) as { id: string; channel: string | null }[]).map((row) => [
      row.id,
      row.channel,
    ]),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-slate-900">승인함</h1>

      {isApprover && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-4">
            <ClipboardCheck size={18} className="text-blue-600" />
            <div>
              <h2 className="font-bold text-slate-900">승인 대기 항목</h2>
              <p className="mt-0.5 text-xs text-slate-500">내 승인이 필요한 요청입니다.</p>
            </div>
          </div>
          {completionApprovals.length > 0 || transferApprovals.length > 0 ? (
            <>
              {completionApprovals.length > 0 && (
                <CompletionApprovalList
                  items={completionApprovals.map((approval) => {
                    const franchise = approval.installation?.franchise_application_id
                      ? franchiseChannelById.get(approval.installation.franchise_application_id)
                      : undefined;
                    return {
                      installationId: approval.installation_id,
                      customerName: approval.installation?.customer_name ?? null,
                      requesterName: approval.requested_by_name,
                      stepLabel:
                        INSTALL_STEP_LABEL[approval.target_status] ?? approval.target_status,
                      isFinal: approval.status === "responsible_approved",
                      channel:
                        franchise?.channel ??
                        installChannelById.get(approval.installation_id) ??
                        null,
                      receptionChannel: franchise?.reception_channel ?? null,
                      notes: approval.approval_notes,
                    };
                  })}
                />
              )}
              {transferApprovals.length > 0 && (
                <TransferApprovalList
                  items={transferApprovals.map((approval) => ({
                    id: approval.franchise_application_id,
                    businessName: approval.franchise?.business_name ?? null,
                    ownerName: approval.franchise?.owner_name ?? null,
                    address: approval.franchise?.address ?? null,
                    phone: approval.franchise?.phone ?? null,
                    channel: approval.franchise?.channel ?? null,
                    receptionChannel: approval.franchise?.reception_channel ?? null,
                    receptionDate: approval.franchise?.reception_date ?? null,
                    vanCompany: approval.franchise?.van_company ?? null,
                    requesterName: approval.requested_by_name,
                    csApproverName: approval.cs_approved_by_name,
                    notes: approval.approval_notes,
                  }))}
                  approvalRole={p.approval_role as "cs_responsible" | "team_lead"}
                />
              )}
              {(completionApprovals.length >= APPROVAL_LIST_LIMIT ||
                transferApprovals.length >= APPROVAL_LIST_LIMIT) && (
                <p className="border-t border-slate-100 bg-amber-50 px-6 py-2.5 text-xs text-amber-700">
                  승인 대기가 {APPROVAL_LIST_LIMIT}건 이상이라 오래된 {APPROVAL_LIST_LIMIT}건만
                  보입니다. 먼저 처리하면 다음 건이 나타납니다.
                </p>
              )}
            </>
          ) : (
            <div className="px-6 py-4 text-sm text-slate-500">승인 대기 중인 요청이 없습니다.</div>
          )}
        </section>
      )}

      {rejectedTransfers.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-red-100 px-6 py-4">
            <AlertTriangle size={18} className="text-red-600" />
            <div>
              <h2 className="font-bold text-slate-900">반려된 이관 요청</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                반려 사유를 확인하고 다시 요청해주세요.
              </p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {rejectedTransfers.map((item) => (
              <RejectedTransferItem
                key={item.franchise_application_id}
                id={item.franchise_application_id}
                businessName={item.franchise?.business_name ?? null}
                ownerName={item.franchise?.owner_name ?? null}
                notes={item.approval_notes}
              />
            ))}
          </div>
        </section>
      )}

      <ApprovalLogSection />
    </div>
  );
}
