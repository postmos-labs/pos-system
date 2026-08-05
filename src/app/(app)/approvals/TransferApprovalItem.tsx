"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import ApprovalButton from "./ApprovalButton";
import { rejectFranchiseTransfer } from "./actions";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import ApprovalNoteTimeline from "@/components/ui/ApprovalNoteTimeline";
import type { ApprovalNote } from "@/lib/approvalNotes";

type Props = {
  id: string;
  businessName: string | null;
  ownerName: string | null;
  address: string | null;
  phone: string | null;
  requesterName: string;
  csApproverName: string | null;
  approvalRole: "cs_responsible" | "team_lead";
  notes: ApprovalNote[];
};

export default function TransferApprovalItem({
  id,
  businessName,
  ownerName,
  address,
  phone,
  requesterName,
  csApproverName,
  approvalRole,
  notes,
}: Props) {
  const [open, setOpen] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const [isRejecting, startRejectTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const title = businessName || ownerName || "가맹 접수 건";
  const isTeamLead = approvalRole === "team_lead";
  const approvalName = isTeamLead ? csApproverName || requesterName : requesterName;
  const approvalText = isTeamLead ? "팀장 최종 승인요청" : "CS책임 승인요청";
  const approvalType = isTeamLead ? "transfer" : "cs_transfer";

  function reject() {
    startRejectTransition(async () => {
      const result = await rejectFranchiseTransfer(id, reason);
      if (result.error) {
        toast.error(`반려 실패: ${result.error}`);
        return;
      }
      if (result.notificationError) {
        toast.warning(
          "반려 처리되었지만 요청자 알림 전송에 실패했습니다: " + result.notificationError,
        );
      }
      toast.success("승인 요청을 반려했습니다.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-w-0 flex-1 items-center gap-4 text-left"
      >
        <span className="w-2 h-2 rounded-full bg-amber-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 truncate">{title}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {approvalName} · {approvalText}
          </p>
        </div>
        <ArrowRight size={16} className="text-slate-400" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <section
            className="w-full max-w-lg rounded-2xl bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-semibold text-blue-600">승인 대기 상세</p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">{title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="닫기"
              >
                <X size={20} />
              </button>
            </header>
            <dl className="grid grid-cols-[96px_1fr] gap-x-4 gap-y-3 px-6 py-5 text-sm">
              <dt className="text-slate-500">승인 단계</dt>
              <dd className="font-medium text-slate-900">{approvalText}</dd>
              <dt className="text-slate-500">요청자</dt>
              <dd className="text-slate-900">{requesterName}</dd>
              {isTeamLead && (
                <>
                  <dt className="text-slate-500">이관 구분</dt>
                  <dd className="font-semibold text-blue-700">최종 승인 시 선택</dd>
                </>
              )}
              {isTeamLead && (
                <>
                  <dt className="text-slate-500">CS책임 승인자</dt>
                  <dd className="text-slate-900">{csApproverName || "-"}</dd>
                </>
              )}
              <dt className="text-slate-500">대표자</dt>
              <dd className="text-slate-900">{ownerName || "-"}</dd>
              <dt className="text-slate-500">연락처</dt>
              <dd className="text-slate-900">{phone || "-"}</dd>
              <dt className="text-slate-500">주소</dt>
              <dd className="break-words text-slate-900">{address || "-"}</dd>
            </dl>
            <div className="border-t border-slate-100 px-6 py-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">승인 비고 이력</h3>
              <ApprovalNoteTimeline notes={notes} />
            </div>
            {showReject && (
              <div className="border-t border-slate-100 px-6 py-4">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">반려 사유</label>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  placeholder="반려 사유를 입력하세요."
                  className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReject(false)}
                    className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={reject}
                    disabled={isRejecting}
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {isRejecting ? "처리 중" : "반려 처리"}
                  </button>
                </div>
              </div>
            )}
            <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
              <Link
                href={`/franchise?highlight=${id}`}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                가맹접수로 이동
              </Link>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowReject((value) => !value)}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  반려
                </button>
                <ApprovalButton type={approvalType} id={id} notes={notes} />
              </div>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
