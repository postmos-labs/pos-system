"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  approveCsResponsibleTransfer,
  approveFranchiseTransfer,
  rejectFranchiseTransfer,
} from "./actions";
import {
  approveInstallationCompletion,
  approveInstallationStatusByTeamLead,
  rejectInstallationStatusApproval,
} from "../installs/actions";
import {
  INSTALLATION_DELIVERY_TYPE_OPTIONS,
  type InstallationDeliveryType,
} from "@/lib/installationDeliveryType";
import ApprovalNoteTimeline from "@/components/ui/ApprovalNoteTimeline";
import type { ApprovalNote } from "@/lib/approvalNotes";

export default function ApprovalButton({
  type,
  id,
  notes = [],
}: {
  type: "completion" | "tech_final" | "cs_transfer" | "transfer";
  id: string;
  notes?: ApprovalNote[];
}) {
  const [isPending, startTransition] = useTransition();
  const [isRejecting, startRejectTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const [showApproval, setShowApproval] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [deliveryType, setDeliveryType] = useState<InstallationDeliveryType | "">("");
  const [note, setNote] = useState("");

  function reject() {
    startRejectTransition(async () => {
      const result =
        type === "cs_transfer" || type === "transfer"
          ? await rejectFranchiseTransfer(id, rejectReason)
          : await rejectInstallationStatusApproval(id, rejectReason);
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
      setShowReject(false);
      setRejectReason("");
      router.refresh();
    });
  }

  function approve() {
    if (type === "transfer" && !deliveryType) return;
    startTransition(async () => {
      const result =
        type === "completion"
          ? await approveInstallationCompletion(id, note)
          : type === "tech_final"
            ? await approveInstallationStatusByTeamLead(id, note)
            : type === "cs_transfer"
              ? await approveCsResponsibleTransfer(id, note)
              : await approveFranchiseTransfer(id, deliveryType as InstallationDeliveryType, note);
      if (result.error) {
        toast.error(`승인 실패: ${result.error}`);
        return;
      }
      if ("notificationError" in result && result.notificationError) {
        const notificationName =
          type === "completion"
            ? "팀장 팝업 알림"
            : type === "tech_final"
              ? "고객 알림톡"
              : type === "cs_transfer"
                ? "팀장 팝업 알림"
                : "기술지원 내부 알림";
        toast.warning(
          `승인은 완료됐지만 ${notificationName} 발송에 실패했습니다: ${result.notificationError}`,
        );
      }
      toast.success(
        type === "completion"
          ? "기술지원책임 1차 승인 완료. 팀장 최종 승인을 기다립니다."
          : type === "tech_final"
            ? "팀장 최종 승인으로 상태가 반영되었습니다."
            : type === "cs_transfer"
              ? "CS책임 승인 완료. 팀장 최종 승인을 기다립니다."
              : "승인되어 기술지원으로 이관되었습니다.",
      );
      setShowApproval(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setRejectReason("");
          setShowReject(true);
        }}
        disabled={isRejecting}
        className="flex shrink-0 items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {isRejecting ? "처리 중" : "반려"}
      </button>
      <button
        type="button"
        onClick={() => {
          setDeliveryType("");
          setNote("");
          setShowApproval(true);
        }}
        disabled={isPending}
        className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        <Check size={14} /> {isPending ? "처리 중" : "승인"}
      </button>
      {showReject && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !isRejecting && setShowReject(false)}
        >
          <section
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-slate-900">승인요청 반려</h2>
            <p className="mt-1 text-sm text-slate-500">
              요청자에게 전달할 반려 사유를 입력해주세요. (선택 사항)
            </p>
            <label className="mt-4 block text-sm font-semibold text-slate-700">반려 사유</label>
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="반려 사유를 입력해주세요."
              className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
            />
            <p className="mt-1 text-right text-xs text-slate-400">{rejectReason.length}/2,000</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReject(false)}
                disabled={isRejecting}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={reject}
                disabled={isRejecting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isRejecting ? "반려 중..." : "반려 처리"}
              </button>
            </div>
          </section>
        </div>
      )}
      {showApproval && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !isPending && setShowApproval(false)}
        >
          <section
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-slate-900">승인 및 비고 전달</h2>
            <p className="mt-1 text-sm text-slate-500">
              이전 비고를 확인하고 다음 담당자에게 전달할 내용을 입력해주세요.
            </p>
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <ApprovalNoteTimeline notes={notes} />
            </div>
            {type === "transfer" && (
              <>
                <label className="mt-4 block text-sm font-semibold text-slate-700">
                  이관 구분 <span className="text-red-500">*</span>
                </label>
                <select
                  value={deliveryType}
                  onChange={(event) =>
                    setDeliveryType(event.target.value as InstallationDeliveryType | "")
                  }
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">구분을 선택해주세요</option>
                  {INSTALLATION_DELIVERY_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </>
            )}
            <label className="mt-4 block text-sm font-semibold text-slate-700">전달 비고</label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="다음 승인자가 확인할 내용을 입력해주세요. (선택 사항)"
              className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <p className="mt-1 text-right text-xs text-slate-400">{note.length}/2,000</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowApproval(false)}
                disabled={isPending}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={approve}
                disabled={(type === "transfer" && !deliveryType) || isPending}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {isPending ? "승인 중..." : "비고 남기고 승인"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
