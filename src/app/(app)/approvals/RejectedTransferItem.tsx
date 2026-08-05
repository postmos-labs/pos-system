"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import ApprovalNoteTimeline from "@/components/ui/ApprovalNoteTimeline";
import type { ApprovalNote } from "@/lib/approvalNotes";
import { requestFranchiseTransfer } from "./actions";

type Props = {
  id: string;
  businessName: string | null;
  ownerName: string | null;
  notes: ApprovalNote[];
};

export default function RejectedTransferItem({ id, businessName, ownerName, notes }: Props) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const title = businessName || ownerName || "가맹 접수 건";
  const rejectionNote = [...notes]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .find((n) => n.stage === "rejection");

  function requestAgain() {
    if (!note.trim()) return;
    startTransition(async () => {
      const result = await requestFranchiseTransfer(id, note);
      if (result.error) {
        toast.error(`승인요청 실패: ${result.error}`);
        return;
      }
      if (result.notificationError) {
        toast.warning(
          "승인요청은 등록됐지만 알림 전송에 실패했습니다: " + result.notificationError,
        );
      }
      toast.success("이관 승인요청을 다시 등록했습니다.");
      setOpen(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full min-w-0 items-center gap-4 px-6 py-3.5 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 truncate">{title}</p>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {rejectionNote ? `${rejectionNote.author_name} · ${rejectionNote.content}` : "반려됨"}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600">
          <RotateCcw size={13} /> 다시 요청
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !isPending && setOpen(false)}
        >
          <section
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-semibold text-red-600">반려된 이관 요청</p>
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
            <div className="px-6 py-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">승인 비고 이력</h3>
              <ApprovalNoteTimeline notes={notes} />
            </div>
            <div className="border-t border-slate-100 px-6 py-4">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                다음 승인자에게 전달할 비고 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="재요청 사유를 입력하세요."
                className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <p className="mt-1 text-right text-xs text-slate-400">{note.length}/2,000</p>
            </div>
            <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
              <Link
                href={`/franchise?highlight=${id}`}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                가맹접수로 이동
              </Link>
              <button
                type="button"
                onClick={requestAgain}
                disabled={!note.trim() || isPending}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? "요청 중..." : "비고 남기고 다시 요청"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
