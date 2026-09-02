"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { requestTicketRevision } from "../actions";

// 자주 쓰는 사유를 미리 넣어두고 고르면 내용이 채워진다. 그대로 보내도 되고 고쳐 써도 된다.
const PRESETS = [
  {
    label: "해결 절차에 이번 건 상황이 적힘",
    text: "해결 절차 칸에 이번 건에서 있었던 일이 적혀 있습니다. 해결 절차는 챗봇 학습에 쓰이므로 다른 가맹점에도 그대로 통하는 순서로 바꿔주세요. 이번 건 상황은 처리 내용 칸에 옮겨주세요.",
  },
  {
    label: "가맹점 이름·연락처가 들어감",
    text: "해결 절차에 가맹점 이름이나 연락처가 들어가 있습니다. 챗봇이 다른 문의에도 그대로 답하게 되니 특정 가맹점 정보는 빼고 문제와 해결 순서만 남겨주세요.",
  },
  {
    label: "우리가 한 행동이 절차로 적힘",
    text: "'유선으로 안내했다', '전화드렸다'처럼 우리가 한 행동이 해결 절차에 적혀 있습니다. 이는 처리 내용에 적고, 해결 절차에는 무엇을 확인하고 어떻게 푸는지만 남겨주세요.",
  },
  {
    label: "처리 내용이 비어 있음",
    text: "처리 내용이 비어 있습니다. 이번 건에 무슨 일이 있었고 어떻게 마무리했는지 적어주세요.",
  },
  {
    label: "내용이 너무 짧아 알 수 없음",
    text: "내용이 짧아 무슨 문제였는지 알 수 없습니다. 고객이 겪은 증상과 확인한 내용을 구체적으로 적어주세요.",
  },
];

export default function RevisionRequestButton({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  function openModal() {
    setMessage("");
    setOpen(true);
  }

  // 고른 사유를 이어 붙인다. 여러 개를 골라 한 번에 보낼 수 있게 덧붙이는 방식으로 둔다.
  function applyPreset(text: string) {
    setMessage((prev) => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));
  }

  async function send() {
    const trimmed = message.trim();
    if (!trimmed) return;
    setSending(true);
    const result = await requestTicketRevision(ticketId, trimmed);
    setSending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`수정 요청을 보냈습니다 (${result.sentCount ?? 0}명)`);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-50"
      >
        <AlertTriangle size={14} /> 수정 요청
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4">
          <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
              <p className="text-base font-bold text-slate-900">수정 요청 보내기</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="닫기">
                <X size={18} className="text-slate-400 hover:text-slate-600" />
              </button>
            </div>

            {/* 본문에 min-h-0가 없으면 내용이 길어질 때 아래 버튼이 화면 밖으로 밀린다. */}
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
              <p className="text-sm text-slate-500">
                담당자에게 알림이 갑니다. 아래에서 사유를 고르면 내용이 채워지고, 그대로 보내거나
                고쳐 쓰실 수 있습니다.
              </p>

              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applyPreset(preset.text)}
                    className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={7}
                placeholder="위에서 사유를 고르거나 직접 입력해주세요."
                className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400"
              />
              <p className="text-right text-xs text-slate-400">{message.trim().length}/1,000</p>
            </div>

            <div className="flex flex-shrink-0 justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={send}
                disabled={sending || !message.trim()}
                className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
              >
                {sending ? "보내는 중..." : "보내기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
