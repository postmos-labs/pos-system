import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ClipboardCheck } from "lucide-react";
import ApprovalButton from "./ApprovalButton";
import TransferApprovalItem from "./TransferApprovalItem";
import RejectedTransferItem from "./RejectedTransferItem";
import ApprovalLogSection from "./ApprovalLogSection";
import type { ApprovalNote } from "@/lib/approvalNotes";
import type { Profile } from "@/types";

type CompletionApproval = {
  installation_id: string;
  target_status: string;
  status: string;
  requested_by: string | null;
  requested_by_name: string;
  requested_at: string;
  approval_notes: ApprovalNote[];
  installation: { id: string; customer_name: string | null; address: string | null } | null;
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

export default async function ApprovalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");

  const p = profile as Profile;
  const userId = user.id;

  const isApprover = ["cs_responsible", "tech_responsible", "team_lead"].includes(
    p.approval_role ?? "",
  );

  const completionApprovalQuery =
    p.approval_role === "tech_responsible" || p.approval_role === "team_lead"
      ? supabase
          .from("installation_completion_approvals")
          .select(
            "installation_id, target_status, status, requested_by, requested_by_name, requested_at, approval_notes, installation:installations(id, customer_name, address)",
          )
          .in("status", p.approval_role === "team_lead" ? ["responsible_approved"] : ["requested"])
          // 요청자 계정이 삭제되면 requested_by가 NULL이 된다. neq만 쓰면 NULL 행이
          // 통째로 걸러져(NULL <> x → NULL) 승인함에서 사라지므로 NULL도 함께 남긴다.
          .or(`requested_by.is.null,requested_by.neq.${userId}`)
          .order("requested_at", { ascending: true })
          .limit(5)
      : null;

  const transferApprovalQuery =
    p.approval_role === "cs_responsible" || p.approval_role === "team_lead"
      ? supabase
          .from("franchise_transfer_approvals")
          .select(
            "franchise_application_id, requested_by, requested_by_name, requested_at, cs_approved_by_name, approval_notes, franchise:franchise_applications(id, business_name, owner_name, address, phone)",
          )
          .eq(
            "status",
            p.approval_role === "cs_responsible" ? "requested" : "cs_responsible_approved",
          )
          // 위와 같은 이유로 요청자가 삭제된 건(NULL)도 승인함에 남긴다.
          .or(`requested_by.is.null,requested_by.neq.${userId}`)
          .order("requested_at", { ascending: true })
          .limit(5)
      : null;

  const rejectedTransferQuery = supabase
    .from("franchise_transfer_approvals")
    .select(
      "franchise_application_id, updated_at, rejection_reason, approval_notes, franchise:franchise_applications(id, business_name, owner_name, address, phone)",
    )
    .eq("status", "rejected")
    .eq("requested_by", userId)
    .order("updated_at", { ascending: false })
    .limit(5);

  const [completionApprovalsResult, transferApprovalsResult, rejectedTransfersResult] =
    await Promise.all([
      completionApprovalQuery ?? Promise.resolve({ data: [] as CompletionApproval[] }),
      transferApprovalQuery ?? Promise.resolve({ data: [] as TransferApproval[] }),
      rejectedTransferQuery,
    ]);

  const completionApprovals = (completionApprovalsResult.data ?? []) as CompletionApproval[];
  const transferApprovals = (transferApprovalsResult.data ?? []) as TransferApproval[];
  const rejectedTransfers = (rejectedTransfersResult.data ?? []) as unknown as RejectedTransfer[];

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
                <div className="divide-y divide-slate-100">
                  {completionApprovals.map((approval) => (
                    <div
                      key={approval.installation_id}
                      className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-slate-50"
                    >
                      <Link
                        href={`/installs?id=${approval.installation_id}`}
                        className="flex min-w-0 flex-1 items-center gap-4"
                      >
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {approval.installation?.customer_name ?? "설치 건"}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {approval.requested_by_name} ·{" "}
                            {INSTALL_STEP_LABEL[approval.target_status] ?? approval.target_status}{" "}
                            {approval.status === "responsible_approved" ? "최종 " : "1차 "}승인요청
                          </p>
                        </div>
                        <ArrowRight size={16} className="text-slate-400" />
                      </Link>
                      <ApprovalButton
                        type={
                          approval.status === "responsible_approved" ? "tech_final" : "completion"
                        }
                        id={approval.installation_id}
                        notes={approval.approval_notes}
                      />
                    </div>
                  ))}
                </div>
              )}
              {transferApprovals.length > 0 && (
                <div className="divide-y divide-slate-100">
                  {transferApprovals.map((approval) => (
                    <div
                      key={approval.franchise_application_id}
                      className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-slate-50"
                    >
                      <TransferApprovalItem
                        id={approval.franchise_application_id}
                        businessName={approval.franchise?.business_name ?? null}
                        ownerName={approval.franchise?.owner_name ?? null}
                        address={approval.franchise?.address ?? null}
                        phone={approval.franchise?.phone ?? null}
                        requesterName={approval.requested_by_name}
                        csApproverName={approval.cs_approved_by_name}
                        approvalRole={p.approval_role as "cs_responsible" | "team_lead"}
                        notes={approval.approval_notes}
                      />
                      <ApprovalButton
                        type={p.approval_role === "cs_responsible" ? "cs_transfer" : "transfer"}
                        id={approval.franchise_application_id}
                        notes={approval.approval_notes}
                      />
                    </div>
                  ))}
                </div>
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
